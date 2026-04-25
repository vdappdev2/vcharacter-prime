<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';
	import { generateClientSeed, sha256String } from '$lib/crypto';
	import type { StoredCharacter, CharacterStats } from '$lib/types';

	// localStorage keys
	const STORAGE_KEY_SEED = 'vcharacter_client_seed';
	const STORAGE_KEY_HASH = 'vcharacter_client_seed_hash';

	// State machine
	type FlowState =
		| 'idle'
		| 'generating_seed'
		| 'committing'
		| 'waiting_signature'
		| 'waiting_block'
		| 'rolling'
		| 'naming'
		| 'storing'
		| 'complete';

	let state: FlowState = 'idle';
	let error: string | null = null;

	// Commitment data
	let clientSeed = '';
	let clientSeedHash = '';
	let deeplinkUri = '';
	let qrDataUrl = '';

	// Verified commitment data
	let userIdentity = '';
	let userFriendlyName = '';
	let commitmentBlockHeight = 0;
	let rollBlockHeight = 0;
	let currentBlockHeight = 0;
	let blocksToWait = 0;

	// Character data
	let character: StoredCharacter | null = null;
	let characterName = '';

	// Storage data
	let storageRequestId = '';
	let storageTxid = '';
	let storageVerified = false;
	let storageDeeplinkUri = '';
	let storageQrDataUrl = '';

	// Polling
	let pollTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleVisibilityChange() {
		if (document.visibilityState !== 'visible' || !pollTimeout) return;
		if (state === 'waiting_signature') startCommitmentPolling(true);
		else if (state === 'waiting_block') startBlockPolling(true);
		else if (state === 'storing') startStoragePolling(true);
	}

	onMount(() => {
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	onDestroy(() => {
		if (pollTimeout) clearTimeout(pollTimeout);
	});

	// ========== Commitment Flow ==========

	async function startCreation() {
		state = 'generating_seed';
		error = null;

		try {
			// Generate client seed
			clientSeed = await generateClientSeed();
			clientSeedHash = await sha256String(clientSeed);

			// Store in localStorage (survives page refresh)
			localStorage.setItem(STORAGE_KEY_SEED, clientSeed);
			localStorage.setItem(STORAGE_KEY_HASH, clientSeedHash);

			state = 'committing';

			// Create commitment request
			const response = await fetch('/api/commitment/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ clientSeedHash }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to create commitment request');
			}

			const data = await response.json();
			deeplinkUri = data.deeplinkUri;

			// Generate QR code
			qrDataUrl = await QRCode.toDataURL(deeplinkUri, {
				width: 256,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' },
			});

			state = 'waiting_signature';

			// Start polling for wallet response
			startCommitmentPolling();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			state = 'idle';
			localStorage.removeItem(STORAGE_KEY_SEED);
			localStorage.removeItem(STORAGE_KEY_HASH);
		}
	}

	function startCommitmentPolling(immediate = false) {
		if (pollTimeout) clearTimeout(pollTimeout);

		pollTimeout = setTimeout(async function poll() {
			try {
				const response = await fetch(`/api/commitment/status?seedHash=${clientSeedHash}`);
				const data = await response.json();

				if (data.status === 'received') {
					pollTimeout = null;
					await verifyAndDeriveCharacter();
					if (state === 'waiting_block') {
						startBlockPolling();
					}
				} else {
					pollTimeout = setTimeout(poll, 3000);
				}
			} catch (err) {
				console.error('Polling error:', err);
				pollTimeout = setTimeout(poll, 3000);
			}
		}, immediate ? 0 : 3000);
	}

	async function verifyAndDeriveCharacter() {
		// Only show "rolling" state on first call, not during block polling
		const isBlockPolling = state === 'waiting_block';
		if (!isBlockPolling) {
			state = 'rolling';
		}

		try {
			const response = await fetch('/api/commitment/verify-stateless', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clientSeed,
					characterName: characterName || 'Unnamed Hero',
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Verification failed');
			}

			error = null;

			if (data.status === 'waiting_block') {
				userIdentity = data.userIdentity;
				commitmentBlockHeight = data.commitmentBlockHeight;
				rollBlockHeight = data.rollBlockHeight;
				currentBlockHeight = data.currentHeight;
				blocksToWait = data.blocksToWait;
				state = 'waiting_block';
			} else if (data.status === 'complete') {
				// Show rolling animation briefly
				state = 'rolling';
				await new Promise((resolve) => setTimeout(resolve, 1000));

				character = data.character;
				userIdentity = data.verification.userIdentity;
				userFriendlyName = data.verification.userFriendlyName;
				commitmentBlockHeight = data.verification.commitmentBlockHeight;
				rollBlockHeight = data.verification.rollBlockHeight;

				// Clear stored seed
				localStorage.removeItem(STORAGE_KEY_SEED);
				localStorage.removeItem(STORAGE_KEY_HASH);

				state = 'naming';
			}
		} catch (err) {
			// During block polling, transient RPC errors are retryable
			if (isBlockPolling) {
				console.error('Transient verification error during block wait:', err);
				return;
			}
			error = err instanceof Error ? err.message : 'Unknown error';
			state = 'idle';
			localStorage.removeItem(STORAGE_KEY_SEED);
			localStorage.removeItem(STORAGE_KEY_HASH);
		}
	}

	function startBlockPolling(immediate = false) {
		if (pollTimeout) clearTimeout(pollTimeout);

		pollTimeout = setTimeout(async function poll() {
			try {
				await verifyAndDeriveCharacter();
				if (state === 'waiting_block') {
					pollTimeout = setTimeout(poll, 5000);
				}
			} catch (err) {
				console.error('Block polling error:', err);
				if (state === 'waiting_block') {
					pollTimeout = setTimeout(poll, 5000);
				}
			}
		}, immediate ? 0 : 5000);
	}

	// ========== Storage Flow ==========

	function updateName() {
		if (character && characterName.trim()) {
			character = { ...character, name: characterName.trim() };
		}
		state = 'storing';
		startStorage();
	}

	async function startStorage() {
		if (!character) return;
		error = null;

		try {
			const response = await fetch('/api/character/store', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ character }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to create storage request');
			}

			const data = await response.json();
			storageRequestId = data.requestId;
			storageDeeplinkUri = data.deeplinkUri;

			// Generate QR code - use low error correction to reduce density for large data
			storageQrDataUrl = await QRCode.toDataURL(storageDeeplinkUri, {
				width: 512,
				margin: 2,
				errorCorrectionLevel: 'L',
				color: { dark: '#000000', light: '#ffffff' },
			});

			// Start polling for storage response
			startStoragePolling();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		}
	}

	function startStoragePolling(immediate = false) {
		if (pollTimeout) clearTimeout(pollTimeout);

		pollTimeout = setTimeout(async function poll() {
			try {
				const response = await fetch(`/api/storage/status?requestId=${storageRequestId}`);
				const data = await response.json();

				if (data.status === 'received') {
					pollTimeout = null;
					storageTxid = data.txid;
					storageVerified = !!data.verified;
					state = 'complete';
				} else {
					pollTimeout = setTimeout(poll, 3000);
				}
			} catch (err) {
				console.error('Storage polling error:', err);
				pollTimeout = setTimeout(poll, 3000);
			}
		}, immediate ? 0 : 3000);
	}

	// ========== Helpers ==========

	function reset() {
		if (pollTimeout) {
			clearTimeout(pollTimeout);
			pollTimeout = null;
		}
		localStorage.removeItem(STORAGE_KEY_SEED);
		localStorage.removeItem(STORAGE_KEY_HASH);

		state = 'idle';
		error = null;
		clientSeed = '';
		clientSeedHash = '';
		deeplinkUri = '';
		qrDataUrl = '';
		userIdentity = '';
		userFriendlyName = '';
		commitmentBlockHeight = 0;
		rollBlockHeight = 0;
		currentBlockHeight = 0;
		blocksToWait = 0;
		character = null;
		characterName = '';
		storageRequestId = '';
		storageTxid = '';
		storageVerified = false;
		storageDeeplinkUri = '';
		storageQrDataUrl = '';
	}

	function formatModifier(mod: number): string {
		return mod >= 0 ? `+${mod}` : `${mod}`;
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}
</script>

