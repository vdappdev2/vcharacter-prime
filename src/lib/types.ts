/**
 * Type definitions for vcharacter-prime
 */

// ============================================================================
// Trait Constants and Types
// ============================================================================

/**
 * Elements (d6)
 */
export const ELEMENTS = ['Fire', 'Water', 'Earth', 'Air', 'Wood', 'Metal'] as const;
export type Element = (typeof ELEMENTS)[number];

/**
 * Spirit Animals (d12)
 */
export const SPIRIT_ANIMALS = [
  'Wolf',
  'Bear',
  'Eagle',
  'Dragon',
  'Octopus',
  'Owl',
  'Tiger',
  'Deer',
  'Spider',
  'Whale',
  'Elephant',
  'Frog',
] as const;
export type SpiritAnimal = (typeof SPIRIT_ANIMALS)[number];

/**
 * Sex (d2)
 */
export const SEXES = ['Male', 'Female'] as const;
export type Sex = (typeof SEXES)[number];

/**
 * Stat names
 */
export const STAT_NAMES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type StatName = (typeof STAT_NAMES)[number];

// ============================================================================
// Roll Labels for HMAC Derivation
// ============================================================================

/**
 * Labels for stat dice rolls (4d6 per stat = 24 total)
 */
export const STAT_LABELS: Record<StatName, readonly [string, string, string, string]> = {
  str: ['str_d1', 'str_d2', 'str_d3', 'str_d4'],
  dex: ['dex_d1', 'dex_d2', 'dex_d3', 'dex_d4'],
  con: ['con_d1', 'con_d2', 'con_d3', 'con_d4'],
  int: ['int_d1', 'int_d2', 'int_d3', 'int_d4'],
  wis: ['wis_d1', 'wis_d2', 'wis_d3', 'wis_d4'],
  cha: ['cha_d1', 'cha_d2', 'cha_d3', 'cha_d4'],
} as const;

/**
 * Labels for trait rolls (3 total)
 */
export const TRAIT_LABELS = {
  element: 'element',
  spiritAnimal: 'spirit_animal',
  sex: 'sex',
} as const;

// ============================================================================
// Character Data Structures
// ============================================================================

/**
 * A single stat roll (4d6)
 */
export interface StatRoll {
  /** The four dice values (1-6 each) */
  dice: [number, number, number, number];
  /** Sum of all four dice (4-24) */
  total: number;
  /** Modifier calculated from total: floor((stat - 14) / 2) */
  modifier: number;
}

/**
 * All six character stats
 */
export interface CharacterStats {
  str: StatRoll;
  dex: StatRoll;
  con: StatRoll;
  int: StatRoll;
  wis: StatRoll;
  cha: StatRoll;
}

/**
 * Character traits
 */
export interface CharacterTraits {
  element: Element;
  spiritAnimal: SpiritAnimal;
  sex: Sex;
}

/**
 * Verification data for provably fair rolls
 */
export interface VerificationData {
  /** Verus block height used as seed source */
  block_height: number;
  /** Verus block hash (the "server seed") */
  block_hash: string;
  /** Client-generated random seed (hex string) */
  client_seed: string;
  /** Unix timestamp when character was created */
  timestamp: number;
}

/**
 * Complete dice roll result
 */
export interface DiceRollResult {
  stats: CharacterStats;
  traits: CharacterTraits;
}

/**
 * Complete character with all data
 */
