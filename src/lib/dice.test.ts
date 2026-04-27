import { describe, it, expect } from 'vitest';
import {
  combineSeed,
  deriveRoll,
  calculateModifier,
  rollCharacter,
} from './dice';
import { ELEMENTS, SPIRIT_ANIMALS, SEXES } from './types';

const FIXED_BLOCK = '0'.repeat(64);
const FIXED_SEED = '1'.repeat(64);

describe('combineSeed', () => {
  it('rejects non-64-char hex inputs', async () => {
    await expect(combineSeed('abc', FIXED_SEED)).rejects.toThrow('blockHash');
    await expect(combineSeed(FIXED_BLOCK, 'abc')).rejects.toThrow('clientSeed');
  });

  it('rejects uppercase hex', async () => {
    await expect(combineSeed('A'.repeat(64), FIXED_SEED)).rejects.toThrow();
  });

  it('rejects non-hex characters', async () => {
    await expect(combineSeed('z'.repeat(64), FIXED_SEED)).rejects.toThrow();
  });

  it('produces a deterministic 32-byte SHA-256 output', async () => {
    const a = await combineSeed(FIXED_BLOCK, FIXED_SEED);
    const b = await combineSeed(FIXED_BLOCK, FIXED_SEED);
    expect(a).toBeInstanceOf(Uint8Array);
    expect(a.length).toBe(32);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('deriveRoll', () => {
  it('returns a value in [1, dieSize] across die sizes', async () => {
    const seed = await combineSeed(FIXED_BLOCK, FIXED_SEED);
    for (const dieSize of [2, 6, 12, 20]) {
      for (let i = 0; i < 50; i++) {
        const v = await deriveRoll(seed, `range_${dieSize}_${i}`, dieSize);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(dieSize);
      }
    }
  });

  it('hits all values across labels (smoke check, d6)', async () => {
    const seed = await combineSeed(FIXED_BLOCK, FIXED_SEED);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) {
      seen.add(await deriveRoll(seed, `bucket_${i}`, 6));
    }
    expect(seen.size).toBe(6);
  });

  it('different labels produce different rolls', async () => {
    const seed = await combineSeed(FIXED_BLOCK, FIXED_SEED);
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) {
      values.add(await deriveRoll(seed, `unique_${i}`, 6));
    }
    expect(values.size).toBeGreaterThan(1);
  });

  it('produces a deterministic golden value for fixed inputs', async () => {
    // Regression seal: locks down the (seed, label, dieSize) → roll mapping.
    // If this changes, every previously-stored character becomes unverifiable.
    const seed = await combineSeed(FIXED_BLOCK, FIXED_SEED);
    expect(await deriveRoll(seed, 'str_d1', 6)).toBe(5);
  });
});

describe('calculateModifier', () => {
  it('matches floor((total - 13) / 2) at boundaries', () => {
    expect(calculateModifier(3)).toBe(-5);
    expect(calculateModifier(11)).toBe(-1);
    expect(calculateModifier(12)).toBe(-1);
    expect(calculateModifier(13)).toBe(0);
    expect(calculateModifier(14)).toBe(0);
    expect(calculateModifier(15)).toBe(1);
    expect(calculateModifier(16)).toBe(1);
    expect(calculateModifier(17)).toBe(2);
    expect(calculateModifier(24)).toBe(5);
  });
});

describe('rollCharacter', () => {
  it('produces a stable golden character for fixed inputs', async () => {
    // Regression seal for the full character derivation. Recorded from running
    // the function with FIXED_BLOCK / FIXED_SEED. If any of these change, every
    // previously-stored character on-chain becomes unverifiable.
    const result = await rollCharacter(FIXED_BLOCK, FIXED_SEED);

    expect(result.stats.str).toEqual({ dice: [5, 2, 4, 2], total: 13, modifier: 0 });
    expect(result.stats.dex).toEqual({ dice: [3, 6, 1, 2], total: 12, modifier: -1 });
    expect(result.stats.con).toEqual({ dice: [6, 2, 6, 5], total: 19, modifier: 3 });
    expect(result.stats.int).toEqual({ dice: [4, 1, 6, 3], total: 14, modifier: 0 });
    expect(result.stats.wis).toEqual({ dice: [3, 4, 4, 5], total: 16, modifier: 1 });
    expect(result.stats.cha).toEqual({ dice: [4, 6, 1, 5], total: 16, modifier: 1 });

    expect(result.traits).toEqual({
      element: 'Earth',
      spiritAnimal: 'Spider',
      sex: 'Female',
    });
  });

  it('produces stats and traits within valid shapes', async () => {
    const result = await rollCharacter(FIXED_BLOCK, FIXED_SEED);
    for (const stat of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      const s = result.stats[stat];
      expect(s.dice).toHaveLength(4);
      for (const d of s.dice) {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(6);
      }
      expect(s.total).toBe(s.dice.reduce((a, b) => a + b, 0));
      expect(s.modifier).toBe(Math.floor((s.total - 13) / 2));
    }
    expect(ELEMENTS).toContain(result.traits.element);
    expect(SPIRIT_ANIMALS).toContain(result.traits.spiritAnimal);
    expect(SEXES).toContain(result.traits.sex);
  });

  it('different block hashes produce different characters', async () => {
    const a = await rollCharacter('0'.repeat(64), FIXED_SEED);
    const b = await rollCharacter('1'.repeat(64), FIXED_SEED);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
