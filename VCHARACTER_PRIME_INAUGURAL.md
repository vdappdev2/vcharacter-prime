# vcharacter-prime inaugural — Provably Fair Characters on Verus

How characters are created, what data lives on-chain, and how anyone can verify the rolls were fair.

---

## What Is vcharacter-prime?

vcharacter-prime creates RPG characters whose stats are determined by provably fair dice rolls. The randomness comes from two independent sources — a secret you generate and a Verus block hash that doesn't exist yet. Neither side can manipulate the outcome alone, and the entire process is permanently recorded on your VerusID.

Your character isn't stored in a database. It lives on the Verus blockchain, inside your identity's `contentmultimap`. You own it. Anyone can read it, verify it, and confirm it was rolled fairly.

---

## The Creation Flow

### Step 1: Generate Your Secret Seed

Your browser generates a **32-byte cryptographically random seed** (the "client seed") using the Web Crypto API. This seed is one half of the randomness that will determine your character.

```
Client Seed: a7f3b2c1d4e5... (64 hex characters)
```

The seed never leaves your browser. Instead, a **SHA-256 hash** of the seed is computed:

```
Client Seed Hash: SHA-256(clientSeed) = 9e4f8a2b...
```

This hash is what gets committed — it proves what your seed was without revealing it yet.

### Step 2: Commit via VerusID Signature

A **LoginConsentRequest** challenge is created containing your seed hash. You sign this challenge with your VerusID using Verus Mobile (via QR code or deep link).

Your signature does three things:
1. **Binds your identity** — proves you are who you claim to be
2. **Locks in the seed hash** — you can't change your seed after signing
3. **Records the block height** — the signature includes a timestamp proving *when* you committed

The commitment is signed at block height `N`. Your character will be rolled using block `N+1` — a block that doesn't exist yet at the time you commit. This is the core of the fairness guarantee.

### Step 3: Wait for the Roll Block

The system waits for block `N+1` to be mined. This block's hash is the "server seed" — the second half of the randomness. No one can predict or control what this hash will be.

### Step 4: Roll Your Character

Once block `N+1` exists, the two seeds are combined:

```
Combined Seed = SHA-256(rollBlockHash + clientSeed)
```

From this single combined seed, every dice roll is derived deterministically using **HMAC-SHA256** with unique labels:

| Roll | Label | Die |
|------|-------|-----|
| STR die 1 | `str_d1` | d6 |
| STR die 2 | `str_d2` | d6 |
| STR die 3 | `str_d3` | d6 |
| STR die 4 | `str_d4` | d6 |
| DEX die 1 | `dex_d1` | d6 |
| ... | ... | ... |
| CHA die 4 | `cha_d4` | d6 |
| Element | `element` | d6 |
| Spirit Animal | `spirit_animal` | d12 |
| Sex | `sex` | d2 |

Each roll is computed as:

```
signature = HMAC-SHA256(combinedSeed, label)
value = (first 4 bytes as uint32) mod dieSize + 1
```

This produces 27 total rolls: 24 stat dice (4d6 × 6 stats), plus element, spirit animal, and sex.

### Step 5: Name and Store On-Chain

You give your character a name, then sign an `updateidentity` transaction (again via Verus Mobile) that writes the complete character data to your VerusID's `contentmultimap`.

---

## What Gets Stored On-Chain

Everything is stored under the **`prime.inaugural`** VDXF key on your VerusID. Each character consists of four labeled DataDescriptor entries:

### 1. Name (`.name`)

```
"Kael Stormborn"
```

Plain text. The character's display name.

### 2. Stats (`.stats`)

```json
{
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
    "dice": [6, 3, 4, 5],
    "total": 18,
    "modifier": 2
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
}
```

Every individual die result is recorded. The total is the sum of all four dice (4d6, range 4–24). The modifier is derived from the total: `floor((total - 13) / 2)`.

### 3. Traits (`.traits`)

```json
{
  "element": "Fire",
  "spirit": "Dragon",
  "sex": "Male"
}
```

- **Element** — one of Fire, Water, Earth, Air, Wood, Metal (d6)
- **Spirit Animal** — one of Wolf, Bear, Eagle, Dragon, Octopus, Owl, Tiger, Deer, Spider, Whale, Elephant, Frog (d12)
- **Sex** — Male or Female (d2)

### 4. Proof (`.proof`)

```json
{
  "clientSeed": "a7f3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "clientSeedHash": "9e4f8a2b1c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f",
  "rollBlockHeight": 4523891,
  "rollBlockHash": "000000000012a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8",
  "commitmentBlockHeight": 4523890
}
```

This is everything a verifier needs:

