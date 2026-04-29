<script lang="ts">
	const proofrootFormula = `proofroot.power = chainstake[low 128 bits] || chainwork[low 128 bits]`;

	const popHexExample = `Block 4041971 (PoW)
  hash:       0000000000026ea1d8acacf5898942118ed480516b952dd46370b468023ef8ec
  chainwork:  00000000000000000000000000000000000000026e5624aab1c18282075d566c
  chainstake: 8000000000000000000000000000000000000000000d7a3f902a0f087f361c0d
  power:      00000000000d7a3f902a0f087f361c0d 000000026e5624aab1c18282075d566c
              └─ chainstake low 128 bits ─┘ └─ chainwork low 128 bits ─┘

Block 4041972 (PoS)
  hash:       847fa6d5649d560fb7e1a15de3289a2f39043a701c650f22b76f847a39467090
  chainwork:  00000000000000000000000000000000000000026e5624aab1c1a6293a0bbacf
  chainstake: 8000000000000000000000000000000000000000000d7a3f9033ec5b68356637
  power:      00000000000d7a3f9033ec5b68356637 000000026e5624aab1c1a6293a0bbacf`;

	const contentMultimapExample = `prime.inaugural: [
  { dataDescriptor: { label: ".name",   mimetype: "text/plain",       objectdata: "Kael Stormborn" } },
  { dataDescriptor: { label: ".stats",  mimetype: "application/json", objectdata: { strength: {...}, ... } } },
  { dataDescriptor: { label: ".traits", mimetype: "application/json", objectdata: { element: "Fire", ... } } },
  { dataDescriptor: { label: ".proof",  mimetype: "application/json", objectdata: { clientSeed: "...", rollBlockHash: "...", ... } } },
]`;
</script>

<svelte:head>
	<title>Verus Primer — vcharacter-prime: provably fair character creation on Verus</title>
	<meta name="description" content="How vcharacter-prime works on three Verus primitives: Proof of Power, VerusID, and ContentMultiMap with VDXF keys." />
	<link rel="canonical" href="https://prime.vcharacter.xyz/verus-primer" />
	<meta property="og:title" content="Verus Primer — vcharacter-prime: provably fair character creation on Verus" />
	<meta property="og:description" content="How vcharacter-prime works on three Verus primitives: Proof of Power, VerusID, and ContentMultiMap with VDXF keys." />
	<meta name="twitter:title" content="Verus Primer — vcharacter-prime: provably fair character creation on Verus" />
	<meta name="twitter:description" content="How vcharacter-prime works on three Verus primitives: Proof of Power, VerusID, and ContentMultiMap with VDXF keys." />
</svelte:head>

