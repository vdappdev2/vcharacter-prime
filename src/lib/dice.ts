/**
 * Provably Fair Dice Rolling System
 *
 * Uses HMAC-SHA256 derivation with labeled keys to generate deterministic
 * dice rolls from a combined seed (Verus block hash + client entropy).
 */

import { sha256, hmacSha256 } from './crypto';
import {
  type StatName,
  type StatRoll,
  type CharacterStats,
  type CharacterTraits,
  type DiceRollResult,
  STAT_NAMES,
  STAT_LABELS,
  TRAIT_LABELS,
  ELEMENTS,
  SPIRIT_ANIMALS,
  SEXES,
} from './types';

/**
 * Combine block hash and client seed into a single seed using SHA-256
 *
 * @param blockHash - Verus block hash (hex string)
 * @param clientSeed - Client-generated random seed (hex string)
 * @returns Combined seed as Uint8Array
 */
export async function combineSeed(blockHash: string, clientSeed: string): Promise<Uint8Array> {
  const combined = blockHash + clientSeed;
  const encoder = new TextEncoder();
  return sha256(encoder.encode(combined));
}

/**
 * Derive a single dice roll using HMAC-SHA256
 *
 * @param combinedSeed - The combined seed (SHA256 of block_hash + client_seed)
 * @param label - Unique label for this roll (e.g., "str_d1", "element")
 * @param dieSize - Number of sides on the die (e.g., 6 for d6, 12 for d12)
 * @returns A number from 1 to dieSize
 */
export async function deriveRoll(
  combinedSeed: Uint8Array,
  label: string,
  dieSize: number
): Promise<number> {
  const signature = await hmacSha256(combinedSeed, label);

  // Take first 4 bytes as unsigned 32-bit big-endian integer
  const value = new DataView(signature).getUint32(0, false);

  // Map to die range [1, dieSize]
  return (value % dieSize) + 1;
}

/**
 * Calculate stat modifier from total
 *
 * Formula: floor((stat - 13) / 2)
 * This gives +0 at 13-14 (the mean), +1 at 15-16, etc.
 * Slightly-above-average characters feel positive rather than flat.
 */
export function calculateModifier(total: number): number {
  return Math.floor((total - 13) / 2);
}

/**
 * Roll a single stat (4d6 keep all)
 */
export async function rollStat(combinedSeed: Uint8Array, statName: StatName): Promise<StatRoll> {
  const labels = STAT_LABELS[statName];
  const dice: [number, number, number, number] = [
    await deriveRoll(combinedSeed, labels[0], 6),
    await deriveRoll(combinedSeed, labels[1], 6),
    await deriveRoll(combinedSeed, labels[2], 6),
    await deriveRoll(combinedSeed, labels[3], 6),
  ];

  const total = dice.reduce((sum, d) => sum + d, 0);
  const modifier = calculateModifier(total);

  return { dice, total, modifier };
}

/**
 * Roll all six stats
 */
export async function rollAllStats(combinedSeed: Uint8Array): Promise<CharacterStats> {
  const results = await Promise.all(
    STAT_NAMES.map((stat) => rollStat(combinedSeed, stat))
  );

  return {
    str: results[0],
    dex: results[1],
    con: results[2],
    int: results[3],
    wis: results[4],
    cha: results[5],
  };
}

/**
 * Roll all traits
 */
export async function rollTraits(combinedSeed: Uint8Array): Promise<CharacterTraits> {
  const [elementRoll, spiritAnimalRoll, sexRoll] = await Promise.all([
    deriveRoll(combinedSeed, TRAIT_LABELS.element, 6),
    deriveRoll(combinedSeed, TRAIT_LABELS.spiritAnimal, 12),
    deriveRoll(combinedSeed, TRAIT_LABELS.sex, 2),
  ]);

  return {
    element: ELEMENTS[elementRoll - 1],
    spiritAnimal: SPIRIT_ANIMALS[spiritAnimalRoll - 1],
    sex: SEXES[sexRoll - 1],
  };
}

/**
 * Roll all dice for a character (stats + traits)
 *
 * @param blockHash - Verus block hash (server seed)
 * @param clientSeed - Client-generated random seed
 * @returns Complete dice roll results
 */
export async function rollCharacter(
  blockHash: string,
  clientSeed: string
): Promise<DiceRollResult> {
  const combinedSeed = await combineSeed(blockHash, clientSeed);

  const [stats, traits] = await Promise.all([
    rollAllStats(combinedSeed),
    rollTraits(combinedSeed),
  ]);

  return { stats, traits };
}
