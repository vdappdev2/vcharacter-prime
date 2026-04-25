/**
 * Deterministic Dice System for Gameplay (verifiable replay)
 *
 * Extends the character-creation dice primitive to in-game rolls. Same
 * HMAC-SHA256 derivation with labeled keys — but unlike character creation,
 * gameplay seeds are not bound to a wallet signature, so this gives
 * deterministic, replayable rolls rather than provable fairness.
 */

import { sha256, hmacSha256, generateClientSeed, sha256String, bufferToHex } from '../crypto';
import type { GameRoll, PendingRoll } from './types';

// ============================================================================
// Seed Generation and Combination
// ============================================================================

/**
 * Generate a new roll seed for a gameplay roll
 * @returns 32-byte random seed as hex string
 */
export function generateRollSeed(): string {
  return generateClientSeed();
}

/**
 * Hash a roll seed for commitment
 * @param rollSeed - The roll seed (hex string)
 * @returns SHA-256 hash as hex string
 */
export async function hashRollSeed(rollSeed: string): Promise<string> {
  return sha256String(rollSeed);
}

/**
 * Combine block hash and roll seed into a single seed
 * @param blockHash - Verus block hash (hex string)
 * @param rollSeed - Roll seed (hex string)
 * @returns Combined seed as Uint8Array
 */
export async function combineGameSeed(blockHash: string, rollSeed: string): Promise<Uint8Array> {
  const combined = blockHash + rollSeed;
  const encoder = new TextEncoder();
  return sha256(encoder.encode(combined));
}

// ============================================================================
// Roll Derivation
// ============================================================================

/**
 * Derive a dice roll from combined seed
 * @param combinedSeed - The combined seed
 * @param label - Unique label for this roll
 * @param dieSize - Number of sides (e.g., 20 for d20)
 * @returns Roll result (1 to dieSize)
 */
export async function deriveGameRoll(
  combinedSeed: Uint8Array,
  label: string,
  dieSize: number
): Promise<number> {
  const signature = await hmacSha256(combinedSeed, label);
  const value = new DataView(signature).getUint32(0, false);
  return (value % dieSize) + 1;
}

/**
 * Derive multiple rolls from the same seed (for batched resolution)
 * Useful for deriving attack, damage, etc. from one commitment
 */
export async function deriveMultipleRolls(
  combinedSeed: Uint8Array,
  rolls: Array<{ label: string; dieSize: number }>
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  for (const { label, dieSize } of rolls) {
    results.set(label, await deriveGameRoll(combinedSeed, label, dieSize));
  }

  return results;
}

// ============================================================================
// Roll Resolution
// ============================================================================

/**
 * Resolve a pending roll with the revealed seed and block hash
 */
