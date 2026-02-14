/**
 * vcharacter-prime Configuration
 *
 * Central configuration adapted from vtimestamp
 */

import { PUBLIC_VERUS_NETWORK, PUBLIC_SWITCH_NETWORK_URL } from '$env/static/public';

// Environment detection
export const isDev = import.meta.env.DEV;
export const isProd = import.meta.env.PROD;

/**
 * Verus RPC Configuration
 */
export const RPC_ENDPOINTS = {
  testnet: {
    primary: 'https://api.verustest.net',
    fallback: 'https://rpc.vrsc.syncproof.net',
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
 * VDXF Key Constants for vcharacter.prime
 *
 * Schema: testidx.vrsc::vcharacter.prime.*
 *
 * To generate these IDs, run:
 *   ./verus -chain=vrsctest getvdxfid "testidx.vrsc::vcharacter.prime.name"
 *
 * NOTE: Empty strings are placeholders - generate with getvdxfid before use
 */

// Testnet VDXF Keys (testidx.vrsc:: namespace)
// Generated via: ./verus -chain=vrsctest getvdxfid "testidx.vrsc::vcharacter.prime.*"
const TESTNET_VDXF = {
  // Commitment challenge namespace (used in LoginConsentRequest)
  // This identifies the challenge type, not stored on-chain
  commitment: 'iN3W5tMiUDsynyybU8F7mAsUMLaJ2SC7wA', // testidx.vrsc::vcharacter.prime.commitment

  // Outer key for on-chain storage (contentmultimap)
  characterProof: 'iH23EJcg8DdBVxquDTL7DdXwhGrJVDXw9m', // testidx.vrsc::vcharacter.prime

  // Achievement outer key for game completions
  // Generated via: ./verus -chain=vrsctest getvdxfid "testidx.vrsc::vcharacter.primordialtrial"
  primordialTrial: 'iFwnKUrmraHChJu2qPn26Wvg2S9KA9fzM2', // testidx.vrsc::vcharacter.primordialtrial

  // Labels (inside DataDescriptor, within the outer key)
  labels: {
    name: 'i7RDiQaNUiydDL7SmnB28orZU9bKHBJ6Da',   // testidx.vrsc::vcharacter.prime.name
    stats: 'i8wNry1hvfGAHz8E8TeLKDfGubw2mArcUu',  // testidx.vrsc::vcharacter.prime.stats
    traits: 'iJHVegfTh2ZdZBLNTBbQpSRxEJN3iLhrjv', // testidx.vrsc::vcharacter.prime.traits
    proof: 'iJDM7zPtGaHZ3jUw3KDt4QarWBvgN7TMs9',  // testidx.vrsc::vcharacter.prime.proof
  },
};

// Mainnet VDXF Keys (TBD - will use different namespace, e.g., vrsc::vcharacter.prime.*)
const MAINNET_VDXF = {
  commitment: '',
  characterProof: '',
  primordialTrial: '',
  labels: {
    name: '',
    stats: '',
    traits: '',
    proof: '',
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
 * The service identity is used to sign commitment challenges.
 * For testnet: testidx@ (testidx.vrsctest@)
 *
 * The private key (WIF) should be set in environment variable SERVICE_IDENTITY_WIF
 * Get it with: ./verus -chain=vrsctest dumpprivkey <primary_address>
 */
export const SERVICE_IDENTITY = {
  // Identity name (friendly name)
  name: CURRENT_NETWORK === 'testnet' ? 'testidx@' : '', // TBD for mainnet
  // Identity i-address (required for signing - must be base58)
  iAddress: CURRENT_NETWORK === 'testnet' ? 'i6V4or9qptD5JzxkqgUKz45tvtBNMb72N3' : '', // TBD for mainnet
};

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
  version: '0.3.0',
  network: CURRENT_NETWORK,
};