<main class="container mx-auto px-4 py-8 max-w-4xl">
	<header class="text-center mb-12">
		<h1 class="text-4xl font-bold text-accent mb-2">vcharacter-prime</h1>
		<p class="text-secondary">Provably Fair Character Creation on Verus</p>
	</header>

	{#if error}
		<div class="card mb-6 border-l-4 border-l-[var(--color-error)]">
			<p class="text-[var(--color-error)]">{error}</p>
			<button class="btn btn-secondary mt-4" on:click={reset}>Try Again</button>
		</div>
	{/if}

	{#if state === 'idle'}
		<section class="card glow-gold">
			<h2 class="text-2xl mb-4 text-accent">Create Your Character</h2>
			<p class="text-secondary mb-6">
				Roll your character's stats using provably fair dice powered by the Verus blockchain.
				Every roll is deterministic and independently verifiable.
			</p>

			<div class="bg-elevated rounded-lg p-4 mb-6">
				<h3 class="text-lg mb-2 text-accent">How It Works</h3>
				<ol class="text-secondary space-y-2 list-decimal list-inside">
					<li>A random seed is generated in your browser</li>
					<li>You commit to this seed by signing with your VerusID</li>
					<li>A future block provides the randomness for your rolls</li>
					<li>Anyone can verify your character was rolled fairly</li>
				</ol>
			</div>

			<div class="text-center">
				<button class="btn btn-primary" on:click={startCreation}>
					Begin Character Creation
				</button>
			</div>
		</section>

	{:else if state === 'generating_seed'}
		<section class="card glow-gold text-center">
			<div class="dice-rolling text-4xl mb-4">&#127922;</div>
			<p class="text-secondary">Generating your secret seed...</p>
		</section>

	{:else if state === 'committing'}
		<section class="card glow-gold text-center">
			<div class="dice-rolling text-4xl mb-4">&#128220;</div>
			<p class="text-secondary">Creating commitment request...</p>
		</section>

	{:else if state === 'waiting_signature'}
		<section class="card glow-gold">
			<h2 class="text-2xl mb-4 text-accent">Sign Your Commitment</h2>
			<p class="text-secondary mb-6">
				Scan the QR code or tap the button to sign with Verus Mobile.
			</p>

			<div class="bg-elevated rounded-lg p-4 mb-6">
				<h3 class="text-sm text-secondary mb-2">Your Seed Hash (Commitment)</h3>
				<p class="hash text-xs text-accent break-all">{clientSeedHash}</p>
			</div>

			{#if qrDataUrl}
				<div class="flex justify-center mb-6">
					<img src={qrDataUrl} alt="Scan with Verus Mobile" class="rounded-lg bg-white p-2" width="256" height="256" />
				</div>
			{/if}

			<div class="flex flex-col gap-4 items-center mb-6">
				<a href={deeplinkUri} class="btn btn-primary w-full max-w-md">
					Open in Verus Mobile
				</a>
				<button class="btn btn-secondary w-full max-w-md" on:click={() => copyToClipboard(deeplinkUri)}>
					Copy Deep Link
				</button>
			</div>

			<div class="text-center">
				<div class="inline-block animate-pulse mb-2">
					<span class="text-2xl">&#8987;</span>
				</div>
				<p class="text-secondary text-sm">Waiting for signature...</p>
			</div>

			<div class="mt-6 text-center">
				<button class="btn btn-secondary" on:click={reset}>Cancel</button>
			</div>
		</section>

	{:else if state === 'waiting_block'}
		<section class="card glow-gold">
			<h2 class="text-2xl mb-4 text-accent">Commitment Verified!</h2>

			<div class="bg-elevated rounded-lg p-4 mb-6">
				<p class="text-secondary">
					Signed as <span class="text-accent font-bold">{userFriendlyName || userIdentity}</span>
				</p>
			</div>

			<div class="text-center mb-6">
				<div class="inline-block animate-pulse">
					<span class="text-4xl">&#9939;</span>
				</div>
				<p class="text-secondary mt-2">Waiting for roll block...</p>
				<p class="text-lg text-accent mt-2">
					Block {currentBlockHeight} / {rollBlockHeight}
				</p>
				{#if blocksToWait > 0}
					<p class="text-secondary text-sm">
						{blocksToWait} block{blocksToWait === 1 ? '' : 's'} to go
					</p>
				{/if}
			</div>

			<div class="bg-elevated rounded-lg p-4">
				<p class="text-xs text-secondary">
					Commitment at block {commitmentBlockHeight}. Character will be rolled using block {rollBlockHeight}.
				</p>
			</div>
		</section>

	{:else if state === 'rolling'}
		<section class="card glow-gold text-center">
			<div class="dice-rolling text-4xl mb-4">&#127922;</div>
			<p class="text-secondary">Rolling your character...</p>
		</section>

	{:else if state === 'naming' && character}
		<section class="card glow-gold">
			<h2 class="text-2xl mb-4 text-accent">Name Your Character</h2>

			<div class="mb-6">
				<label class="block text-secondary mb-2" for="character-name">Character Name</label>
				<input
					id="character-name"
					type="text"
					bind:value={characterName}
					placeholder="Enter a name for your hero"
					class="w-full bg-elevated border border-[var(--color-border)] rounded-lg px-4 py-2 text-primary focus:border-accent focus:outline-none"
				/>
			</div>

			<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
				{#each ['str', 'dex', 'con', 'int', 'wis', 'cha'] as stat}
					{@const roll = character.stats[stat as keyof CharacterStats]}
					<div class="bg-elevated rounded-lg p-4 text-center">
						<p class="text-sm text-secondary uppercase">{stat}</p>
						<p class="stat-value">{roll.total}</p>
						<p class="stat-modifier {roll.modifier >= 0 ? 'positive' : 'negative'}">
							{formatModifier(roll.modifier)}
						</p>
					</div>
				{/each}
			</div>

			<div class="flex flex-wrap gap-4 justify-center mb-6">
				<div class="bg-elevated rounded-lg px-4 py-2">
					<span class="text-secondary">Element:</span>
					<span class="text-accent ml-1">{character.traits.element}</span>
				</div>
				<div class="bg-elevated rounded-lg px-4 py-2">
					<span class="text-secondary">Spirit:</span>
					<span class="text-accent ml-1">{character.traits.spiritAnimal}</span>
				</div>
				<div class="bg-elevated rounded-lg px-4 py-2">
					<span class="text-secondary">Sex:</span>
					<span class="text-accent ml-1">{character.traits.sex}</span>
				</div>
			</div>

			<div class="text-center">
				<button class="btn btn-primary" on:click={updateName}>
					{characterName.trim() ? 'Confirm Name' : 'Keep as Unnamed Hero'}
				</button>
			</div>
		</section>

	{:else if state === 'storing' && character}
		<section class="card glow-gold">
			<h2 class="text-2xl mb-4 text-accent">Save to Your VerusID</h2>
			<p class="text-secondary mb-6">
				Scan the QR code or tap the button to save your character.
			</p>

			<div class="bg-elevated rounded-lg p-4 mb-6">
				<h3 class="text-lg mb-2 text-accent">{character.name}</h3>
				<p class="text-secondary text-sm">Created by {character.userFriendlyName}</p>
			</div>

			{#if storageQrDataUrl}
				<div class="flex justify-center mb-6">
					<img src={storageQrDataUrl} alt="Scan with Verus Mobile" class="rounded-lg bg-white p-2" width="300" height="300" />
				</div>
			{/if}

			<div class="flex flex-col gap-4 items-center mb-6">
				<a href={storageDeeplinkUri} class="btn btn-primary w-full max-w-md">
					Open in Verus Mobile
				</a>
				<button class="btn btn-secondary w-full max-w-md" on:click={() => copyToClipboard(storageDeeplinkUri)}>
					Copy Deep Link
				</button>
			</div>

			<div class="text-center">
				<div class="inline-block animate-pulse mb-2">
					<span class="text-2xl">&#8987;</span>
				</div>
				<p class="text-secondary text-sm">Waiting for confirmation...</p>
			</div>

			<div class="mt-6 text-center">
				<button class="btn btn-secondary" on:click={reset}>Cancel</button>
			</div>
		</section>

	{:else if state === 'complete' && character}
		<section class="card glow-gold">
			<header class="text-center mb-6">
				<h2 class="text-3xl text-accent">{character.name}</h2>
				<p class="text-secondary">
					Created by <span class="text-accent">{character.userFriendlyName}</span>
				</p>
				{#if storageTxid}
					{#if storageVerified}
						<p class="text-xs text-[var(--color-success)] mt-2">Broadcast to mempool</p>
					{:else}
						<p class="text-xs text-secondary mt-2">Still waiting…</p>
					{/if}
				{/if}
			</header>

			<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
				{#each ['str', 'dex', 'con', 'int', 'wis', 'cha'] as stat}
					{@const roll = character.stats[stat as keyof CharacterStats]}
					<div class="bg-elevated rounded-lg p-4 text-center">
						<p class="text-sm text-secondary uppercase">{stat}</p>
						<p class="stat-value">{roll.total}</p>
						<p class="stat-modifier {roll.modifier >= 0 ? 'positive' : 'negative'}">
							{formatModifier(roll.modifier)}
						</p>
						<p class="text-xs text-secondary mt-1">{roll.dice.join(' + ')}</p>
					</div>
				{/each}
			</div>

			<div class="flex flex-wrap gap-4 justify-center mb-6">
				<div class="bg-elevated rounded-lg px-4 py-2">
					<span class="text-secondary">Element:</span>
					<span class="text-accent ml-1">{character.traits.element}</span>
				</div>
				<div class="bg-elevated rounded-lg px-4 py-2">
					<span class="text-secondary">Spirit:</span>
					<span class="text-accent ml-1">{character.traits.spiritAnimal}</span>
				</div>
				<div class="bg-elevated rounded-lg px-4 py-2">
					<span class="text-secondary">Sex:</span>
					<span class="text-accent ml-1">{character.traits.sex}</span>
				</div>
			</div>

			<div class="divider my-6"></div>

			<details class="bg-elevated rounded-lg p-4">
				<summary class="cursor-pointer text-accent">Verification Data</summary>
				<div class="mt-4 space-y-2 text-xs">
					<p>
						<span class="text-secondary">Commitment Block:</span>
						<span class="hash">{character.commitment.signedBlockHeight}</span>
					</p>
					<p>
						<span class="text-secondary">Roll Block:</span>
						<span class="hash">{character.rollBlockHeight}</span>
					</p>
					<p>
						<span class="text-secondary">Roll Block Hash:</span>
						<span class="hash">{character.rollBlockHash}</span>
					</p>
					<p>
						<span class="text-secondary">Client Seed:</span>
						<span class="hash">{character.verification.client_seed}</span>
					</p>
					<p>
						<span class="text-secondary">Client Seed Hash:</span>
						<span class="hash">{character.commitment.clientSeedHash}</span>
					</p>
					<p>
						<span class="text-secondary">User Identity:</span>
						<span class="hash">{character.userIdentity}</span>
					</p>
					{#if storageTxid}
						<p>
							<span class="text-secondary">Storage TX:</span>
							<span class="hash">{storageTxid}</span>
						</p>
					{/if}
				</div>
			</details>

			<div class="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
				<a href="/play" class="btn btn-primary">Play the Trial</a>
				<button class="btn btn-secondary" on:click={reset}>Create Another</button>
			</div>
		</section>
	{/if}

	<section class="mt-8 text-center text-secondary text-sm">
		<p>
			<a href="/play" class="text-accent hover:underline">Play the Trial</a>
			{' | '}
			<a href="/verify" class="text-accent hover:underline">Verify a character</a>
		</p>
	</section>
</main>
