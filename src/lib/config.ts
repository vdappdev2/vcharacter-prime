/**
 * vcharacter-prime Configuration
 *
 * Central configuration adapted from vtimestamp
 */

import { PUBLIC_VERUS_NETWORK, PUBLIC_SWITCH_NETWORK_URL } from '$env/static/public';

// Injected by Vite `define` in vite.config.ts — pulls version from package.json
// at build time so the two can no longer drift, without requiring src/lib/config.ts
// to reach outside the FS allow list.
declare const __APP_VERSION__: string;

// Environment detection
export const isDev = import.meta.env.DEV;
export const isProd = import.meta.env.PROD;

/**
 * Verus RPC Configuration
 */
export const RPC_ENDPOINTS = {
  testnet: {
    primary: 'https://api.verustest.net',
    // No fallback for testnet. syncproof.net is a mainnet (VRSC) daemon —
    // falling over to it would silently return mainnet blocks/identities and
    // break re-derivation in /api/character/verify. If a vrsctest fallback
    // appears later, set it here.
    fallback: '',
  },
  mainnet: {
    primary: 'https://api.verus.services',
    fallback: 'https://rpc.vrsc.syncproof.net',
  },
};

// Current network - read from environment variable
export const CURRENT_NETWORK: 'testnet' | 'mainnet' =
  PUBLIC_VERUS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

// URL of the other network's deployment (for the switch link)
export const SWITCH_NETWORK_URL = PUBLIC_SWITCH_NETWORK_URL || '';

export const VERUS_RPC = {
  // Public daemon RPC endpoints (primary with fallback)
  endpoint: RPC_ENDPOINTS[CURRENT_NETWORK].primary,
  fallbackEndpoint: RPC_ENDPOINTS[CURRENT_NETWORK].fallback,

  // Chain ID
  chainId: CURRENT_NETWORK === 'testnet' ? 'vrsctest' : 'vrsc',

  // Request timeout in milliseconds
  timeout: 30000,
};

/**
 * Chain IDs for VerusID
 */
export const CHAIN_IDS = {
  testnet: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq', // VRSCTEST
  mainnet: 'i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV', // VRSC
} as const;

/**
 * VDXF Key Constants for prime.inaugural
 *
 * Testnet schema: testidx.vrsctest::prime.inaugural.*
 * Mainnet schema: vcharacter.vrsc::prime.inaugural.*
 *
 * To generate these IDs, run:
 *   ./verus -chain=vrsctest getvdxfid "testidx.vrsctest::prime.inaugural.name"
 *   ./verus getvdxfid "vcharacter.vrsc::prime.inaugural.name"
 */

// Testnet VDXF Keys (testidx.vrsctest:: namespace)
//
// Outer keys used in contentmultimap come in two forms:
//   - *Fqn form: passed to the WALLET when building updateidentity requests.
//     Per plan §9.2, the wallet rejects raw i-address outer keys for custom
//     (non-well-known) keys — it only validates them when the outer key is an
//     FQN whose namespace resolves to the signing identity.
//   - i-address form: used when READING back from the daemon. The daemon may
//     or may not normalize FQN → i-address on storage (undocumented). Readers
//     accept both forms per plan §9.3.
//
// The namespace of each FQN (e.g. "testidx.vrsctest") must resolve to the
// i-address configured in SERVICE_IDENTITY_IADDRESS (.env).
const TESTNET_VDXF = {
  // Commitment challenge namespace (used in GenericRequest authentication flow)
  commitment: 'iQQPkGHFazZQq3WGseVmf1Nhwj5m2gKQGU', // testidx.vrsctest::prime.inaugural.commitment

  // Outer key for on-chain storage (contentmultimap)
  primeInaugural: 'iFyh3hu51uwFbNSmDxSPZCFzCVKf8rvEtr', // testidx.vrsctest::prime.inaugural
  primeInauguralFqn: 'testidx.vrsctest::prime.inaugural',

  // Achievement outer key for game completions
  primordialTrial: 'iSKdCUtnwdRiMm1fyCdLqU7CynXdNX98HD', // testidx.vrsctest::prime.primordialtrial
  primordialTrialFqn: 'testidx.vrsctest::prime.primordialtrial',

  // Labels (inside DataDescriptor, within the outer key).
  // Plan §9.2: "Labels inside DataDescriptor entries aren't subject to this
  // check — they can stay as raw i-addresses."
  labels: {
    name: 'iEKKM3YbgNvLoXVP4Uya7bsx54d2oQc1iQ',   // .name
    stats: 'iNzD4oawft7rG6jfAF6CtzinVAeGbJyt3w',   // .stats
    traits: 'iKrjYActmR6ZZfZkXWNDsVHuvyKmwiawSC',  // .traits
    proof: 'iKTEgWF5SScKRKwte6YuubSn2iWq5Pc6iM',   // .proof
  },
};

