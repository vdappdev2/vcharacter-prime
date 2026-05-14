<script lang="ts">
	// State machine for verification flow
	type FlowState = 'idle' | 'loading-list' | 'select' | 'loading-verify' | 'success' | 'error';

	let state: FlowState = 'idle';
	let error: string | null = null;

	// Input
	let identityInput = '';

	// Character list data
	let identityAddress = '';
	let characters: Array<{
		name: string;
		rollBlockHeight: number;
		traits: {
			element: string;
			spirit: string;
			sex: string;
		};
	}> = [];

	// Achievement data (includes new verification fields)
	type Achievement = {
		characterName: string;
		characterRollBlockHeight: number;
		bossSceneSeed: string;
		bossSceneBlockHeight: number;
		bossSceneBlockHash?: string;
		playerActions?: ('attack' | 'defend' | 'special')[];
		difficulty: 'standard' | 'hard';
		finalHp: number;
		maxHp?: number;
		roundsToWin: number;
		completedAtBlock: number;
		pathChosen?: 'might' | 'cunning' | 'spirit' | 'shadows' | 'endurance' | 'charm';
		bargainChoice?: 'power' | 'wisdom';
		bargainBothBuffs?: boolean;
		spiritAbilityUsed?: boolean;
	};
	let achievements: Achievement[] = [];

	// Helper to get achievements for a character
	function getCharacterAchievements(rollBlockHeight: number): Achievement[] {
		return achievements.filter(a => a.characterRollBlockHeight === rollBlockHeight);
	}

	// Verification result
	let verificationResult: {
		valid: boolean;
		character?: {
			name: string;
			identity: string;
			identityAddress: string;
			stats: Record<string, { total: number; dice: number[]; modifier: number }>;
			traits: { element: string; spirit: string; sex: string };
			verification: {
				clientSeed: string;
				clientSeedHash: string;
				rollBlockHeight: number;
				rollBlockHash: string;
				commitmentBlockHeight: number;
			};
		};
		verification?: {
			seedHashValid: boolean;
			blockHashValid: boolean;
			statsValid: boolean;
			traitsValid: boolean;
			allValid: boolean;
		};
	} | null = null;

	async function lookupIdentity() {
		if (!identityInput.trim()) {
			error = 'Please enter a VerusID';
			return;
		}

		state = 'loading-list';
		error = null;
		characters = [];
		achievements = [];
		verificationResult = null;

		try {
			// Fetch characters and achievements in parallel
			const [charResponse, achieveResponse] = await Promise.all([
				fetch(`/api/character/list?identity=${encodeURIComponent(identityInput.trim())}`),
				fetch(`/api/achievement/list?identity=${encodeURIComponent(identityInput.trim())}`),
			]);

			const charData = await charResponse.json();
			const achieveData = await achieveResponse.json();

			if (!charResponse.ok) {
				throw new Error(charData.error || 'Failed to lookup identity');
			}

			if (charData.error && charData.characters?.length === 0) {
				throw new Error(charData.error);
			}

			identityAddress = charData.identityAddress || '';
			characters = charData.characters || [];
			achievements = achieveData.achievements || [];

			if (characters.length === 0) {
				throw new Error('No characters found on this identity');
			}

			state = 'select';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			state = 'error';
		}
	}

	async function verifyCharacter(rollBlockHeight: number) {
		state = 'loading-verify';
		error = null;

		try {
			const response = await fetch(
				`/api/character/verify?identity=${encodeURIComponent(identityInput.trim())}&rollBlockHeight=${rollBlockHeight}`
			);
			const data = await response.json();

			if (!response.ok && !data.verification) {
				throw new Error(data.error || 'Failed to verify character');
			}

			verificationResult = data;
			state = 'success';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			state = 'error';
		}
	}

	function reset() {
		state = 'idle';
		error = null;
		identityInput = '';
		identityAddress = '';
		characters = [];
		achievements = [];
		verificationResult = null;
	}

	function backToSelect() {
		state = 'select';
		verificationResult = null;
		error = null;
	}

	function formatModifier(mod: number): string {
		if (mod >= 0) return `+${mod}`;
		return `${mod}`;
	}

	function truncateHash(hash: string, length: number = 16): string {
		if (hash.length <= length * 2) return hash;
		return `${hash.slice(0, length)}...${hash.slice(-length)}`;
	}

	function capitalize(s: string): string {
		return s.charAt(0).toUpperCase() + s.slice(1);
	}

	function formatBargain(choice?: 'power' | 'wisdom', bothBuffs?: boolean): string {
		if (!choice) return '—';
		if (!bothBuffs) return capitalize(choice);
		const other = choice === 'power' ? 'Wisdom' : 'Power';
		return `${capitalize(choice)} (+ ${other})`;
	}

	// Stat name mapping
	const STAT_NAMES: Record<string, string> = {
		strength: 'STR',
		dexterity: 'DEX',
		constitution: 'CON',
		intelligence: 'INT',
		wisdom: 'WIS',
		charisma: 'CHA',
	};

	// Honors the schema doc's "readers ignore unknown keys" promise:
	// filters Object.entries(stats) to entries with the stat-roll shape so
	// any additive non-stat keys (legacy v:1 fixture, future metadata) don't
	// render as ghost rows.
	type StatRoll = { total: number; dice: number[]; modifier: number };
	function isStatRoll(s: unknown): s is StatRoll {
		return typeof s === 'object' && s !== null && typeof (s as StatRoll).total === 'number';
	}
