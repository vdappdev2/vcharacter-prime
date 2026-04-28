<script lang="ts">
	const clientSeedExample = `Client Seed: a7f3b2c1d4e5... (64 hex characters)`;

	const clientSeedHashExample = `Client Seed Hash: SHA-256(clientSeed) = 9e4f8a2b...`;

	const combinedSeedFormula = `Combined Seed = SHA-256(rollBlockHash + clientSeed)`;

	const hmacFormula = `signature = HMAC-SHA256(combinedSeed, label)
value = (first 4 bytes as uint32) mod dieSize + 1`;

	const nameExample = `"Kael Stormborn"`;

	const statsJson = `{
  "strength": {
    "dice": [4, 6, 3, 5],
    "total": 18,
    "modifier": 2
  },
  "dexterity": {
    "dice": [2, 5, 4, 3],
    "total": 14,
    "modifier": 0
  },
  "constitution": {
    "dice": [4, 3, 4, 4],
    "total": 15,
    "modifier": 1
  },
  "intelligence": {
    "dice": [3, 2, 4, 1],
    "total": 10,
    "modifier": -2
  },
  "wisdom": {
    "dice": [5, 4, 6, 2],
    "total": 17,
    "modifier": 2
  },
  "charisma": {
    "dice": [3, 3, 5, 4],
    "total": 15,
    "modifier": 1
  }
}`;

	const traitsJson = `{
  "element": "Fire",
  "spirit": "Dragon",
  "sex": "Male"
}`;

	const proofJson = `{
  "clientSeed": "a7f3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "clientSeedHash": "9e4f8a2b1c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f",
  "rollBlockHeight": 4523891,
  "rollBlockHash": "000000000012a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8",
  "commitmentBlockHeight": 4523890
}`;

	const verifyStep1 = `SHA-256(clientSeed) == clientSeedHash?`;

	const verifyStep2 = `getblock(rollBlockHeight).hash == rollBlockHash?`;

	const rederiveCode = `combinedSeed = SHA-256(rollBlockHash + clientSeed)

For each stat (str, dex, con, int, wis, cha):
  For each die (d1, d2, d3, d4):
    roll = HMAC-SHA256(combinedSeed, "{stat}_{die}") → d6

element   = HMAC-SHA256(combinedSeed, "element")      → d6
spirit    = HMAC-SHA256(combinedSeed, "spirit_animal") → d12
sex       = HMAC-SHA256(combinedSeed, "sex")           → d2`;

	const contentMultimapExample = `contentmultimap: {
  "prime.inaugural": [
    // Character 1
    { dataDescriptor: { label: ".name",   mimetype: "text/plain",        objectdata: "Kael Stormborn" } },
    { dataDescriptor: { label: ".stats",  mimetype: "application/json",  objectdata: { ... } } },
    { dataDescriptor: { label: ".traits", mimetype: "application/json",  objectdata: { ... } } },
    { dataDescriptor: { label: ".proof",  mimetype: "application/json",  objectdata: { ... } } },

    // Character 2 (same identity, different roll block)
    { dataDescriptor: { label: ".name",   ... } },
    { dataDescriptor: { label: ".stats",  ... } },
    { dataDescriptor: { label: ".traits", ... } },
    { dataDescriptor: { label: ".proof",  ... } },
  ]
}`;

	const achievementJson = `{
  "characterName": "Kael Stormborn",
  "characterRollBlockHeight": 4523891,
  "bossSceneSeed": "b2c3d4e5f6...",
  "bossSceneBlockHeight": 4524102,
  "bossSceneBlockHash": "00000000001a2b3c...",
  "playerActions": ["attack", "special", "attack", "defend", "attack", "attack"],
  "difficulty": "standard",
  "finalHp": 12,
  "maxHp": 23,
  "roundsToWin": 6,
  "completedAtBlock": 4524102,
  "pathChosen": "might",
  "bargainChoice": "wisdom",
  "bargainBothBuffs": true,
  "spiritAbilityUsed": true,
  "puzzleResults": {
    "decipher": "success",
    "perceive": "success",
    "manipulate": "failure"
  }
}`;
</script>