// Mainnet VDXF Keys (vcharacter.vrsc:: namespace)
const MAINNET_VDXF = {
  // Commitment challenge namespace
  commitment: 'iRqdBB5Tsm3PRZj2dTiWnS4iBvhxPg3be4', // vcharacter.vrsc::prime.inaugural.commitment

  // Outer key for on-chain storage (contentmultimap)
  primeInaugural: 'iJxgKswyBJofVV5kFSdx4EudSFrtchdVWA', // vcharacter.vrsc::prime.inaugural
  primeInauguralFqn: 'vcharacter.vrsc::prime.inaugural',

  // Achievement outer key for game completions
  primordialTrial: 'iD2eHL2tF2JDeZq5Ro7NR22tU8Z1UnB3cg', // vcharacter.vrsc::prime.primordialtrial
  primordialTrialFqn: 'vcharacter.vrsc::prime.primordialtrial',

  // Labels (inside DataDescriptor, within the outer key)
  labels: {
    name: 'i9FPJynBLX8DxnsH58y1UFTpVqR73tCHVL',     // .name
    stats: 'iGmAs4NcqXYAXoZ3G2JJYiijC5VpZ6WtLy',    // .stats
    traits: 'iJKSNMdzaJdAvY6sTUvfA1V9gY8K9NesUP',   // .traits
    proof: 'iPfkFE6wZUzwVo97T25RXq9KS23m1ZCWUW',    // .proof
  },
};

export const VDXF_KEYS = {
  // DataDescriptor wrapper key (same for testnet and mainnet)
  dataDescriptor: 'i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv',

  // Network-specific keys
  ...(CURRENT_NETWORK === 'testnet' ? TESTNET_VDXF : MAINNET_VDXF),
};

/**
 * Service Identity Configuration
 *
 * The service identity signs commitment and storage requests. Its name, i-address,
 * and WIF private key are all driven by environment variables — set them in .env
 * per the current network. See .env.example for the testnet/mainnet values and
 * the CLI commands to derive them.
 *
 * Env vars (all read at request time via $env/dynamic/private):
 *   SERVICE_IDENTITY_NAME     — e.g. "testidx@" or "vcharacter@"
 *   SERVICE_IDENTITY_IADDRESS — e.g. "i6V4or9qptD5JzxkqgUKz45tvtBNMb72N3"
 *   SERVICE_IDENTITY_WIF      — WIF private key of the identity's primary address
 *
 * Aligned with vtimestamp's env convention so the three-app fleet (prime, sales,
 * ninja) shares one deployment shape.
 */

/**
 * Commitment Configuration
 */
export const COMMITMENT_CONFIG = {
  // How long a commitment challenge is valid (10 minutes)
  challengeTTL: 10 * 60 * 1000,

  // How long to keep verified commitments for rolling (15 minutes)
  // Extended to handle high block time variance
  completedTTL: 15 * 60 * 1000,

  // How many blocks to wait after commitment before rolling
  rollBlockDelay: 1,
};

/**
 * App Metadata
 */
export const APP_META = {
  name: 'vcharacter-prime',
  description: 'Provably fair character creation on Verus',
  version: __APP_VERSION__,
  network: CURRENT_NETWORK,
};
