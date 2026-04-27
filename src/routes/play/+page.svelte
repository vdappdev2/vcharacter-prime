<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';
	import type { StoredCharacter, CharacterStats } from '$lib/types';
	import type { GameState, GameChoice, Enemy, CombatRoundResult, SkillCheck } from '$lib/game/types';
	import {
		createGameState,
		advanceScene,
		getPathChoices,
		choosePath,
		initGuardianCombat,
		getPuzzleChecks,
		canChooseBoth,
		applyBargainChoice,
		initBossCombat,
		setOutcome,
		generateAchievement,
		applyDamage,
		applyHealing,
		useSpiritAbilityFlag,
		addBuff,
	} from '$lib/game/engine';
	import {
		calculateMaxHp,
		resolveCombatRound,
		isCombatOver,
		getCombatOutcome,
		useSpiritAbility,
	} from '$lib/game/combat';
	import { generateRollSeed, hashRollSeed, combineGameSeed, deriveGameRoll } from '$lib/game/dice';
	import type { PathChoice, BargainChoice } from '$lib/game/engine';

	// ========== State ==========
	type ViewState = 'select-identity' | 'select-character' | 'playing' | 'game-over';

	let viewState: ViewState = 'select-identity';
	let error: string | null = null;

	// Identity/Character selection
	let identityInput = '';
	let characters: Array<{
		name: string;
		rollBlockHeight: number;
		traits: { element: string; spirit: string; sex: string };
	}> = [];
	let selectedCharacter: StoredCharacter | null = null;
	let loadingCharacters = false;

	// Game state
	let gameState: GameState | null = null;

	// Combat animation
	let combatMessage = '';
	let showingCombatResult = false;
	let lastRoundResult: CombatRoundResult | null = null;

	// Puzzle state
	let currentPuzzleIndex = 0;
	let puzzleResults: Array<{ check: SkillCheck; success: boolean; narrative: string }> = [];

	// Scene-specific state
	let bargainRollResult: number | null = null;
	let canGetBoth = false;

	// ========== Deterministic Dice State (verifiable replay) ==========
	let sceneSeed: string = '';
	let sceneSeedHash: string = '';
	let sceneBlockHeight: number = 0;
	let sceneBlockHash: string = '';
	let waitingForBlock: boolean = false;
	let currentBlockHeight: number = 0;
	let rollCounter: number = 0;
	let blockPollTimeout: ReturnType<typeof setTimeout> | null = null;

	// ========== Boss Fight Proof State (for achievement) ==========
	let bossSceneSeed: string = '';
	let bossSceneBlockHeight: number = 0;
	let bossSceneBlockHash: string = '';
	let bossPlayerActions: ('attack' | 'defend' | 'special')[] = [];
	let bossRoundsToWin: number = 0;

	// ========== Achievement Storage State ==========
	let achievementRequestId: string = '';
	let achievementDeeplinkUri: string = '';
	let achievementQrDataUrl: string = '';
	let achievementStored: boolean = false;
	let achievementTxid: string = '';
	let achievementVerified: boolean = false;
	let storingAchievement: boolean = false;
	let achievementPollTimeout: ReturnType<typeof setTimeout> | null = null;

	// Lets a refresh resume mid-achievement-storage polling (e.g. when the
	// desktop's network drops while the wallet has already signed and our
	// callback wrote to Redis). Mirrors the storage recovery on the main page.
	const ACHIEVEMENT_STATE_KEY = 'vcharacter_achievement_state';

	interface PersistedAchievementState {
		requestId: string;
		deeplinkUri: string;
		gameState: GameState;
		identity: string;
	}

	function saveAchievementState() {
		if (!achievementRequestId || !gameState) return;
		const payload: PersistedAchievementState = {
			requestId: achievementRequestId,
			deeplinkUri: achievementDeeplinkUri,
			gameState,
			identity: identityInput.trim(),
		};
		sessionStorage.setItem(ACHIEVEMENT_STATE_KEY, JSON.stringify(payload));
	}

	function clearAchievementState() {
		sessionStorage.removeItem(ACHIEVEMENT_STATE_KEY);
	}

	function loadAchievementState(): PersistedAchievementState | null {
		try {
			const raw = sessionStorage.getItem(ACHIEVEMENT_STATE_KEY);
			return raw ? (JSON.parse(raw) as PersistedAchievementState) : null;
		} catch {
			return null;
		}
	}

	function handleVisibilityChange() {
		if (document.visibilityState !== 'visible') return;
		if (blockPollTimeout && waitingForBlock) startBlockPolling(true);
		if (achievementPollTimeout && !achievementStored) startAchievementPolling(true);
	}

	onMount(() => {
		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Resume an interrupted achievement-storage flow if we left state behind
		// in sessionStorage. Same recovery pattern as the main page's storage
		// flow — handles the case where the desktop's network dropped while the
		// wallet had already completed and Redis had the result waiting.
		void (async () => {
			const persisted = loadAchievementState();
			if (!persisted) return;
			achievementRequestId = persisted.requestId;
			achievementDeeplinkUri = persisted.deeplinkUri;
			gameState = persisted.gameState;
			identityInput = persisted.identity;
			if (persisted.deeplinkUri) {
				try {
					achievementQrDataUrl = await QRCode.toDataURL(persisted.deeplinkUri, {
						width: 512,
						margin: 2,
						errorCorrectionLevel: 'L',
						color: { dark: '#000000', light: '#ffffff' },
					});
				} catch {
					// Non-fatal — polling can still complete without the QR.
				}
			}
			viewState = 'game-over';
			startAchievementPolling(true);
		})();

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	onDestroy(() => {
		if (blockPollTimeout) clearTimeout(blockPollTimeout);
		if (achievementPollTimeout) clearTimeout(achievementPollTimeout);
	});

	// ========== Deterministic Dice Functions ==========
	async function commitToScene(): Promise<void> {
		// Generate a new seed for this scene
		sceneSeed = generateRollSeed();
		sceneSeedHash = await hashRollSeed(sceneSeed);
		rollCounter = 0;

		// Get current block height
		const response = await fetch('/api/game/block');
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || 'Failed to get block height');
		}

		// We'll use block N+1 for randomness
		sceneBlockHeight = data.currentHeight + 1;
		currentBlockHeight = data.currentHeight;
		sceneBlockHash = '';
		waitingForBlock = true;

		// Start polling for the block
		startBlockPolling();
	}

	function startBlockPolling(immediate = false) {
		if (blockPollTimeout) {
			clearTimeout(blockPollTimeout);
		}

		blockPollTimeout = setTimeout(async function poll() {
			try {
				const response = await fetch(`/api/game/block?waitFor=${sceneBlockHeight}`);
				const data = await response.json();

				currentBlockHeight = data.currentHeight;

				if (data.ready) {
					sceneBlockHash = data.blockHash;
					waitingForBlock = false;
					blockPollTimeout = null;
				} else {
					blockPollTimeout = setTimeout(poll, 3000);
				}
			} catch (err) {
				console.error('Block polling error:', err);
				blockPollTimeout = setTimeout(poll, 3000);
			}
		}, immediate ? 0 : 3000);
	}

	async function deriveRoll(label: string, dieSize: number): Promise<number> {
		if (!sceneBlockHash || !sceneSeed) {
			throw new Error('Scene not committed - no block hash available');
		}

		// Create unique label for this roll
		const uniqueLabel = `${label}_${rollCounter}`;
		rollCounter++;

		// Derive the roll
		const combinedSeed = await combineGameSeed(sceneBlockHash, sceneSeed);
		return deriveGameRoll(combinedSeed, uniqueLabel, dieSize);
	}

	// ========== Character Loading ==========
	async function lookupIdentity() {
		if (!identityInput.trim()) {
			error = 'Please enter a VerusID';
			return;
		}

		loadingCharacters = true;
		error = null;
		characters = [];

		try {
			const response = await fetch(`/api/character/list?identity=${encodeURIComponent(identityInput.trim())}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to lookup identity');
			}

			if (!data.characters?.length) {
				throw new Error('No characters found on this identity');
			}

			characters = data.characters;
			viewState = 'select-character';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loadingCharacters = false;
		}
	}

	async function selectCharacter(rollBlockHeight: number) {
		loadingCharacters = true;
		error = null;

		try {
			// Fetch full character data
			const response = await fetch(
				`/api/character/verify?identity=${encodeURIComponent(identityInput.trim())}&rollBlockHeight=${rollBlockHeight}`
			);
			const data = await response.json();

			if (!response.ok || !data.character) {
				throw new Error(data.error || 'Failed to load character');
			}

			// Convert to StoredCharacter format
			selectedCharacter = convertToStoredCharacter(data.character, identityInput.trim());

			// Initialize game
			gameState = createGameState(selectedCharacter);
			viewState = 'playing';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loadingCharacters = false;
		}
	}

	function convertToStoredCharacter(apiChar: any, identity: string): StoredCharacter {
		// Map API response to StoredCharacter format
		return {
			name: apiChar.name,
			stats: {
				str: apiChar.stats.strength,
				dex: apiChar.stats.dexterity,
				con: apiChar.stats.constitution,
				int: apiChar.stats.intelligence,
				wis: apiChar.stats.wisdom,
				cha: apiChar.stats.charisma,
			},
			traits: {
				element: apiChar.traits.element as any,
				spiritAnimal: apiChar.traits.spirit as any,
				sex: apiChar.traits.sex as any,
			},
			verification: {
				block_height: apiChar.verification.rollBlockHeight,
				block_hash: apiChar.verification.rollBlockHash,
				client_seed: apiChar.verification.clientSeed,
				timestamp: Date.now(),
			},
			userIdentity: apiChar.identityAddress || '',
			userFriendlyName: identity,
			commitment: {
				response: '',
				signedBlockHeight: apiChar.verification.commitmentBlockHeight,
				clientSeedHash: apiChar.verification.clientSeedHash,
			},
			rollBlockHeight: apiChar.verification.rollBlockHeight,
			rollBlockHash: apiChar.verification.rollBlockHash,
		};
	}

	// ========== Scene Actions ==========
	function continueFromIntro() {
		if (!gameState) return;
		gameState = advanceScene(gameState);
	}

	async function selectPath(path: PathChoice) {
		if (!gameState) return;
		try {
			gameState = choosePath(gameState, path);
			gameState = advanceScene(gameState);
			gameState = initGuardianCombat(gameState);

			// Commit to scene seed and wait for block before combat
			await commitToScene();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Cannot select that path';
		}
	}

	// ========== Combat ==========
	async function performCombatAction(action: 'attack' | 'defend' | 'special') {
		if (!gameState?.combat) return;

		// Make sure we have block data
		if (!sceneBlockHash) {
			error = 'Waiting for block confirmation...';
			return;
		}

		// Track actions for boss combat verification
		if (gameState.currentScene === 'boss') {
			// Capture block hash on first action
			if (!bossSceneBlockHash) {
				bossSceneBlockHash = sceneBlockHash;
			}
			bossPlayerActions = [...bossPlayerActions, action];
		}

		// Handle special (spirit ability) - no roll needed
		if (action === 'special') {
			if (gameState.spiritAbilityUsed) {
				error = 'Spirit ability already used!';
				return;
			}

			const abilityResult = useSpiritAbility(gameState.character.traits.spiritAnimal, gameState);
			gameState = useSpiritAbilityFlag(gameState);

			// Apply ability effects
			if (abilityResult.damage && gameState.combat) {
				gameState.combat.enemy.hp = Math.max(0, gameState.combat.enemy.hp - abilityResult.damage);
			}
			if (abilityResult.healing) {
				gameState = applyHealing(gameState, abilityResult.healing);
			}
			if (abilityResult.buff) {
				gameState = addBuff(gameState, abilityResult.buff);
			}

			combatMessage = abilityResult.narrative;
			showingCombatResult = true;

			// Check if combat is over after ability
			if (gameState.combat && gameState.combat.enemy.hp <= 0) {
				setTimeout(() => {
					finishCombat('victory');
				}, 2000);
			}
			return;
		}

		// Derive deterministic dice rolls
		const playerAttackRoll = await deriveRoll('player_attack', 20);
		const playerDamageRoll = (await deriveRoll('player_damage', 6)) + 2; // d6+2 weapon
		const enemyAttackRoll = await deriveRoll('enemy_attack', 20);
		const enemyDamageRoll = await deriveRoll('enemy_damage', 6);

		// Resolve combat round
		const result = resolveCombatRound(
			gameState,
			action,
			playerAttackRoll,
			playerDamageRoll,
			enemyAttackRoll,
			enemyDamageRoll
		);

		// Update game state
		gameState = {
			...gameState,
			hp: result.playerHpAfter,
			combat: {
				...gameState.combat!,
				enemy: {
					...gameState.combat!.enemy,
					hp: result.enemyHpAfter,
				},
				round: gameState.combat!.round + 1,
				rounds: [...gameState.combat!.rounds, result],
			},
		};

		lastRoundResult = result;
		combatMessage = result.narrative;
		showingCombatResult = true;

		// Check combat outcome
		const outcome = getCombatOutcome(gameState);
		if (outcome !== 'ongoing') {
			setTimeout(() => {
				// Boss combat uses finishBoss, guardian uses finishCombat
				if (gameState?.currentScene === 'boss') {
					finishBoss(outcome);
				} else {
					finishCombat(outcome);
				}
			}, 2000);
		}
	}

	function finishCombat(outcome: 'victory' | 'defeat') {
		if (!gameState) return;

		showingCombatResult = false;
		combatMessage = '';

		if (outcome === 'defeat') {
			gameState = setOutcome(gameState, 'defeat');
			viewState = 'game-over';
		} else {
			// Victory - advance to next scene
			gameState = advanceScene(gameState);

			// Reset puzzle state for Scene 4
			if (gameState.currentScene === 'puzzles') {
				currentPuzzleIndex = 0;
				puzzleResults = [];
			}
		}
	}

	function dismissCombatMessage() {
		showingCombatResult = false;
	}

	// ========== Puzzles ==========
	async function attemptPuzzle(check: SkillCheck) {
		if (!gameState) return;

		// Make sure we have block data
		if (!sceneBlockHash) {
			error = 'Waiting for block confirmation...';
			return;
		}

		// Derive deterministic dice roll
		const rollResult = await deriveRoll(`puzzle_${check.id}`, 20);
		const statMod = gameState.character.stats[check.stat].modifier;
		const total = rollResult + statMod;
		const success = total >= check.dc;

		// Apply effects
		if (success && check.successEffect) {
			if (check.successEffect.type === 'heal') {
				gameState = applyHealing(gameState, check.successEffect.value);
			} else if (check.successEffect.type === 'buff') {
				gameState = addBuff(gameState, {
					description: check.successEffect.description || '',
					type: 'buff',
					value: check.successEffect.value,
					scenesRemaining: 99,
				});
			}
		} else if (!success && check.failureEffect) {
			if (check.failureEffect.type === 'damage') {
				gameState = applyDamage(gameState, check.failureEffect.value);
			}
		}

		const narrative = success
			? `Rolled ${rollResult} + ${statMod} = ${total} vs DC ${check.dc}. ${check.successDesc}`
			: `Rolled ${rollResult} + ${statMod} = ${total} vs DC ${check.dc}. ${check.failureDesc}`;

		puzzleResults = [...puzzleResults, { check, success, narrative }];
		currentPuzzleIndex++;

		// Check if player died from trap
		if (gameState.hp <= 0) {
			gameState = setOutcome(gameState, 'defeat');
			viewState = 'game-over';
		}
	}

	async function finishPuzzles() {
		if (!gameState) return;
		gameState = advanceScene(gameState);
		bargainRollResult = null;
		canGetBoth = false;

		// Commit new seed for bargain scene
		await commitToScene();
	}

	// ========== Spirit Bargain ==========
	async function rollBargainCheck() {
		if (!gameState) return;

		// Make sure we have block data
		if (!sceneBlockHash) {
			error = 'Waiting for block confirmation...';
			return;
		}

		// Derive deterministic dice roll
		const rollResult = await deriveRoll('bargain_cha', 20);
		bargainRollResult = rollResult;

		// Create roll object to check
		const mockRoll = {
			result: rollResult,
		} as any;

		canGetBoth = canChooseBoth(gameState, mockRoll);
	}

	async function makeBargainChoice(choice: BargainChoice) {
		if (!gameState) return;

		gameState = applyBargainChoice(gameState, choice, canGetBoth);
		gameState = advanceScene(gameState);
		gameState = initBossCombat(gameState);

		// Commit new seed for boss fight
		await commitToScene();

		// Capture boss scene proof data for achievement
		bossSceneSeed = sceneSeed;
		bossSceneBlockHeight = sceneBlockHeight;
		bossSceneBlockHash = ''; // Will be set when block is ready
		bossPlayerActions = []; // Reset actions for this boss fight
		bossRoundsToWin = 0;
	}

	// ========== Game End ==========
	async function finishBoss(outcome: 'victory' | 'defeat') {
		if (!gameState) return;

		showingCombatResult = false;
		combatMessage = '';

		// Capture rounds for achievement
		if (gameState.combat) {
			bossRoundsToWin = gameState.combat.round;
		}

		gameState = setOutcome(gameState, outcome);

		if (outcome === 'victory') {
			gameState = advanceScene(gameState);
			await generateAchievementStorage();
		}

		viewState = 'game-over';
	}

	async function generateAchievementStorage() {
		if (!gameState || !selectedCharacter) {
			error = 'Cannot generate achievement: missing game data';
			return;
		}

		error = null;
		storingAchievement = true;

		try {
			// CHA-passing players who chose either bargain option get both buffs.
			// State encodes this in the choices audit string as "bargain:<choice>:both".
			const bargainBothBuffs = !!gameState.bargainChoice
				&& gameState.choices.includes(`bargain:${gameState.bargainChoice}:both`);

			// Hard mode = chose power AND didn't pass CHA (so didn't also get wisdom).
			const hardMode = gameState.bargainChoice === 'power' && !bargainBothBuffs;

			const achievement = {
				characterName: gameState.character.name,
				characterRollBlockHeight: selectedCharacter.rollBlockHeight,
				bossSceneSeed,
				bossSceneBlockHeight,
				bossSceneBlockHash,
				playerActions: bossPlayerActions,
				difficulty: hardMode ? 'hard' : 'standard',
				finalHp: gameState.hp,
				maxHp: gameState.maxHp,
				roundsToWin: bossRoundsToWin,
				completedAtBlock: sceneBlockHeight,
				pathChosen: gameState.pathChosen,
				bargainChoice: gameState.bargainChoice,
				bargainBothBuffs,
				spiritAbilityUsed: gameState.spiritAbilityUsed,
			};

			const response = await fetch('/api/achievement/store', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					achievement,
					identity: identityInput.trim(),
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to generate achievement');
			}

			if (!data.deeplinkUri) {
				throw new Error('API returned no deeplinkUri');
			}

			achievementRequestId = data.requestId;
			achievementDeeplinkUri = data.deeplinkUri;

			// Generate QR code image - use low error correction to reduce density for large data
			achievementQrDataUrl = await QRCode.toDataURL(achievementDeeplinkUri, {
				width: 512,
				margin: 2,
				errorCorrectionLevel: 'L',
				color: { dark: '#000000', light: '#ffffff' },
			});

			// Persist enough to resume polling after a page refresh.
			saveAchievementState();

			// Start polling for storage confirmation
			startAchievementPolling();
		} catch (err) {
			console.error('Error generating achievement:', err);
			error = err instanceof Error ? err.message : 'Failed to generate achievement';
		} finally {
			storingAchievement = false;
		}
	}

	function startAchievementPolling(immediate = false) {
		if (achievementPollTimeout) clearTimeout(achievementPollTimeout);

		achievementPollTimeout = setTimeout(async function poll() {
			try {
				const response = await fetch(`/api/storage/status?requestId=${achievementRequestId}`);
				const data = await response.json();

				if (data.status === 'received') {
					achievementPollTimeout = null;
					achievementTxid = data.txid;
					achievementVerified = !!data.verified;
					achievementStored = true;
					clearAchievementState();
				} else {
					achievementPollTimeout = setTimeout(poll, 3000);
				}
			} catch (err) {
				console.error('Achievement polling error:', err);
				achievementPollTimeout = setTimeout(poll, 3000);
			}
		}, immediate ? 0 : 3000);
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}

	function restartGame() {
		// Stop any polling
		if (blockPollTimeout) {
			clearTimeout(blockPollTimeout);
			blockPollTimeout = null;
		}
		if (achievementPollTimeout) {
			clearTimeout(achievementPollTimeout);
			achievementPollTimeout = null;
		}
		clearAchievementState();

		viewState = 'select-identity';
		identityInput = '';
		characters = [];
		selectedCharacter = null;
		gameState = null;
		error = null;
		combatMessage = '';
		showingCombatResult = false;
		lastRoundResult = null;
		currentPuzzleIndex = 0;
		puzzleResults = [];
		bargainRollResult = null;
		canGetBoth = false;

		// Reset deterministic dice state
		sceneSeed = '';
		sceneSeedHash = '';
		sceneBlockHeight = 0;
		sceneBlockHash = '';
		waitingForBlock = false;
		currentBlockHeight = 0;
		rollCounter = 0;

		// Reset boss/achievement state
		bossSceneSeed = '';
		bossSceneBlockHeight = 0;
		bossSceneBlockHash = '';
		bossPlayerActions = [];
		bossRoundsToWin = 0;
		achievementRequestId = '';
		achievementDeeplinkUri = '';
		achievementQrDataUrl = '';
		achievementStored = false;
		achievementTxid = '';
		achievementVerified = false;
		storingAchievement = false;
	}

	// ========== Helpers ==========
	function formatModifier(mod: number): string {
		return mod >= 0 ? `+${mod}` : `${mod}`;
	}

	function getHpPercentage(current: number, max: number): number {
		return Math.max(0, Math.min(100, (current / max) * 100));
	}

	function getHpColor(percentage: number): string {
		if (percentage > 60) return 'var(--color-success)';
		if (percentage > 30) return 'var(--color-accent)';
		return 'var(--color-error)';
	}
</script>

<main class="container mx-auto px-4 py-8 max-w-4xl">
	<header class="text-center mb-8">
		<h1 class="text-4xl font-bold text-accent mb-2">The Primordial Trial</h1>
		<p class="text-secondary">Prove your worth to the ancient spirits</p>
	</header>

	{#if error}
		<div class="card mb-6 border-l-4 border-l-[var(--color-error)]">
			<p class="text-[var(--color-error)]">{error}</p>
			<button class="btn btn-secondary mt-4" on:click={() => error = null}>Dismiss</button>
		</div>
	{/if}

	<!-- ========== Identity Selection ========== -->
	{#if viewState === 'select-identity'}
		<section class="card glow-gold">
			<h2 class="text-2xl mb-4 text-accent">Select Your Champion</h2>
			<p class="text-secondary mb-6">
				Enter your VerusID to load your characters. Choose wisely - the Trial awaits.
			</p>

			<div class="flex flex-col sm:flex-row gap-4">
				<input
					type="text"
					bind:value={identityInput}
					placeholder="username@ or sub.parent@"
					class="flex-1 bg-elevated border border-[var(--color-border)] rounded-lg px-4 py-3 text-primary focus:border-accent focus:outline-none"
					disabled={loadingCharacters}
					on:keydown={(e) => e.key === 'Enter' && lookupIdentity()}
				/>
				<button
					class="btn btn-primary"
					on:click={lookupIdentity}
					disabled={loadingCharacters}
				>
					{loadingCharacters ? 'Loading...' : 'Load Characters'}
				</button>
			</div>
		</section>

		<section class="mt-8 text-center text-secondary text-sm">
			<p>
				Don't have a character? <a href="/" class="text-accent hover:underline">Create one first</a>
			</p>
		</section>
	{/if}

	<!-- ========== Character Selection ========== -->
	{#if viewState === 'select-character'}
		<section class="card glow-gold">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-2xl text-accent">Choose Your Champion</h2>
				<button class="btn btn-secondary text-sm" on:click={() => viewState = 'select-identity'}>Back</button>
			</div>

			<p class="text-secondary mb-6">
				Select the character who will face the Trial. Once begun, there is no turning back.
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{#each characters as char}
					<button
						class="card-elevated text-left hover:border-accent hover:brightness-125 transition-all cursor-pointer"
						on:click={() => selectCharacter(char.rollBlockHeight)}
						disabled={loadingCharacters}
					>
						<h3 class="text-xl text-accent mb-2">{char.name}</h3>
						<p class="text-secondary text-sm">
							{char.traits.element} / {char.traits.spirit} / {char.traits.sex}
						</p>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- ========== Game Playing ========== -->
	{#if viewState === 'playing' && gameState}
		<!-- Character Status Bar -->
		<div class="card mb-6">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<span class="text-accent font-bold">{gameState.character.name}</span>
					<span class="text-secondary text-sm ml-2">
						{gameState.character.traits.element} {gameState.character.traits.spiritAnimal}
					</span>
				</div>
				<div class="flex items-center gap-4">
					<!-- HP Bar -->
					<div class="flex items-center gap-2">
						<span class="text-secondary text-sm">HP</span>
						<div class="w-32 h-4 bg-elevated rounded-full overflow-hidden">
							<div
								class="h-full transition-all duration-300"
								style="width: {getHpPercentage(gameState.hp, gameState.maxHp)}%; background-color: {getHpColor(getHpPercentage(gameState.hp, gameState.maxHp))}"
							></div>
						</div>
						<span class="text-sm font-mono">{gameState.hp}/{gameState.maxHp}</span>
					</div>
					<!-- Spirit Ability -->
					{#if !gameState.spiritAbilityUsed}
						<div class="text-xs text-accent">Spirit Ready</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Waiting for Block Overlay -->
		{#if waitingForBlock}
			<section class="card glow-gold mb-6">
				<div class="text-center">
					<div class="inline-block animate-pulse mb-4">
						<span class="text-4xl">&#9939;</span>
					</div>
					<h3 class="text-xl text-accent mb-2">Channeling the Blockchain...</h3>
					<p class="text-secondary mb-4">
						The spirits draw power from block {sceneBlockHeight}.
						Your fate is being sealed.
					</p>
					<div class="bg-elevated rounded-lg p-4 inline-block">
						<p class="text-sm text-secondary">
							Current Block: <span class="text-accent font-mono">{currentBlockHeight}</span>
							{' → '}
							Target: <span class="text-accent font-mono">{sceneBlockHeight}</span>
						</p>
						{#if sceneBlockHeight > currentBlockHeight}
							<p class="text-xs text-secondary mt-2">
								{sceneBlockHeight - currentBlockHeight} block{sceneBlockHeight - currentBlockHeight === 1 ? '' : 's'} remaining...
							</p>
						{/if}
					</div>
					<div class="mt-4">
						<p class="text-xs text-secondary">
							Seed Hash: <span class="hash">{sceneSeedHash.slice(0, 16)}...</span>
						</p>
					</div>
				</div>
			</section>
		{/if}

		<!-- Scene: Intro -->
		{#if gameState.currentScene === 'intro'}
			<section class="card glow-gold">
				<h2 class="text-2xl mb-4 text-accent">The Summoning</h2>

				<div class="prose prose-invert mb-6">
					<p class="text-secondary">
						You stand at the threshold of the Primordial Sanctum, ancient stone humming with
						power older than memory. The spirits have called you here to face the Trial -
						a test that has broken countless warriors and mages alike.
					</p>
					<p class="text-secondary mt-4">
						Only those who prove their worth may bear the Mark of the Worthy, an eternal
						testament to their strength, cunning, and spirit inscribed upon the very
						fabric of the blockchain itself.
					</p>
					<p class="text-secondary mt-4">
						<strong class="text-accent">{gameState.character.name}</strong>,
						child of <strong class="text-accent">{gameState.character.traits.element}</strong>,
						bonded to the <strong class="text-accent">{gameState.character.traits.spiritAnimal}</strong> spirit -
						are you ready to begin?
					</p>
				</div>

				<div class="text-center">
					<button class="btn btn-primary" on:click={continueFromIntro}>
						Enter the Sanctum
					</button>
				</div>
			</section>
		{/if}

		<!-- Scene: Path Selection -->
		{#if gameState.currentScene === 'paths'}
			<section class="card glow-gold">
				<h2 class="text-2xl mb-4 text-accent">Choose Your Path</h2>

				<p class="text-secondary mb-6">
					The sanctum's entrance reveals six passages, each sealed by different means.
					Choose your path wisely - your abilities will determine which routes are open to you.
				</p>

				<div class="grid gap-4">
					{#each getPathChoices(gameState.character) as choice}
						<button
							class="card-elevated text-left transition-colors {choice.available ? 'hover:border-accent cursor-pointer' : 'opacity-50 cursor-not-allowed'}"
							on:click={() => choice.available && selectPath(choice.id as PathChoice)}
							disabled={!choice.available}
						>
							<div class="flex justify-between items-start">
								<div>
									<h3 class="text-lg text-accent mb-1">{choice.text}</h3>
									{#if !choice.available && choice.unavailableReason}
										<p class="text-[var(--color-error)] text-sm">{choice.unavailableReason}</p>
									{/if}
								</div>
								{#if choice.available}
									<span class="text-[var(--color-success)]">&#10003;</span>
								{:else}
									<span class="text-[var(--color-error)]">&#10007;</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Scene: Guardian Combat -->
		{#if gameState.currentScene === 'guardian' && gameState.combat}
			<section class="card glow-gold">
				<h2 class="text-2xl mb-4 text-accent">The First Guardian</h2>

				<!-- Combat Message -->
				{#if showingCombatResult && combatMessage}
					<div class="bg-elevated rounded-lg p-4 mb-6 border-l-4 border-l-accent">
						<p class="text-primary">{combatMessage}</p>
						<button class="btn btn-primary mt-4 text-sm" on:click={dismissCombatMessage}>
							Continue
						</button>
					</div>
				{/if}

				<div class="grid md:grid-cols-2 gap-6 mb-6">
					<!-- Player -->
					<div class="bg-elevated rounded-lg p-4">
						<h3 class="text-accent mb-2">{gameState.character.name}</h3>
						<div class="mb-2">
							<div class="flex justify-between text-sm mb-1">
								<span>HP</span>
								<span>{gameState.hp}/{gameState.maxHp}</span>
							</div>
							<div class="w-full h-3 bg-surface rounded-full overflow-hidden">
								<div
									class="h-full transition-all duration-300"
									style="width: {getHpPercentage(gameState.hp, gameState.maxHp)}%; background-color: {getHpColor(getHpPercentage(gameState.hp, gameState.maxHp))}"
								></div>
							</div>
						</div>
						<div class="text-xs text-secondary">
							ATK: {formatModifier(gameState.character.stats.str.modifier)}{#if gameState.combat.round >= 2 && gameState.character.stats.int.modifier > 0}+{gameState.character.stats.int.modifier}INT{/if} |
							DEF: {10 + gameState.character.stats.dex.modifier}{#if gameState.combat.round >= 2 && gameState.character.stats.wis.modifier > 0}+{gameState.character.stats.wis.modifier}WIS{/if}
						</div>
					</div>

					<!-- Enemy -->
					<div class="bg-elevated rounded-lg p-4">
						<h3 class="text-[var(--color-error)] mb-2">{gameState.combat.enemy.name}</h3>
						<div class="mb-2">
							<div class="flex justify-between text-sm mb-1">
								<span>HP</span>
								<span>{gameState.combat.enemy.hp}/{gameState.combat.enemy.maxHp}</span>
							</div>
							<div class="w-full h-3 bg-surface rounded-full overflow-hidden">
								<div
									class="h-full transition-all duration-300 bg-[var(--color-error)]"
									style="width: {getHpPercentage(gameState.combat.enemy.hp, gameState.combat.enemy.maxHp)}%"
								></div>
							</div>
						</div>
						<div class="text-xs text-secondary">
							ATK: +{gameState.combat.enemy.attackBonus} | DEF: {gameState.combat.enemy.defense}
						</div>
						{#if gameState.combat.enemy.specialName}
							<div class="text-xs text-accent mt-1">
								Special: {gameState.combat.enemy.specialName}
							</div>
						{/if}
					</div>
				</div>

				<!-- Actions -->
				{#if !showingCombatResult}
					<div class="flex flex-wrap gap-4 justify-center">
						<button class="btn btn-secondary" on:click={() => performCombatAction('attack')}>
							Attack
						</button>
						<button class="btn btn-secondary" on:click={() => performCombatAction('defend')}>
							Defend
						</button>
						{#if !gameState.spiritAbilityUsed}
							<button class="btn btn-secondary border-accent" on:click={() => performCombatAction('special')}>
								{gameState.character.traits.spiritAnimal} Spirit
							</button>
						{/if}
					</div>
				{/if}

				<div class="text-center text-secondary text-sm mt-4">
					Round {gameState.combat.round}
				</div>
			</section>
		{/if}

		<!-- Scene: Puzzles -->
		{#if gameState.currentScene === 'puzzles'}
			{@const puzzles = getPuzzleChecks()}
			<section class="card glow-gold">
				<h2 class="text-2xl mb-4 text-accent">The Puzzle Chamber</h2>

				{#if currentPuzzleIndex < puzzles.length}
					{@const currentPuzzle = puzzles[currentPuzzleIndex]}
					<div class="bg-elevated rounded-lg p-4 mb-6">
						<h3 class="text-accent mb-2">Challenge {currentPuzzleIndex + 1} of {puzzles.length}</h3>
						<p class="text-secondary mb-4">{currentPuzzle.description}</p>
						<p class="text-sm text-secondary">
							{currentPuzzle.stat.toUpperCase()} Check (DC {currentPuzzle.dc}) -
							Your modifier: {formatModifier(gameState.character.stats[currentPuzzle.stat].modifier)}
						</p>
					</div>

					<div class="text-center">
						<button class="btn btn-primary" on:click={() => attemptPuzzle(currentPuzzle)}>
							Attempt Check
						</button>
					</div>
				{:else}
					<div class="mb-6">
						<h3 class="text-accent mb-4">Results</h3>
						{#each puzzleResults as result, i}
							<div class="bg-elevated rounded-lg p-4 mb-4">
								<div class="flex items-start gap-2">
									{#if result.success}
										<span class="text-[var(--color-success)] text-xl">&#10003;</span>
									{:else}
										<span class="text-[var(--color-error)] text-xl">&#10007;</span>
									{/if}
									<div>
										<p class="text-sm text-secondary">{result.narrative}</p>
									</div>
								</div>
							</div>
						{/each}
					</div>

					<div class="text-center">
						<button class="btn btn-primary" on:click={finishPuzzles}>
							Continue to the Spirit Chamber
						</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Scene: Spirit Bargain -->
		{#if gameState.currentScene === 'bargain'}
			<section class="card glow-gold">
				<h2 class="text-2xl mb-4 text-accent">The Spirit's Bargain</h2>

				<div class="prose prose-invert mb-6">
					<p class="text-secondary">
						In the heart of the sanctum, the spirit of the
						<strong class="text-accent">{gameState.character.traits.spiritAnimal}</strong>
						materializes before you. Its ancient eyes regard you with knowing wisdom.
					</p>
					<p class="text-secondary mt-4">
						"You seek the Mark of the Worthy," it intones. "But first, you must choose.
						I offer you a gift for the final trial ahead..."
					</p>
				</div>

				{#if bargainRollResult === null}
					<div class="bg-elevated rounded-lg p-4 mb-6">
						<p class="text-secondary mb-4">
							Make a Charisma check to negotiate favorable terms. Success may grant you both gifts.
						</p>
						<p class="text-sm text-secondary">
							CHA Check (DC 15) - Your modifier: {formatModifier(gameState.character.stats.cha.modifier)}
						</p>
					</div>

					<div class="text-center">
						<button class="btn btn-primary" on:click={rollBargainCheck}>
							Negotiate
						</button>
					</div>
				{:else}
					<div class="bg-elevated rounded-lg p-4 mb-6">
						<p class="text-primary mb-2">
							Rolled: {bargainRollResult} + {gameState.character.stats.cha.modifier} =
							{bargainRollResult + gameState.character.stats.cha.modifier}
						</p>
						{#if canGetBoth}
							<p class="text-[var(--color-success)]">
								The spirit is impressed! You may receive both gifts.
							</p>
						{:else}
							<p class="text-secondary">
								The spirit nods. "You may choose one gift."
							</p>
						{/if}
					</div>

					<div class="grid md:grid-cols-2 gap-4">
						<button
							class="card-elevated text-left hover:border-accent transition-colors cursor-pointer"
							on:click={() => makeBargainChoice('power')}
						>
							<h3 class="text-accent mb-2">Gift of Power</h3>
							<p class="text-secondary text-sm">
								+2 damage against the Primordial
								{#if !canGetBoth}
									<br/><span class="text-xs text-[var(--color-error)]">(Warning: The Primordial will be empowered)</span>
								{/if}
							</p>
						</button>
						<button
							class="card-elevated text-left hover:border-accent transition-colors cursor-pointer"
							on:click={() => makeBargainChoice('wisdom')}
						>
							<h3 class="text-accent mb-2">Gift of Wisdom</h3>
							<p class="text-secondary text-sm">
								+2 defense against the Primordial
							</p>
						</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Scene: Boss Combat -->
		{#if gameState.currentScene === 'boss' && gameState.combat}
			<section class="card glow-gold">
				<h2 class="text-2xl mb-4 text-accent">The Final Trial</h2>

				<p class="text-secondary mb-6">
					The Primordial itself emerges from the shadows - a being of pure elemental chaos,
					ancient beyond measure. This is your final test.
				</p>

				<!-- Combat Message -->
				{#if showingCombatResult && combatMessage}
					<div class="bg-elevated rounded-lg p-4 mb-6 border-l-4 border-l-accent">
						<p class="text-primary">{combatMessage}</p>
						<button class="btn btn-primary mt-4 text-sm" on:click={dismissCombatMessage}>
							Continue
						</button>
					</div>
				{/if}

				<div class="grid md:grid-cols-2 gap-6 mb-6">
					<!-- Player -->
					<div class="bg-elevated rounded-lg p-4">
						<h3 class="text-accent mb-2">{gameState.character.name}</h3>
						<div class="mb-2">
							<div class="flex justify-between text-sm mb-1">
								<span>HP</span>
								<span>{gameState.hp}/{gameState.maxHp}</span>
							</div>
							<div class="w-full h-3 bg-surface rounded-full overflow-hidden">
								<div
									class="h-full transition-all duration-300"
									style="width: {getHpPercentage(gameState.hp, gameState.maxHp)}%; background-color: {getHpColor(getHpPercentage(gameState.hp, gameState.maxHp))}"
								></div>
							</div>
						</div>
					</div>

					<!-- Boss -->
					<div class="bg-elevated rounded-lg p-4 border border-[var(--color-error)]">
						<h3 class="text-[var(--color-error)] mb-2">{gameState.combat.enemy.name}</h3>
						<div class="mb-2">
							<div class="flex justify-between text-sm mb-1">
								<span>HP</span>
								<span>{gameState.combat.enemy.hp}/{gameState.combat.enemy.maxHp}</span>
							</div>
							<div class="w-full h-3 bg-surface rounded-full overflow-hidden">
								<div
									class="h-full transition-all duration-300 bg-[var(--color-error)]"
									style="width: {getHpPercentage(gameState.combat.enemy.hp, gameState.combat.enemy.maxHp)}%"
								></div>
							</div>
						</div>
					</div>
				</div>

				<!-- Actions -->
				{#if !showingCombatResult}
					{@const outcome = getCombatOutcome(gameState)}
					{#if outcome === 'ongoing'}
						<div class="flex flex-wrap gap-4 justify-center">
							<button class="btn btn-secondary" on:click={() => performCombatAction('attack')}>
								Attack
							</button>
							<button class="btn btn-secondary" on:click={() => performCombatAction('defend')}>
								Defend
							</button>
							{#if !gameState.spiritAbilityUsed}
								<button class="btn btn-secondary border-accent" on:click={() => performCombatAction('special')}>
									{gameState.character.traits.spiritAnimal} Spirit
								</button>
							{/if}
						</div>
					{:else}
						<div class="text-center">
							<button class="btn btn-primary" on:click={() => finishBoss(outcome)}>
								{outcome === 'victory' ? 'Claim Your Victory' : 'Accept Your Fate'}
							</button>
						</div>
					{/if}
				{/if}

				<div class="text-center text-secondary text-sm mt-4">
					Round {gameState.combat.round}
				</div>
			</section>
		{/if}
	{/if}

	<!-- ========== Game Over ========== -->
	{#if viewState === 'game-over' && gameState}
		<section class="card glow-gold">
			{#if gameState.outcome === 'victory'}
				<h2 class="text-3xl mb-4 text-accent text-center">Victory!</h2>
				<div class="text-center mb-6">
					<p class="text-[var(--color-success)] text-xl mb-4">
						&#9552;&#9552;&#9552;&#9552;&#9552; THE MARK OF THE WORTHY &#9552;&#9552;&#9552;&#9552;&#9552;
					</p>
					<p class="text-secondary">
						<strong class="text-accent">{gameState.character.name}</strong> has proven
						their worth before the Primordial spirits. Your achievement shall be
						recorded for eternity.
					</p>
				</div>

				<!-- Achievement Error -->
				{#if error && !storingAchievement && !achievementDeeplinkUri}
					<div class="bg-elevated rounded-lg p-4 mb-6 border border-[var(--color-error)]">
						<p class="text-[var(--color-error)] mb-2">Achievement generation failed:</p>
						<p class="text-secondary text-sm">{error}</p>
						<button class="btn btn-secondary mt-4" on:click={generateAchievementStorage}>
							Retry
						</button>
					</div>
				{/if}

				<!-- Achievement Storage -->
				{#if storingAchievement}
					<div class="bg-elevated rounded-lg p-4 mb-6 text-center">
						<div class="inline-block animate-pulse mb-2">
							<span class="text-4xl">&#127942;</span>
						</div>
						<p class="text-secondary">Generating achievement proof...</p>
					</div>
				{:else if achievementStored && achievementTxid}
					<div class="bg-elevated rounded-lg p-4 mb-6 text-center border {achievementVerified ? 'border-[var(--color-success)]' : 'border-[var(--color-border)]'}">
						<div class="mb-2">
							<span class="text-4xl">&#127942;</span>
						</div>
						{#if achievementVerified}
							<h3 class="text-[var(--color-success)] mb-2">Broadcast to mempool</h3>
							<p class="text-secondary text-sm mb-2">
								Your wallet broadcast the update; the daemon has seen the transaction.
								It will be permanently recorded once confirmed in a block.
							</p>
						{:else}
							<h3 class="text-secondary mb-2">Still waiting…</h3>
							<p class="text-secondary text-sm mb-2">
								Your wallet returned a transaction id, but the daemon hasn't seen
								it yet. Refresh the verify page in a moment to check confirmation.
							</p>
						{/if}
						<p class="text-xs text-secondary">
							TX: <span class="hash">{achievementTxid.slice(0, 16)}...{achievementTxid.slice(-8)}</span>
						</p>
					</div>
				{:else if achievementDeeplinkUri}
					<div class="bg-elevated rounded-lg p-4 mb-6">
						<h3 class="text-accent mb-3 text-center">Store Your Achievement On-Chain</h3>
						<p class="text-secondary text-sm mb-4 text-center">
							Scan the QR code or tap the button to record your victory forever.
							After confirming in your wallet, you'll be redirected back here.
						</p>

						{#if achievementQrDataUrl}
							<div class="flex justify-center mb-4">
								<img
									src={achievementQrDataUrl}
									alt="Scan with Verus Mobile"
									class="rounded-lg bg-white p-2"
									width="300"
									height="300"
								/>
							</div>
						{/if}

						<div class="flex flex-col gap-3 items-center">
							<a
								href={achievementDeeplinkUri}
								class="btn btn-primary w-full max-w-xs"
							>
								Open in Verus Mobile
							</a>

							<button
								class="btn btn-secondary w-full max-w-xs text-sm"
								on:click={() => copyToClipboard(achievementDeeplinkUri)}
							>
								Copy Deep Link
							</button>
						</div>
					</div>
				{/if}
			{:else}
				<h2 class="text-3xl mb-4 text-[var(--color-error)] text-center">Defeat</h2>
				<div class="text-center mb-6">
					<p class="text-secondary">
						<strong class="text-accent">{gameState.character.name}</strong> has fallen
						in the Trial. The spirits show no mercy to the unworthy.
					</p>
					<p class="text-secondary mt-4">
						But death is not the end. Rise again, and prove yourself anew.
					</p>
				</div>
			{/if}

			<!-- Stats Summary -->
			<div class="bg-elevated rounded-lg p-4 mb-6">
				<h3 class="text-accent mb-4">Trial Summary</h3>
				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<span class="text-secondary">Final HP:</span>
						<span class="text-primary ml-2">{gameState.hp}/{gameState.maxHp}</span>
					</div>
					<div>
						<span class="text-secondary">Path:</span>
						<span class="text-primary ml-2">{gameState.pathChosen || 'None'}</span>
					</div>
					<div>
						<span class="text-secondary">Bargain:</span>
						<span class="text-primary ml-2">{gameState.bargainChoice || 'None'}</span>
					</div>
					<div>
						<span class="text-secondary">Spirit Used:</span>
						<span class="text-primary ml-2">{gameState.spiritAbilityUsed ? 'Yes' : 'No'}</span>
					</div>
				</div>
			</div>

			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<button class="btn btn-primary" on:click={restartGame}>
					{gameState.outcome === 'victory' ? 'Play Again' : 'Try Again'}
				</button>
				<a href="/" class="btn btn-secondary">
					Create New Character
				</a>
			</div>
		</section>
	{/if}

	<section class="mt-8 text-center text-secondary text-sm">
		<p>
			<a href="/" class="text-accent hover:underline">Create a character</a>
			{' | '}
			<a href="/verify" class="text-accent hover:underline">Verify a character</a>
		</p>
	</section>
</main>