| Field | Purpose |
|-------|---------|
| `clientSeed` | The revealed secret seed (was hidden until after the roll block) |
| `clientSeedHash` | SHA-256 of the client seed (proves the seed wasn't changed after commitment) |
| `rollBlockHeight` | Which block's hash was used as the server seed |
| `rollBlockHash` | The actual block hash (can be confirmed against the Verus blockchain) |
| `commitmentBlockHeight` | When the commitment was signed (must be before rollBlockHeight) |

---

## Multiple Characters Per Identity

A single VerusID can hold multiple characters. Each character is a group of 4 entries (name, stats, traits, proof) appended to the `prime.inaugural` array in the contentmultimap. Characters are distinguished by their unique `rollBlockHeight` — since each character uses a different block for randomness, no two characters share the same value.

---

## How Verification Works

Anyone can verify a character in three steps:

### Step 1: Confirm the Seed Commitment

```
SHA-256(clientSeed) == clientSeedHash?
```

If yes, the player committed to this exact seed before the roll block existed.

### Step 2: Confirm the Block Hash

```
getblock(rollBlockHeight).hash == rollBlockHash?
```

Query the Verus blockchain directly. If the stored block hash matches the real blockchain, the server seed wasn't fabricated.

### Step 3: Re-derive the Character

Using the verified `clientSeed` and `rollBlockHash`, re-run the entire derivation:

```
combinedSeed = SHA-256(rollBlockHash + clientSeed)

For each stat (str, dex, con, int, wis, cha):
  For each die (d1, d2, d3, d4):
    roll = HMAC-SHA256(combinedSeed, "{stat}_{die}") → d6

element   = HMAC-SHA256(combinedSeed, "element")      → d6
spirit    = HMAC-SHA256(combinedSeed, "spirit_animal") → d12
sex       = HMAC-SHA256(combinedSeed, "sex")           → d2
```

Compare every re-derived value against the stored data. If they all match, the character is provably fair.

The verification page at `/verify` performs all three steps automatically.

---

## Why This Can't Be Cheated

| Attack | Why It Fails |
|--------|-------------|
| **Player changes seed after seeing block hash** | The seed hash was signed before the roll block existed. Changing the seed would break the hash. |
| **Server picks a favorable block** | The roll block is `commitmentBlock + 1` — the next block after the player commits. The server can't control Verus block hashes. |
| **Server fabricates the block hash** | The block hash is stored on-chain and can be checked against the real blockchain by anyone. |
| **Player re-rolls until they get good stats** | Each commitment uses a unique seed hash. Once committed, the character is determined. Starting over means a new commitment, new block, new character. |
| **Server manipulates the derivation** | The derivation algorithm (HMAC-SHA256 with labeled keys) is deterministic and public. Given the same inputs, any implementation will produce the same outputs. |

The trust is split: the player controls the client seed, the blockchain controls the block hash, and the math is deterministic. No single party can influence the outcome.

---

## On-Chain Data Structure

Here's what the raw contentmultimap looks like on a VerusID:

```
contentmultimap: {
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
}
```

The outer key (`prime.inaugural`) is a VDXF key — a deterministic i-address derived from the namespace `prime.inaugural` under the service identity. On testnet this is `testidx.vrsctest::prime.inaugural`, on mainnet `vcharacter.vrsc::prime.inaugural`.

Each inner entry is a DataDescriptor with:
- **label** — which field this is (`.name`, `.stats`, `.traits`, `.proof`)
- **mimetype** — `text/plain` for the name, `application/json` for structured data
- **objectdata** — the actual content

---

## Achievement Storage

When a character completes The Primordial Trial, a separate achievement record is stored under the **`prime.primordialtrial`** VDXF key:

```json
{
  "characterName": "Kael Stormborn",
  "characterRollBlockHeight": 4523891,
  "bossSceneSeed": "b2c3d4e5f6...",
  "bossSceneBlockHeight": 4524102,
  "bossSceneBlockHash": "00000000001a2b3c...",
  "playerActions": ["attack", "special", "attack", "defend", "attack", "attack"],
  "difficulty": "standard",
  "finalHp": 12,
  "roundsToWin": 6,
  "completedAtBlock": 4524102
}
```

This contains everything needed to **replay the entire boss fight** from scratch:
- The seed and block hash for re-deriving every combat dice roll
- The exact sequence of player actions
- The expected outcome (final HP, rounds to win, difficulty)

A verifier can re-derive every roll, replay every combat round in order, and confirm the outcome matches — proving the victory was legitimate.

---

## VDXF Key Reference

| Key | Testnet ID | Mainnet ID | Purpose |
|-----|-----------|-----------|---------|
| `prime.inaugural` | `iFyh3hu51uwFbNSmDxSPZCFzCVKf8rvEtr` | `iJxgKswyBJofVV5kFSdx4EudSFrtchdVWA` | Character data outer key |
| `prime.primordialtrial` | `iSKdCUtnwdRiMm1fyCdLqU7CynXdNX98HD` | `iD2eHL2tF2JDeZq5Ro7NR22tU8Z1UnB3cg` | Achievement data outer key |
| `prime.inaugural.commitment` | `iQQPkGHFazZQq3WGseVmf1Nhwj5m2gKQGU` | `iRqdBB5Tsm3PRZj2dTiWnS4iBvhxPg3be4` | Commitment challenge namespace |
| `.name` label | `iEKKM3YbgNvLoXVP4Uya7bsx54d2oQc1iQ` | `i9FPJynBLX8DxnsH58y1UFTpVqR73tCHVL` | Character name label |
| `.stats` label | `iNzD4oawft7rG6jfAF6CtzinVAeGbJyt3w` | `iGmAs4NcqXYAXoZ3G2JJYiijC5VpZ6WtLy` | Stats JSON label |
| `.traits` label | `iKrjYActmR6ZZfZkXWNDsVHuvyKmwiawSC` | `iJKSNMdzaJdAvY6sTUvfA1V9gY8K9NesUP` | Traits JSON label |
| `.proof` label | `iKTEgWF5SScKRKwte6YuubSn2iWq5Pc6iM` | `iPfkFE6wZUzwVo97T25RXq9KS23m1ZCWUW` | Verification proof label |
| DataDescriptor | `i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv` | `i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv` | DataDescriptor wrapper key |

---

## Summary

Every character on vcharacter-prime is:

- **Provably fair** — randomness from two independent sources, committed before the outcome is known
- **Permanently stored** — lives on your VerusID, not in a database
- **Fully transparent** — every individual die roll is recorded on-chain
- **Independently verifiable** — anyone can re-derive the character from the stored proof
- **Self-sovereign** — you own your identity, you own your character