export async function resolveRoll(
  pending: PendingRoll,
  rollSeed: string,
  blockHash: string,
  blockHeight: number
): Promise<GameRoll> {
  // Verify seed matches commitment
  const computedHash = await hashRollSeed(rollSeed);
  if (computedHash !== pending.rollSeedHash) {
    throw new Error('Roll seed does not match committed hash');
  }

  // Combine seed with block hash
  const combinedSeed = await combineGameSeed(blockHash, rollSeed);

  // Derive the roll
  const result = await deriveGameRoll(combinedSeed, pending.label, pending.dieSize);
  const total = result + pending.modifier;

  // Determine outcome
  let outcome: GameRoll['outcome'];
  if (result === 20) {
    outcome = 'critical';
  } else if (pending.target !== undefined) {
    outcome = total >= pending.target ? 'success' : 'fail';
  } else {
    outcome = total >= 10 ? 'hit' : 'miss'; // Default threshold
  }

  return {
    label: pending.label,
    action: pending.action,
    rollSeed,
    rollSeedHash: pending.rollSeedHash,
    blockHeight,
    blockHash,
    dieSize: pending.dieSize,
    result,
    modifier: pending.modifier,
    total,
    target: pending.target,
    outcome,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Simplified Roll (for client-side preview/simulation)
// ============================================================================

/**
 * Create a simulated roll for UI preview (not provably fair)
 * Used for instant feedback before blockchain confirmation
 */
export function simulateRoll(dieSize: number): number {
  return Math.floor(Math.random() * dieSize) + 1;
}

// ============================================================================
// Roll Verification
// ============================================================================

/**
 * Verify a completed roll can be reproduced
 * @param roll - The roll to verify
 * @returns true if roll is valid and reproducible
 */
export async function verifyRoll(roll: GameRoll): Promise<boolean> {
  try {
    // Verify seed hash
    const computedHash = await hashRollSeed(roll.rollSeed);
    if (computedHash !== roll.rollSeedHash) {
      return false;
    }

    // Recompute the roll
    const combinedSeed = await combineGameSeed(roll.blockHash, roll.rollSeed);
    const computedResult = await deriveGameRoll(combinedSeed, roll.label, roll.dieSize);

    // Verify result matches
    if (computedResult !== roll.result) {
      return false;
    }

    // Verify total
    if (roll.result + roll.modifier !== roll.total) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Verify all rolls in a game session
 */
export async function verifyAllRolls(rolls: GameRoll[]): Promise<{
  valid: boolean;
  invalidRolls: string[];
}> {
  const invalidRolls: string[] = [];

  for (const roll of rolls) {
    const isValid = await verifyRoll(roll);
    if (!isValid) {
      invalidRolls.push(roll.label);
    }
  }

  return {
    valid: invalidRolls.length === 0,
    invalidRolls,
  };
}

// ============================================================================
// Batch Roll System (Simplified)
// ============================================================================

/**
 * For efficiency in gameplay, we can batch multiple potential rolls
 * under a single seed commitment. This derives labeled rolls from one seed.
 *
 * Example: When player chooses "Attack", we derive:
 * - attack_roll (d20)
 * - damage_roll (d6 or weapon die)
 * - enemy_attack_roll (d20) for enemy's response
 * - enemy_damage_roll (d6)
 *
 * Only the relevant rolls are actually used based on hit/miss outcomes.
 */

export interface BatchRollSpec {
  /** Base label prefix (e.g., "scene3_round1") */
  prefix: string;
  /** Rolls to derive */
  rolls: Array<{
    suffix: string;     // e.g., "attack" -> "scene3_round1_attack"
    dieSize: number;
  }>;
}

/**
 * Derive a batch of rolls from one seed
 */
export async function deriveBatchRolls(
  blockHash: string,
  rollSeed: string,
  spec: BatchRollSpec
): Promise<Map<string, number>> {
  const combinedSeed = await combineGameSeed(blockHash, rollSeed);
  const results = new Map<string, number>();

  for (const { suffix, dieSize } of spec.rolls) {
    const label = `${spec.prefix}_${suffix}`;
    results.set(suffix, await deriveGameRoll(combinedSeed, label, dieSize));
  }

  return results;
}

// ============================================================================
// Standard Roll Labels
// ============================================================================

/**
 * Standard roll labels for combat
 */
export const COMBAT_ROLL_LABELS = {
  playerAttack: 'player_attack',
  playerDamage: 'player_damage',
  enemyAttack: 'enemy_attack',
  enemyDamage: 'enemy_damage',
} as const;

/**
 * Standard roll labels for skill checks
 */
export const SKILL_CHECK_LABELS = {
  strength: 'check_str',
  dexterity: 'check_dex',
  constitution: 'check_con',
  intelligence: 'check_int',
  wisdom: 'check_wis',
  charisma: 'check_cha',
} as const;

/**
 * Generate a unique roll label for a scene/round/action
 */
export function makeRollLabel(scene: string, round: number, action: string): string {
  return `${scene}_r${round}_${action}`;
}