export interface Character {
  /** Character name (user-provided) */
  name: string;
  /** Character stats */
  stats: CharacterStats;
  /** Character traits */
  traits: CharacterTraits;
  /** Verification data for proving fairness */
  verification: VerificationData;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from /api/block endpoint
 */
export interface BlockResponse {
  height: number;
  hash: string;
  time: number;
}

/**
 * Verification result structure
 */
export interface VerificationResult {
  /** Overall verification passed */
  valid: boolean;
  /** Block hash matches blockchain */
  blockHashValid: boolean;
  /** Computed stats match stored stats */
  statsMatch: boolean;
  /** Computed traits match stored traits */
  traitsMatch: boolean;
  /** Recomputed stats (for comparison) */
  computedStats?: CharacterStats;
  /** Recomputed traits (for comparison) */
  computedTraits?: CharacterTraits;
  /** Error message if verification failed */
  error?: string;
}

// ============================================================================
// Commitment Types (Phase 2 - Login Consent Attestation)
// ============================================================================

/**
 * Commitment proof from Login Consent flow
 * Proves the client_seed was committed before the block hash was known
 *
 * This is the cryptographic proof that enables trustless verification:
 * - The response contains a signature that can be verified against the user's VerusID
 * - The signature includes the block height, proving when the commitment was made
 * - The clientSeedHash in the challenge proves what was committed
 */
export interface CommitmentProof {
  /** The original login consent challenge (JSON serialized) */
  challenge: string;
  /** The signed LoginConsentResponse (base64 encoded buffer for direct verification) */
  response: string;
  /** Block height when the user signed (extracted from signature) */
  signedBlockHeight: number;
  /** Hash of client_seed that was committed */
  clientSeedHash: string;
}

/**
 * Pending commitment awaiting user signature
 */
export interface PendingCommitment {
  /** Unique challenge ID (i-address format) */
  challengeId: string;
  /** Session ID for tracking */
  sessionId: string;
  /** Hash of client_seed */
  clientSeedHash: string;
  /** Client seed (kept server-side until reveal) */
  clientSeed: string;
  /** When this commitment was created */
  createdAt: number;
  /** When this commitment expires */
  expiresAt: number;
}

/**
 * Verified commitment ready for rolling
 */
export interface VerifiedCommitment {
  /** The commitment proof */
  proof: CommitmentProof;
  /** User's VerusID (i-address) */
  userIdentity: string;
  /** User's friendly name */
  userFriendlyName: string;
  /** Client seed (revealed after commitment verified) */
  clientSeed: string;
  /** Block height to use for rolling (commitmentBlockHeight + 1) */
  rollBlockHeight: number;
}

/**
 * Complete character with commitment proof (for storage)
 */
export interface StoredCharacter extends Character {
  /** User's VerusID (i-address) */
  userIdentity: string;
  /** User's friendly name */
  userFriendlyName: string;
  /** Commitment proof (proves fair rolling) */
  commitment: CommitmentProof;
  /** Block height used for randomness (must be > commitment.signedBlockHeight) */
  rollBlockHeight: number;
  /** Block hash used for randomness */
  rollBlockHash: string;
}

// ============================================================================
// API Types for Commitment Flow
// ============================================================================

/**
 * Request to create a commitment challenge
 */
export interface CreateCommitmentRequest {
  /** Hash of client_seed (SHA-256, hex string) */
  clientSeedHash: string;
  /** Callback URL for mobile wallet response */
  callbackUrl: string;
}

/**
 * Response from commitment request creation
 */
export interface CreateCommitmentResponse {
  /** QR code string (base64 encoded request) */
  qrString: string;
  /** Deep link URI for mobile wallet */
  deeplinkUri: string;
  /** Session ID for tracking */
  sessionId: string;
  /** Challenge ID for status polling */
  challengeId: string;
}

/**
 * Request to verify a commitment response
 */
export interface VerifyCommitmentRequest {
  /** Challenge ID */
  challengeId: string;
  /** Response data from wallet (base64 or deeplink) */
  responseData: string;
  /** Client seed to reveal (will be hashed and compared) */
  clientSeed: string;
}

/**
 * Response from commitment verification
 */
export interface VerifyCommitmentResponse {
  /** Whether verification succeeded */
  valid: boolean;
  /** User's VerusID */
  userIdentity?: string;
  /** User's friendly name */
  userFriendlyName?: string;
  /** Block height when commitment was signed */
  commitmentBlockHeight?: number;
  /** Block height to use for rolling */
  rollBlockHeight?: number;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Request to derive character from verified commitment
 */
export interface DeriveCharacterRequest {
  /** Challenge ID of verified commitment */
  challengeId: string;
  /** Client seed (must match committed hash) */
  clientSeed: string;
  /** Character name */
  name: string;
}

/**
 * Response from character derivation
 */
export interface DeriveCharacterResponse {
  /** The derived character */
  character?: StoredCharacter;
  /** Error message if derivation failed */
  error?: string;
}

/**
 * Commitment status (for polling)
 */
export type CommitmentStatus = 'pending' | 'completed' | 'expired' | 'not_found';

/**
 * Response from commitment status check
 */
export interface CommitmentStatusResponse {
  /** Current status */
  status: CommitmentStatus;
  /** Verified commitment data (if completed) */
  commitment?: VerifiedCommitment;
}

// ============================================================================
// On-Chain Storage Types
// ============================================================================

/**
 * Storage request status
 */
export type StorageStatus = 'pending' | 'signed' | 'stored' | 'expired' | 'not_found';

/**
 * Request to create on-chain storage
 */
export interface CreateStorageRequest {
  /** The complete character to store */
  character: StoredCharacter;
}

/**
 * Response from storage request creation
 */
export interface CreateStorageResponse {
  /** Unique request ID */
  requestId: string;
  /** Service-signed attestation of character data */
  attestation: string;
  /** Signature of the attestation */
  attestationSignature: string;
  /** JSON data for updateidentity command */
  updateIdentityData: string;
  /** When this request expires */
  expiresAt: number;
}

/**
 * Response from storage status check
 */
export interface StorageStatusResponse {
  /** Current status */
  status: StorageStatus;
  /** Transaction ID if stored */
  txid?: string;
  /** Character data */
  character?: StoredCharacter;
}

/**
 * Request to mark storage as complete
 */
export interface CompleteStorageRequest {
  /** Request ID */
  requestId: string;
  /** Transaction ID from updateidentity */
  txid: string;
}

/**
 * Response from storage completion
 */
export interface CompleteStorageResponse {
  /** Whether the completion was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Character Verification Types (Public API)
// ============================================================================

/**
 * Request to verify a character on-chain
 */
export interface VerifyCharacterRequest {
  /** Identity to check (i-address or friendly name) */
  identity: string;
}

/**
 * Response from character verification
 */
export interface VerifyCharacterResponse {
  /** Whether the character was found and verified */
  valid: boolean;
  /** The character data if found */
  character?: {
    name: string;
    stats: CharacterStats;
    traits: CharacterTraits;
    verification: {
      clientSeed: string;
      clientSeedHash: string;
      rollBlockHeight: number;
      rollBlockHash: string;
      commitmentBlockHeight: number;
    };
  };
  /** Verification details */
  verification?: {
    /** Block hash matches blockchain */
    blockHashValid: boolean;
    /** Stats were derived correctly */
    statsValid: boolean;
    /** Traits were derived correctly */
    traitsValid: boolean;
    /** All checks passed */
    allValid: boolean;
  };
  /** Error message if verification failed */
  error?: string;
}