</script>

<svelte:head>
	<title>Verify — vcharacter-prime</title>
	<meta name="description" content="Look up any VerusID's stored characters and confirm each one was rolled fairly." />
	<link rel="canonical" href="https://prime.vcharacter.xyz/verify" />
	<meta property="og:title" content="Verify — vcharacter-prime" />
	<meta property="og:description" content="Look up any VerusID's stored characters and confirm each one was rolled fairly." />
	<meta name="twitter:title" content="Verify — vcharacter-prime" />
	<meta name="twitter:description" content="Look up any VerusID's stored characters and confirm each one was rolled fairly." />
</svelte:head>

<main class="container mx-auto px-4 py-8 max-w-4xl">
	<header class="text-center mb-12">
		<h1 class="text-4xl font-bold text-accent mb-2">Verify Character</h1>
		<p class="text-secondary">Confirm provably fair character creation</p>
	</header>

	{#if error && state === 'error'}
		<div class="card mb-6 border-l-4 border-l-[var(--color-error)]">
			<p class="text-[var(--color-error)]">{error}</p>
			<button class="btn btn-secondary mt-4" on:click={reset}>Try Again</button>
		</div>
	{/if}

	{#if state === 'idle' || state === 'loading-list' || state === 'error'}
		<section class="card glow-gold">
			<h2 class="text-2xl mb-4 text-accent">Step 1: Enter VerusID</h2>
			<p class="text-secondary mb-6">
				Enter the VerusID that contains the character you want to verify.
			</p>

			<div class="flex flex-col sm:flex-row gap-4">
				<input
					type="text"
					bind:value={identityInput}
					placeholder="username@ or sub.parent@"
					class="flex-1 bg-elevated border border-[var(--color-border)] rounded-lg px-4 py-3 text-primary focus:border-accent focus:outline-none"
					disabled={state === 'loading-list'}
					on:keydown={(e) => e.key === 'Enter' && lookupIdentity()}
				/>
				<button
					class="btn btn-primary"
					on:click={lookupIdentity}
					disabled={state === 'loading-list'}
				>
					{#if state === 'loading-list'}
						<span class="inline-block animate-pulse">Looking up...</span>
					{:else}
						Lookup
					{/if}
				</button>
			</div>
		</section>
	{/if}

	{#if state === 'select'}
		<section class="card glow-gold mb-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-2xl text-accent">Step 2: Select Character</h2>
				<button class="btn btn-secondary text-sm" on:click={reset}>Change ID</button>
			</div>

			<div class="bg-elevated rounded-lg p-4 mb-6">
				<p class="text-secondary">
					Identity: <span class="text-accent font-bold">{identityInput}</span>
				</p>
				{#if identityAddress}
					<p class="text-xs text-secondary mt-1 hash">{identityAddress}</p>
				{/if}
			</div>

			<p class="text-secondary mb-4">
				{characters.length} character{characters.length === 1 ? '' : 's'} found. Select one to verify:
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{#each characters as char}
					{@const charAchievements = getCharacterAchievements(char.rollBlockHeight)}
					<div class="card-elevated hover:border-accent transition-colors">
						<div class="flex items-start justify-between mb-2">
							<h3 class="text-xl text-accent">{char.name}</h3>
							{#if charAchievements.length > 0}
								<div class="flex gap-1" title="Primordial Trial Complete">
									{#each charAchievements as achievement}
										<span class="text-2xl" title="{achievement.difficulty === 'hard' ? 'Hard Mode' : 'Standard'} - {achievement.roundsToWin} rounds">
											{achievement.difficulty === 'hard' ? '🏆' : '🎖️'}
										</span>
									{/each}
								</div>
							{/if}
						</div>
						<p class="text-secondary text-sm mb-4">
							{char.traits.element} / {char.traits.spirit} / {char.traits.sex}
						</p>
						{#if charAchievements.length > 0}
							<p class="text-xs text-[var(--color-success)] mb-4">
								Trial Complete ({charAchievements.length} {charAchievements.length === 1 ? 'victory' : 'victories'})
							</p>
						{/if}
						<button
							class="btn btn-primary w-full"
							on:click={() => verifyCharacter(char.rollBlockHeight)}
						>
							Verify
						</button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if state === 'loading-verify'}
		<section class="card glow-gold text-center">
			<div class="dice-rolling text-4xl mb-4">&#128270;</div>
			<p class="text-secondary">Verifying character...</p>
		</section>
	{/if}

	{#if state === 'success' && verificationResult}
		<section class="card glow-gold mb-6">
			<div class="flex items-center justify-between mb-6">
				<h2 class="text-2xl text-accent">Verification Results</h2>
				<button class="btn btn-secondary text-sm" on:click={backToSelect}>Back</button>
			</div>

			<!-- Verification Checklist -->
			{#if verificationResult.verification}
				<div class="bg-elevated rounded-lg p-4 mb-6">
					<div class="grid grid-cols-2 gap-4 mb-4">
						<div class="flex items-center gap-2">
							{#if verificationResult.verification.seedHashValid}
								<span class="text-[var(--color-success)] text-xl">&#10003;</span>
							{:else}
								<span class="text-[var(--color-error)] text-xl">&#10007;</span>
							{/if}
							<span class="text-secondary">Seed Hash Valid</span>
						</div>
						<div class="flex items-center gap-2">
							{#if verificationResult.verification.blockHashValid}
								<span class="text-[var(--color-success)] text-xl">&#10003;</span>
							{:else}
								<span class="text-[var(--color-error)] text-xl">&#10007;</span>
							{/if}
							<span class="text-secondary">Block Hash Valid</span>
						</div>
						<div class="flex items-center gap-2">
							{#if verificationResult.verification.statsValid}
								<span class="text-[var(--color-success)] text-xl">&#10003;</span>
							{:else}
								<span class="text-[var(--color-error)] text-xl">&#10007;</span>
							{/if}
							<span class="text-secondary">Stats Valid</span>
						</div>
						<div class="flex items-center gap-2">
							{#if verificationResult.verification.traitsValid}
								<span class="text-[var(--color-success)] text-xl">&#10003;</span>
							{:else}
								<span class="text-[var(--color-error)] text-xl">&#10007;</span>
							{/if}
							<span class="text-secondary">Traits Valid</span>
						</div>
					</div>

					<!-- Overall verdict -->
					<div class="text-center py-4 border-t border-[var(--color-border)]">
						{#if verificationResult.verification.allValid}
							<p class="text-[var(--color-success)] text-2xl font-bold">
								&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552; VERIFIED &#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;
							</p>
						{:else}
							<p class="text-[var(--color-error)] text-2xl font-bold">
								&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552; NOT VERIFIED &#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;
							</p>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Character Display -->
			{#if verificationResult.character}
				<div class="mb-6">
					<h3 class="text-xl text-accent text-center mb-4">
						CHARACTER: {verificationResult.character.name}
					</h3>

					<!-- Stats -->
					<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
						{#each Object.entries(verificationResult.character.stats).filter(([, v]) => isStatRoll(v)) as [statName, stat]}
							<div class="bg-elevated rounded-lg p-4 text-center">
								<p class="text-sm text-secondary uppercase">{STAT_NAMES[statName] || statName}</p>
								<p class="stat-value">{stat.total}</p>
								<p class="stat-modifier {stat.modifier >= 0 ? 'positive' : 'negative'}">
									({formatModifier(stat.modifier)})
								</p>
							</div>
						{/each}
					</div>

					<!-- Traits -->
					<div class="flex flex-wrap gap-4 justify-center mb-6">
						<div class="bg-elevated rounded-lg px-4 py-2">
							<span class="text-secondary">Element:</span>
							<span class="text-accent ml-1">{verificationResult.character.traits.element}</span>
						</div>
						<div class="bg-elevated rounded-lg px-4 py-2">
							<span class="text-secondary">Spirit:</span>
							<span class="text-accent ml-1">{verificationResult.character.traits.spirit}</span>
						</div>
						<div class="bg-elevated rounded-lg px-4 py-2">
							<span class="text-secondary">Sex:</span>
							<span class="text-accent ml-1">{verificationResult.character.traits.sex}</span>
						</div>
					</div>

					<!-- Achievements -->
					{#if getCharacterAchievements(verificationResult.character.verification.rollBlockHeight).length > 0}
						{@const charAchievements = getCharacterAchievements(verificationResult.character.verification.rollBlockHeight)}
						<div class="mb-6">
							<h4 class="text-lg text-accent text-center mb-4">
								Achievements ({charAchievements.length})
							</h4>
							<div class="grid gap-4">
								{#each charAchievements as achievement, i}
									{@const hasProofData = achievement.bossSceneBlockHash && achievement.playerActions}
									<div class="bg-elevated rounded-lg p-4 border border-[var(--color-border)]">
										<div class="flex items-center justify-between mb-2">
											<div class="flex items-center gap-2">
												<span class="text-2xl">{achievement.difficulty === 'hard' ? '🏆' : '🎖️'}</span>
												<span class="text-[var(--color-success)] font-bold">
													Primordial Trial Complete
												</span>
											</div>
											<span class="text-xs text-secondary">
												{achievement.difficulty === 'hard' ? 'Hard Mode' : 'Standard'}
											</span>
										</div>
										<div class="grid grid-cols-3 gap-4 text-sm mb-3">
											<div>
												<span class="text-secondary">Final HP:</span>
												<span class="text-primary ml-1">{achievement.finalHp}{achievement.maxHp ? `/${achievement.maxHp}` : ''}</span>
											</div>
											<div>
												<span class="text-secondary">Rounds:</span>
												<span class="text-primary ml-1">{achievement.roundsToWin}</span>
											</div>
											<div>
												<span class="text-secondary">Block:</span>
												<span class="text-primary ml-1">{achievement.completedAtBlock}</span>
											</div>
										</div>

										{#if achievement.pathChosen || achievement.bargainChoice || achievement.spiritAbilityUsed !== undefined}
											<div class="grid grid-cols-3 gap-4 text-sm mb-3">
												<div>
													<span class="text-secondary">Path:</span>
													<span class="text-primary ml-1">
														{achievement.pathChosen ? capitalize(achievement.pathChosen) : '—'}
													</span>
												</div>
												<div>
													<span class="text-secondary">Bargain:</span>
													<span class="text-primary ml-1">
														{formatBargain(achievement.bargainChoice, achievement.bargainBothBuffs)}
													</span>
												</div>
												<div>
													<span class="text-secondary">Spirit Ability:</span>
													<span class="text-primary ml-1">
														{achievement.spiritAbilityUsed === undefined ? '—' : achievement.spiritAbilityUsed ? 'Used' : 'Not used'}
													</span>
												</div>
											</div>
										{/if}

										<!-- Achievement Proof Details (Collapsible) -->
										{#if hasProofData}
											<details class="mt-3">
												<summary class="cursor-pointer text-xs text-accent">Proof Details</summary>
												<div class="mt-2 space-y-1 text-xs">
													<p>
														<span class="text-secondary">Boss Seed:</span>
														<span class="hash">{achievement.bossSceneSeed}</span>
													</p>
													<p>
														<span class="text-secondary">Block Hash:</span>
														<span class="hash">{achievement.bossSceneBlockHash || ''}</span>
													</p>
													<p>
														<span class="text-secondary">Actions:</span>
														<span class="text-primary">{achievement.playerActions?.length || 0} moves</span>
													</p>
												</div>
											</details>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Verification Details (Collapsible) -->
				<details class="bg-elevated rounded-lg p-4">
					<summary class="cursor-pointer text-accent">Verification Details</summary>
					<div class="mt-4 space-y-2 text-xs">
						<p>
							<span class="text-secondary">Client Seed:</span>
							<span class="hash">{verificationResult.character.verification.clientSeed}</span>
						</p>
						<p>
							<span class="text-secondary">Client Seed Hash:</span>
							<span class="hash">{verificationResult.character.verification.clientSeedHash}</span>
						</p>
						<p>
							<span class="text-secondary">Roll Block Height:</span>
							<span class="hash">{verificationResult.character.verification.rollBlockHeight}</span>
						</p>
						<p>
							<span class="text-secondary">Roll Block Hash:</span>
							<span class="hash">{verificationResult.character.verification.rollBlockHash}</span>
						</p>
						<p>
							<span class="text-secondary">Commitment Block Height:</span>
							<span class="hash">{verificationResult.character.verification.commitmentBlockHeight}</span>
						</p>
						<p>
							<span class="text-secondary">Identity Address:</span>
							<span class="hash">{verificationResult.character.identityAddress || ''}</span>
						</p>
					</div>
				</details>
			{/if}
		</section>

		<div class="text-center">
			<button class="btn btn-primary" on:click={reset}>
				Verify Another Character
			</button>
		</div>
	{/if}

	<section class="mt-8 text-center text-secondary text-sm">
		<p>
			<a href="/" class="text-accent hover:underline">Create a character</a>
		</p>
	</section>
</main>
