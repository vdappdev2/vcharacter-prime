/**
 * Character Verification Utilities
 *
 * Provides functions to verify that character stats were generated
 * fairly from the stored verification data.
 */

import { rollCharacter } from './dice';
import type {
  Character,
  CharacterStats,
  CharacterTraits,
  VerificationData,
  VerificationResult,
  BlockResponse,
  DiceRollResult,
} from './types';

/**
 * Fetch block data from the API
 *
 * @param height - Optional block height (if not provided, fetches latest)
 * @returns Block data including height, hash, and time
 */
export async function fetchBlock(height?: number): Promise<BlockResponse> {
  const url = height !== undefined ? `/api/block?height=${height}` : '/api/block';

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Compare two stat objects for equality
 */
function statsEqual(a: CharacterStats, b: CharacterStats): boolean {
  const statNames = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

  for (const stat of statNames) {
    if (a[stat].total !== b[stat].total) return false;
    for (let i = 0; i < 4; i++) {
      if (a[stat].dice[i] !== b[stat].dice[i]) return false;
    }
  }

  return true;
}

/**
 * Compare two trait objects for equality
 */
function traitsEqual(a: CharacterTraits, b: CharacterTraits): boolean {
  return (
    a.element === b.element &&
    a.spiritAnimal === b.spiritAnimal &&
    a.sex === b.sex
  );
}

/**
 * Verify a character's stats and traits against the verification data
 *
 * This performs the full verification process:
 * 1. Query Verus API to confirm block hash matches
 * 2. Recompute dice rolls from seeds
 * 3. Compare computed values to stored values
 *
 * @param character - Character to verify
 * @returns Verification result with details
 */
export async function verifyCharacter(character: Character): Promise<VerificationResult> {
  const { stats, traits, verification } = character;

  try {
    // Step 1: Verify block hash matches blockchain
    const block = await fetchBlock(verification.block_height);
    const blockHashValid = block.hash === verification.block_hash;

    if (!blockHashValid) {
      return {
        valid: false,
        blockHashValid: false,
        statsMatch: false,
        traitsMatch: false,
        error: 'Block hash does not match blockchain record',
      };
    }

    // Step 2: Recompute dice rolls
    const computed = await rollCharacter(verification.block_hash, verification.client_seed);

    // Step 3: Compare results
    const statsMatch = statsEqual(stats, computed.stats);
    const traitsMatch = traitsEqual(traits, computed.traits);

    return {
      valid: statsMatch && traitsMatch,
      blockHashValid: true,
      statsMatch,
      traitsMatch,
      computedStats: computed.stats,
      computedTraits: computed.traits,
    };
  } catch (err) {
    return {
      valid: false,
      blockHashValid: false,
      statsMatch: false,
      traitsMatch: false,
      error: err instanceof Error ? err.message : 'Unknown verification error',
    };
  }
}

/**
 * Verify character offline (without blockchain check)
 *
 * This only verifies that the dice rolls match the seeds,
 * but does not confirm the block hash is authentic.
 *
 * @param character - Character to verify
 * @returns Verification result (blockHashValid is assumed true)
 */
export async function verifyCharacterOffline(character: Character): Promise<VerificationResult> {
  const { stats, traits, verification } = character;

  try {
    // Recompute dice rolls
    const computed = await rollCharacter(verification.block_hash, verification.client_seed);

    // Compare results
    const statsMatch = statsEqual(stats, computed.stats);
    const traitsMatch = traitsEqual(traits, computed.traits);

    return {
      valid: statsMatch && traitsMatch,
      blockHashValid: true, // Assumed true for offline verification
      statsMatch,
      traitsMatch,
      computedStats: computed.stats,
      computedTraits: computed.traits,
    };
  } catch (err) {
    return {
      valid: false,
      blockHashValid: false,
      statsMatch: false,
      traitsMatch: false,
      error: err instanceof Error ? err.message : 'Unknown verification error',
    };
  }
}

/**
 * Create verification data for a new character
 *
 * @param blockHeight - Block height used for seed
 * @param blockHash - Block hash (server seed)
 * @param clientSeed - Client-generated random seed
 * @returns Verification data structure
 */
export function createVerificationData(
  blockHeight: number,
  blockHash: string,
  clientSeed: string
): VerificationData {
  return {
    block_height: blockHeight,
    block_hash: blockHash,
    client_seed: clientSeed,
    timestamp: Date.now(),
  };
}

/**
 * Create a complete character with verification data
 *
 * @param name - Character name
 * @param blockHeight - Block height
 * @param blockHash - Block hash (server seed)
 * @param clientSeed - Client-generated random seed
 * @returns Complete character with stats, traits, and verification
 */
export async function createCharacter(
  name: string,
  blockHeight: number,
  blockHash: string,
  clientSeed: string
): Promise<Character> {
  const { stats, traits } = await rollCharacter(blockHash, clientSeed);

  return {
    name,
    stats,
    traits,
    verification: createVerificationData(blockHeight, blockHash, clientSeed),
  };
}

/**
 * Format verification data for display
 *
 * @param verification - Verification data
 * @returns Human-readable string
 */
export function formatVerificationData(verification: VerificationData): string {
  return `Block Height: ${verification.block_height}
Block Hash: ${verification.block_hash}
Client Seed: ${verification.client_seed}
Created: ${new Date(verification.timestamp).toISOString()}`;
}