<svelte:head>
	<title>How it works — vcharacter-prime</title>
	<meta name="description" content="How vcharacter-prime characters are created, what data lives on-chain, and how anyone can verify the rolls were fair." />
</svelte:head>

<main class="max-w-3xl mx-auto px-6 py-12 prose-doc">
	<h1>vcharacter-prime inaugural — Provably Fair Characters on Verus</h1>
	<p>How characters are created, what data lives on-chain, and how anyone can verify the rolls were fair.</p>

	<hr/>

	<h2>What Is vcharacter-prime?</h2>
	<p>vcharacter-prime creates RPG characters whose stats are determined by provably fair dice rolls. The randomness comes from two independent sources — a secret you generate and a Verus block hash that doesn't exist yet. Neither side can manipulate the outcome alone, and the entire process is permanently recorded on your VerusID.</p>
	<p>Your character isn't stored in a database. It lives on the Verus blockchain, inside your identity's <code>contentmultimap</code>. You own it. Anyone can read it, verify it, and confirm it was rolled fairly.</p>

	<hr/>

	<h2>The Creation Flow</h2>

	<h3>Step 1: Generate Your Secret Seed</h3>
	<p>Your browser generates a <strong>32-byte cryptographically random seed</strong> (the "client seed") using the Web Crypto API. This seed is one half of the randomness that will determine your character.</p>
	<pre><code>{clientSeedExample}</code></pre>
	<p>The seed never leaves your browser. Instead, a <strong>SHA-256 hash</strong> of the seed is computed:</p>
	<pre><code>{clientSeedHashExample}</code></pre>
	<p>This hash is what gets committed — it proves what your seed was without revealing it yet.</p>

	<h3>Step 2: Commit via VerusID Signature</h3>
	<p>A signed <strong>GenericRequest</strong> envelope (carrying an <strong>AuthenticationRequestDetails</strong> payload) is created and the seed hash is embedded in the request's ResponseURI query string. Because the envelope's signature covers the ResponseURI, the seed hash becomes part of the cryptographic commit. You countersign this request with your VerusID using Verus Mobile (via QR code or deep link).</p>
	<p>Your signature does three things:</p>
	<ol>
		<li><strong>Binds your identity</strong> — proves you are who you claim to be</li>
		<li><strong>Locks in the seed hash</strong> — you can't change your seed after signing</li>
		<li><strong>Records the block height</strong> — the signature includes a timestamp proving <em>when</em> you committed</li>
	</ol>
	<p>The commitment is signed at block height <code>N</code>. Your character will be rolled using block <code>N+1</code> — a block that doesn't exist yet at the time you commit. This is the core of the fairness guarantee.</p>

	<h3>Step 3: Wait for the Roll Block</h3>
	<p>The system waits for block <code>N+1</code> to be mined. This block's hash is the "server seed" — the second half of the randomness. No one can predict or control what this hash will be.</p>

	<h3>Step 4: Roll Your Character</h3>
	<p>Once block <code>N+1</code> exists, the two seeds are combined:</p>
	<pre><code>{combinedSeedFormula}</code></pre>
	<p>From this single combined seed, every dice roll is derived deterministically using <strong>HMAC-SHA256</strong> with unique labels:</p>
	<table>
		<thead>
			<tr><th>Roll</th><th>Label</th><th>Die</th></tr>
		</thead>
		<tbody>
			<tr><td>STR die 1</td><td><code>str_d1</code></td><td>d6</td></tr>
			<tr><td>STR die 2</td><td><code>str_d2</code></td><td>d6</td></tr>
			<tr><td>STR die 3</td><td><code>str_d3</code></td><td>d6</td></tr>
			<tr><td>STR die 4</td><td><code>str_d4</code></td><td>d6</td></tr>
			<tr><td>DEX die 1</td><td><code>dex_d1</code></td><td>d6</td></tr>
			<tr><td>...</td><td>...</td><td>...</td></tr>
			<tr><td>CHA die 4</td><td><code>cha_d4</code></td><td>d6</td></tr>
			<tr><td>Element</td><td><code>element</code></td><td>d6</td></tr>
			<tr><td>Spirit Animal</td><td><code>spirit_animal</code></td><td>d12</td></tr>
			<tr><td>Sex</td><td><code>sex</code></td><td>d2</td></tr>
		</tbody>
	</table>
	<p>Each roll is computed as:</p>
	<pre><code>{hmacFormula}</code></pre>
	<p>This produces 27 total rolls: 24 stat dice (4d6 × 6 stats), plus element, spirit animal, and sex.</p>

	<h3>Step 5: Name and Store On-Chain</h3>
	<p>You give your character a name, then sign an <code>updateidentity</code> transaction (again via Verus Mobile) that writes the complete character data to your VerusID's <code>contentmultimap</code>.</p>

	<hr/>

	<h2>What Gets Stored On-Chain</h2>
	<p>Everything is stored under the <strong><code>prime.inaugural</code></strong> VDXF key on your VerusID. Each character consists of four labeled DataDescriptor entries:</p>

	<h3>1. Name (<code>.name</code>)</h3>
	<pre><code>{nameExample}</code></pre>
	<p>Plain text. The character's display name.</p>

	<h3>2. Stats (<code>.stats</code>)</h3>
	<pre><code>{statsJson}</code></pre>
	<p>Every individual die result is recorded. The total is the sum of all four dice (4d6, range 4–24). The modifier is derived from the total: <code>floor((total - 13) / 2)</code>.</p>

	<h3>3. Traits (<code>.traits</code>)</h3>
	<pre><code>{traitsJson}</code></pre>
	<ul>
		<li><strong>Element</strong> — one of Fire, Water, Earth, Air, Wood, Metal (d6)</li>
		<li><strong>Spirit Animal</strong> — one of Wolf, Bear, Eagle, Dragon, Octopus, Owl, Tiger, Deer, Spider, Whale, Elephant, Frog (d12)</li>
		<li><strong>Sex</strong> — Male or Female (d2)</li>
	</ul>

	<h3>4. Proof (<code>.proof</code>)</h3>
	<pre><code>{proofJson}</code></pre>
	<p>This is everything a verifier needs:</p>
	<table>
		<thead>
			<tr><th>Field</th><th>Purpose</th></tr>
		</thead>
		<tbody>
			<tr><td><code>clientSeed</code></td><td>The revealed secret seed (was hidden until after the roll block)</td></tr>
			<tr><td><code>clientSeedHash</code></td><td>SHA-256 of the client seed (proves the seed wasn't changed after commitment)</td></tr>
			<tr><td><code>rollBlockHeight</code></td><td>Which block's hash was used as the server seed</td></tr>
			<tr><td><code>rollBlockHash</code></td><td>The actual block hash (can be confirmed against the Verus blockchain)</td></tr>
			<tr><td><code>commitmentBlockHeight</code></td><td>When the commitment was signed (must be before rollBlockHeight)</td></tr>
		</tbody>
	</table>

	<hr/>

	<h2>Multiple Characters Per Identity</h2>
	<p>A single VerusID can hold multiple characters. Each character is a group of 4 entries (name, stats, traits, proof) appended to the <code>prime.inaugural</code> array in the contentmultimap. Characters are distinguished by their unique <code>rollBlockHeight</code> — since each character uses a different block for randomness, no two characters share the same value.</p>

	<hr/>

	<h2>How Verification Works</h2>
	<p>Anyone can verify a character in three steps:</p>

	<h3>Step 1: Confirm the Seed Commitment</h3>
	<pre><code>{verifyStep1}</code></pre>
	<p>If yes, the player committed to this exact seed before the roll block existed.</p>

	<h3>Step 2: Confirm the Block Hash</h3>
	<pre><code>{verifyStep2}</code></pre>
	<p>Query the Verus blockchain directly. If the stored block hash matches the real blockchain, the server seed wasn't fabricated.</p>

	<h3>Step 3: Re-derive the Character</h3>
	<p>Using the verified <code>clientSeed</code> and <code>rollBlockHash</code>, re-run the entire derivation:</p>
	<pre><code>{rederiveCode}</code></pre>
	<p>Compare every re-derived value against the stored data. If they all match, the character is provably fair.</p>
	<p>The verification page at <a href="/verify">/verify</a> performs all three steps automatically.</p>

	<hr/>

	<h2>Why This Can't Be Cheated</h2>
	<table>
		<thead>
			<tr><th>Attack</th><th>Why It Fails</th></tr>
		</thead>
		<tbody>
			<tr><td><strong>Player changes seed after seeing block hash</strong></td><td>The seed hash was signed before the roll block existed. Changing the seed would break the hash.</td></tr>
			<tr><td><strong>Server picks a favorable block</strong></td><td>The roll block is <code>commitmentBlock + 1</code> — the next block after the player commits. The server can't control Verus block hashes.</td></tr>
			<tr><td><strong>Server fabricates the block hash</strong></td><td>The block hash is stored on-chain and can be checked against the real blockchain by anyone.</td></tr>
			<tr><td><strong>Player re-rolls until they get good stats</strong></td><td>Each commitment uses a unique seed hash. Once committed, the character is determined. Starting over means a new commitment, new block, new character.</td></tr>
			<tr><td><strong>Server manipulates the derivation</strong></td><td>The derivation algorithm (HMAC-SHA256 with labeled keys) is deterministic and public. Given the same inputs, any implementation will produce the same outputs.</td></tr>
		</tbody>
	</table>
	<p>The trust is split: the player controls the client seed, the blockchain controls the block hash, and the math is deterministic. No single party can influence the outcome.</p>

	<hr/>

	<h2>On-Chain Data Structure</h2>
	<p>Here's what the raw contentmultimap looks like on a VerusID:</p>
	<pre><code>{contentMultimapExample}</code></pre>
	<p>The outer key (<code>prime.inaugural</code>) is a VDXF key — a deterministic i-address derived from the namespace <code>prime.inaugural</code> under the service identity. On testnet this is <code>testidx.vrsctest::prime.inaugural</code>, on mainnet <code>vcharacter.vrsc::prime.inaugural</code>.</p>
	<p>Each inner entry is a DataDescriptor with:</p>
	<ul>
		<li><strong>label</strong> — which field this is (<code>.name</code>, <code>.stats</code>, <code>.traits</code>, <code>.proof</code>)</li>
		<li><strong>mimetype</strong> — <code>text/plain</code> for the name, <code>application/json</code> for structured data</li>
		<li><strong>objectdata</strong> — the actual content</li>
	</ul>

	<hr/>

	<h2>Achievement Storage</h2>
	<p>When a character completes The Primordial Trial, a separate achievement record is stored under the <strong><code>prime.primordialtrial</code></strong> VDXF key:</p>
	<pre><code>{achievementJson}</code></pre>
	<p>This contains everything needed to <strong>replay the entire boss fight</strong> from scratch:</p>
	<ul>
		<li>The seed and block hash for re-deriving every combat dice roll</li>
		<li>The exact sequence of player actions</li>
		<li>The trial-context choices that shaped combat (<code>pathChosen</code> for the path bonus, <code>bargainChoice</code> and <code>bargainBothBuffs</code> for the Gift of Power / Gift of Wisdom buffs, <code>spiritAbilityUsed</code> for whether the one-use spirit power was still available)</li>
		<li>The Scene 4 puzzle outcomes (<code>puzzleResults</code>) — the INT, WIS, and DEX skill checks all change the player's pre-boss state: INT success grants a permanent +2 attack buff active in the boss fight, DEX success heals 8 HP, INT/DEX failure deals damage, and the WIS check changes round 1 of the boss fight (success: the Primordial skips its first attack; failure: the Primordial gets a free attack before the player's first action)</li>
		<li>The expected outcome (<code>maxHp</code>, <code>finalHp</code>, <code>roundsToWin</code>, <code>difficulty</code>)</li>
	</ul>
	<p>A verifier can re-derive every roll, replay every combat round in order, and confirm the outcome matches — proving the victory was legitimate.</p>

	<hr/>

	<h2>VDXF Key Reference</h2>
	<table>
		<thead>
			<tr><th>Key</th><th>Testnet ID</th><th>Mainnet ID</th><th>Purpose</th></tr>
		</thead>
		<tbody>
			<tr><td><code>prime.inaugural</code></td><td><code>iFyh3hu51uwFbNSmDxSPZCFzCVKf8rvEtr</code></td><td><code>iJxgKswyBJofVV5kFSdx4EudSFrtchdVWA</code></td><td>Character data outer key</td></tr>
			<tr><td><code>prime.primordialtrial</code></td><td><code>iSKdCUtnwdRiMm1fyCdLqU7CynXdNX98HD</code></td><td><code>iD2eHL2tF2JDeZq5Ro7NR22tU8Z1UnB3cg</code></td><td>Achievement data outer key</td></tr>
			<tr><td><code>prime.inaugural.commitment</code></td><td><code>iQQPkGHFazZQq3WGseVmf1Nhwj5m2gKQGU</code></td><td><code>iRqdBB5Tsm3PRZj2dTiWnS4iBvhxPg3be4</code></td><td>Commitment challenge namespace</td></tr>
			<tr><td><code>.name</code> label</td><td><code>iEKKM3YbgNvLoXVP4Uya7bsx54d2oQc1iQ</code></td><td><code>i9FPJynBLX8DxnsH58y1UFTpVqR73tCHVL</code></td><td>Character name label</td></tr>
			<tr><td><code>.stats</code> label</td><td><code>iNzD4oawft7rG6jfAF6CtzinVAeGbJyt3w</code></td><td><code>iGmAs4NcqXYAXoZ3G2JJYiijC5VpZ6WtLy</code></td><td>Stats JSON label</td></tr>
			<tr><td><code>.traits</code> label</td><td><code>iKrjYActmR6ZZfZkXWNDsVHuvyKmwiawSC</code></td><td><code>iJKSNMdzaJdAvY6sTUvfA1V9gY8K9NesUP</code></td><td>Traits JSON label</td></tr>
			<tr><td><code>.proof</code> label</td><td><code>iKTEgWF5SScKRKwte6YuubSn2iWq5Pc6iM</code></td><td><code>iPfkFE6wZUzwVo97T25RXq9KS23m1ZCWUW</code></td><td>Verification proof label</td></tr>
			<tr><td>DataDescriptor</td><td><code>i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv</code></td><td><code>i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv</code></td><td>DataDescriptor wrapper key</td></tr>
		</tbody>
	</table>

	<hr/>

	<h2>Summary</h2>
	<p>Every character on vcharacter-prime is:</p>
	<ul>
		<li><strong>Provably fair</strong> — randomness from two independent sources, committed before the outcome is known</li>
		<li><strong>Permanently stored</strong> — lives on your VerusID, not in a database</li>
		<li><strong>Fully transparent</strong> — every individual die roll is recorded on-chain</li>
		<li><strong>Independently verifiable</strong> — anyone can re-derive the character from the stored proof</li>
		<li><strong>Self-sovereign</strong> — you own your identity, you own your character</li>
	</ul>
</main>
