# vcharacter-prime

Provably fair dice-based character creation with on-chain storage using Verus VDXF.

## Features

- **Provably Fair Dice**: Character stats derived from blockchain randomness using commit-reveal scheme
- **On-Chain Storage**: Characters and achievements stored in VerusID contentmultimap via VDXF
- **The Primordial Trial**: Turn-based combat game with deterministic, verifiable-replay rolls
- **Cross-Device Wallet Flow**: QR code scanning works across devices via Redis

## Requirements

- Node.js 20+
- Verus Mobile wallet (for signing transactions)
- Upstash Redis account (for cross-device flow)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Copy environment file and configure:
   ```bash
   cp .env.example .env
   ```
4. Set required environment variables in `.env`:
   - `SERVICE_IDENTITY_WIF` - Private key for service identity (testidx@ for testnet)
   - `UPSTASH_REDIS_REST_URL` - Redis URL from Upstash
   - `UPSTASH_REDIS_REST_TOKEN` - Redis token from Upstash

5. Run development server:
   ```bash
   yarn dev
   ```

## Pages

Live at [prime.vcharacter.xyz](https://prime.vcharacter.xyz):

- [Create](https://prime.vcharacter.xyz/) — Character creation
- [Play](https://prime.vcharacter.xyz/play) — The Primordial Trial game
- [Verify](https://prime.vcharacter.xyz/verify) — Verify characters and view achievements
- [How it works](https://prime.vcharacter.xyz/how-it-works) — Technical reference for the creation flow, on-chain data, and verification
- [Game guide](https://prime.vcharacter.xyz/game-guide) — Stat math, scenes, spirit animals, and combat mechanics
- [Verus Primer](https://prime.vcharacter.xyz/verus-primer) — The three Verus primitives behind vcharacter-prime: Proof of Power, VerusID, and ContentMultiMap with VDXF keys

## Network

Currently configured for **testnet** (vrsctest). To change networks, update `CURRENT_NETWORK` in `src/lib/config.ts`.

## License

MIT