<main class="max-w-3xl mx-auto px-6 py-12 prose-doc">
	<h1>vcharacter-prime: provably fair character creation on Verus</h1>

	<p>A player opens the vcharacter-prime page and clicks <em>Roll a Character</em>. The browser generates a 32-byte secret seed locally and shows a QR code. The player scans it with Verus Mobile, signs once with their VerusID, and waits for the next Verus block to be mined. When the block lands, six stats, an element, a spirit animal, and a sex appear on screen — derived from the player's secret combined with the new block's hash. A second signature stores the character permanently to the player's VerusID under a contentmultimap entry. The page renders. Then it forgets.</p>

	<p>The app keeps no account, no email, no password, and no database row tied to the player. Open the same VerusID from a different machine and the same character is still there — because the character was never the app's. It belongs to the identity that signed it.</p>

	<p>Provably fair randomness without an oracle, user-owned state without per-app accounts, and content readable by other apps without an export API are common goals among blockchain platforms. Delivering all three in one short flow, on a public chain available today, requires specific primitives. vcharacter-prime relies on three of them:</p>

	<ol>
		<li><strong>Proof of Power</strong> — the consensus construct that makes the roll block's hash hard to rewrite, and therefore makes the dice trustworthy.</li>
		<li><strong>VerusID</strong> — a first-class on-chain identity that signs <em>and</em> stores user data, with no auxiliary account system.</li>
		<li><strong>ContentMultiMap and VDXF keys</strong> — a standardized way to put labeled, namespaced data inside an identity, so other apps can read it directly.</li>
	</ol>

	<p>What follows walks through each one as it appears in the character creation flow, what Verus actually does under the hood, and what that makes possible.</p>

	<hr/>

	<h2>1. Proof of Power: why the dice can hold</h2>

	<p>When the player commits, two pieces of information are locked in: a SHA-256 hash of the secret seed, and the block height at which the commitment was signed. The character is rolled using the <em>next</em> block — height N+1 — combined with the seed once it's revealed. The player can't change their seed after the block lands (the hash would no longer match), and the app can't pick a favorable block (block N+1 is whatever Verus produces next). The randomness comes from two sources, neither of which can move alone.</p>

	<p>That's the standard commit-reveal pattern. The interesting question is the one that's usually skipped: why is the block hash itself hard to rewrite?</p>

	<p>A reorg attacker who could replace block N+1 with a different block of their choosing could choose its hash, and therefore choose the dice. On a single-consensus chain, the cost of doing that is whatever it costs to outproduce the rest of the network at one game — hashpower on a PoW chain, stake on a PoS chain. Verus's consensus is structured differently. Every block on Verus is anchored by both, encoded directly in the block header.</p>

	<p>The relevant field is <code>proofroot.power</code>, returned by <code>getblock</code> on any Verus block. It's a 256-bit value laid out like this:</p>

	<pre><code>{proofrootFormula}</code></pre>

	<p><code>chainwork</code> is the cumulative proof-of-work to that height. <code>chainstake</code> is the cumulative proof-of-stake. Half the field is one, half is the other — regardless of whether the block itself was mined (PoW) or minted (PoS). To reorg past a given height, an attacker has to overwhelm the entire <code>power</code> value, which means competing on both halves simultaneously.</p>

	<p>Concretely, here are two adjacent mainnet blocks of opposite types:</p>

	<pre><code>{popHexExample}</code></pre>

	<p>Both fields advance on every block, just in different proportions. A PoW block contributes most of its weight to <code>chainwork</code> but still adds a small amount to <code>chainstake</code>; a PoS block does the opposite. Neither half stagnates. The bit-budget of <code>power</code> is type-agnostic — the same 50/50 layout exists on both blocks above.</p>

	<p>For the dice, this has one direct consequence. The character is bytes derived from <code>rollBlockHash</code> combined with the player's secret. The cost of changing those bytes — by replacing the roll block with a different one — is the cost of overpowering both halves of <code>power</code> from that height forward. Every subsequent block, of either type, deepens that cost on both axes. There is no single resource an attacker can stockpile to make the rewrite cheap.</p>

	<p>Phrased plainly: the randomness in a vcharacter-prime character inherits the same security that protects any transfer of funds or other blockchain transactions at the same height. The chain doesn't have a separate, weaker mechanism for application data — there is one consensus, and it is hybrid by construction.</p>

	<p>A note on language. It's tempting to summarize this as "secured by hashing" or "more proof-of-work than chain X." Both undersell what's happening. The right summary is the one Verus uses: Proof of Power, with the on-chain artifact being <code>proofroot.power</code>. A reader who wants to verify it can pull any block with <code>getblock &lt;height&gt;</code> on a Verus node and compare the field bit-for-bit to the layout above.</p>

	<hr/>

	<h2>2. VerusID: where the character lives</h2>

	<p>Most of the other "sign in with a wallet" flows you see use the wallet for one thing: authentication. The app verifies a signature, then writes everything else — username, profile, game state — to its own database, keyed by the wallet's address. The wallet is a login; the data belongs to the app.</p>

	<p>vcharacter-prime never reaches that step. There is no app-side database row for the player. Every piece of the character — the rolls, the proof, the achievement — is written to the player's VerusID itself, on-chain, in a transaction the player signs.</p>

	<p>This works because a VerusID is not simply an address. It is a named, on-chain identity record that can hold data, define spending conditions, point to revocation and recovery authorities, attach a private z-address, and accept updates from its controller via the standard <code>updateidentity</code> transaction. The character creation flow uses two of these capabilities, in two signatures.</p>

	<p><strong>Signature one — the commitment.</strong> When the player clicks <em>Roll a Character</em>, the app builds a <code>GenericRequest</code> envelope carrying an <code>AuthenticationRequestDetails</code> payload. The SHA-256 hash of the player's secret seed is embedded in the request's ResponseURI query string; because the envelope's signature covers the ResponseURI, the seed hash becomes part of the cryptographic commit. The player countersigns the envelope with their VerusID in Verus Mobile. That countersignature does three things at once: it asserts that the signer controls that VerusID, it binds the seed hash to a specific block height (the wallet's signature includes the height it was produced at), and it commits the player to that exact seed before block N+1 exists.</p>

	<p><strong>Signature two — the write.</strong> Once block N+1 lands and the character is derived, the player names it. The app prepares another <code>GenericRequest</code> envelope — same envelope shape as the commitment, but this one carries an <code>IdentityUpdateRequestDetails</code> payload describing four entries to add to the VerusID's contentmultimap (name, stats, traits, proof — the structure of which is the subject of pillar three). The player countersigns in Verus Mobile, and the resulting <code>updateidentity</code> transaction is broadcast. The transaction confirms on the network like any other Verus transaction. From that point on, the character is part of the on-chain record of that identity.</p>

	<p>Both signatures go through the same <code>signGenericRequest</code> machinery — the difference is what kind of details payload sits inside the envelope.</p>

	<p>The app's role ends at the second signature. There is no row to update later, no profile table to migrate, no account to recover. If the vcharacter-prime servers go offline tomorrow, the character is unaffected — its bytes are already on Verus, under the identity's control. A different instance of the renderer, deployed by anyone, can read the same VerusID and show the same character.</p>

	<p>This is the practical meaning of "self-sovereign data." The phrase is often used loosely; on Verus it has a specific shape. The user holds the controlling key for the VerusID, the data lives in the identity's record on-chain, and updates require the user's signature. There is no parallel system — no per-app account database with the user's "real" data — that the user is granted a view into.</p>

	<p>For comparison:</p>

	<ul>
		<li>A traditional account stores user data in an app database, indexed by an email or username the app issues.</li>
		<li>An EVM-wallet "sign-in-with-Ethereum" flow proves wallet ownership; the app still stores user data in its own database, indexed by the wallet address.</li>
		<li>A VerusID flow proves identity ownership, then writes user data into the identity itself. The identity <em>is</em> the storage, on a public chain, controlled by the user.</li>
	</ul>

	<p>The difference is concrete. An app on the traditional side can grant or withhold access to a user's data. An app on the VerusID side has no data access to grant — the data is not in its custody.</p>

	<hr/>

	<h2>3. ContentMultiMap and VDXF: what other apps can do with the character</h2>

	<p>A character on vcharacter-prime is more than persistent. It is <em>addressable</em> by anything with a Verus node and a key.</p>

	<p>The container is the contentmultimap — a field on every VerusID that maps a key to an ordered list of structured data entries. The keys are not strings. They are VDXF identifiers: deterministic i-addresses derived from a namespace string under a controlling identity. Any app, given the namespace <code>vcharacter.vrsc::prime.inaugural</code>, can compute the same i-address — <code>iJxgKswyBJofVV5kFSdx4EudSFrtchdVWA</code> — and use it to look up entries on any VerusID. There is no registry to query, no permission to request, no API to call beyond the standard <code>getidentity</code>.</p>

	<p>A vcharacter-prime character lives under the outer key <code>prime.inaugural</code> and consists of four entries, each labeled by its own VDXF key:</p>

	<pre><code>{contentMultimapExample}</code></pre>

	<p>The outer key (<code>prime.inaugural</code>) groups the four entries as a unit. The labels (<code>.name</code>, <code>.stats</code>, <code>.traits</code>, <code>.proof</code>) are also VDXF keys — they identify which slot each entry occupies. A second character, rolled later by the same player, appends another four entries to the same outer key. Multiple characters per identity, distinguished by the unique <code>rollBlockHeight</code> recorded in each <code>.proof</code>.</p>

	<p>A separate outer key, <code>prime.primordialtrial</code>, holds achievement records — one per completed boss fight, with the seed, block hash, action sequence, and outcome needed to replay the fight from scratch.</p>

	<p>What makes this composable is that the structure is public and the access path is direct. A different app — one that has never spoken to vcharacter-prime, that has no related API key, that needs no permission — can do the following from any Verus node:</p>

	<ol>
		<li>Look up a VerusID with <code>getidentity &lt;name&gt;@</code>.</li>
		<li>Read the <code>contentmultimap</code> field.</li>
		<li>Index into <code>prime.inaugural</code> by its computed i-address.</li>
		<li>Pull the entry it cares about, by label.</li>
	</ol>

	<p>If that other app only needs the player's charisma score, it reads <code>.stats</code> and ignores the rest. If it wants the full character, it pulls all four entries. If it wants every character on the identity, it reads the full array. The data does not have to be requested, exported, transformed, or re-published. It is already in the identity, in a form the chain itself standardizes.</p>

	<p>This shape has a downstream consequence for schema changes. A new version of the character format — one that adds a backstory field, for example — does not extend <code>prime.inaugural</code>. It mints a new outer key, <code>prime.inaugural.v2</code>, and writes there. Old characters under the original key keep their original meaning; new characters under the v2 key are unambiguous about their format. Apps that read v1 keep working; apps that understand v2 opt in. There is no schema migration on the chain because nothing about the old data is altered.</p>

	<p>The phrase often used for this kind of design is <em>data ownership</em>. The phrase is general; the Verus version is specific. A user owns their data when other apps can read and build on it without coordinating with the original publisher — when interoperability is a property of the storage, not a feature granted by an API. ContentMultiMap and VDXF supply that property at the protocol level. The character a player rolled on vcharacter-prime is, in a practical sense, a public dataset with a stable schema and a clear owner: anyone can read it, no one can rewrite it without the controlling key, and any new application that wants to use it can.</p>

	<hr/>

	<h2>Closing</h2>

	<p>vcharacter-prime is not a complicated app. The complexity it leans on is in Verus itself — three primitives that, taken together, cover the parts of the flow that would otherwise need an oracle, a database, and an API.</p>

	<ul>
		<li><strong>Proof of Power</strong> secures the dice. The bytes a character is derived from inherit the same hybrid PoW/PoS guarantees that secure funds on Verus.</li>
		<li><strong>VerusID</strong> holds the data. The character is part of the player's on-chain identity, signed by the player, with no parallel app-side account.</li>
		<li><strong>ContentMultiMap and VDXF</strong> make the data composable. Any app with a key can read it, and schema changes are additive new keys rather than rewrites of old ones.</li>
	</ul>

	<p>The Primordial Trial — the in-character boss fight at <a href="/play">/play</a> — applies the same primitives to gameplay with one architectural difference. The character-creation seed is signed on-chain before the roll block exists (via a signed <code>GenericRequest</code> envelope whose ResponseURI carries the seed hash); the boss-scene seed is committed only locally before its block lands. Both then use the same labeled HMAC-SHA256 derivation — one combined seed, distinguished by labels (<code>player_attack_0</code>, <code>enemy_damage_0</code>, and so on) for every roll across the scene. After victory, the seed, block hash, full player action sequence, and outcome are written under a separate outer key, <code>prime.primordialtrial</code>, on the player's VerusID. Anyone can re-derive every roll, replay the actions in order, and confirm the recorded outcome from the stored inputs. The character itself is provably fair; the trial outcome is verifiably replayable.</p>

	<p>For readers who want the full mechanics, the existing pages cover the rest: <a href="/how-it-works">/how-it-works</a> walks through the character creation flow with the complete VDXF key reference, <a href="/game-guide">/game-guide</a> covers stat math and trial scenes, and <a href="/verify">/verify</a> runs the verification steps end-to-end on any character. The repository is open source.</p>

	<p>vcharacter-prime is one application built on these primitives. The primitives themselves are general — anything that fits the pattern of <em>user-controlled data, derived from public randomness, readable by anyone with a key</em> can be built the same way. The characters that result carry that pattern's guarantees end to end: every die is recorded, every roll is reproducible from on-chain inputs, every state change is signed by the player, and the result is the player's to keep. The phrase <em>provably fair character creation</em> in the title is meant literally.</p>
</main>
