import { describe, it, expect } from 'vitest';
import {
  combineGameSeed,
  deriveGameRoll,
  resolveRoll,
  verifyRoll,
} from './dice';
import type { GameRoll, PendingRoll } from './types';

const FIXED_BLOCK = '0'.repeat(64);
const FIXED_ROLL_SEED = '1'.repeat(64);
// SHA-256(FIXED_ROLL_SEED) — committed-before-reveal hash
const FIXED_ROLL_SEED_HASH =
  '3138bb9bc78df27c473ecfd1410f7bd45ebac1f59cf3ff9cfe4db77aab7aedd3';

describe('combineGameSeed', () => {
  it('rejects non-64-char hex inputs', async () => {
    await expect(combineGameSeed('abc', FIXED_ROLL_SEED)).rejects.toThrow('blockHash');
    await expect(combineGameSeed(FIXED_BLOCK, 'abc')).rejects.toThrow('rollSeed');
  });

  it('rejects uppercase hex', async () => {
    await expect(combineGameSeed('A'.repeat(64), FIXED_ROLL_SEED)).rejects.toThrow();
  });
});

describe('deriveGameRoll', () => {
  it('produces a deterministic golden value for fixed inputs', async () => {
    // Regression seal for gameplay roll derivation. Same construction as
    // character creation (HMAC-SHA256 keyed by combined seed), so a break here
    // would also break re-derivation of stored boss-fight achievements.
    const seed = await combineGameSeed(FIXED_BLOCK, FIXED_ROLL_SEED);
    expect(await deriveGameRoll(seed, 'attack', 20)).toBe(18);
    expect(await deriveGameRoll(seed, 'damage', 6)).toBe(4);
  });
});

describe('resolveRoll → verifyRoll round-trip', () => {
  const pending: PendingRoll = {
    label: 'attack',
    action: 'player_attack',
    rollSeed: FIXED_ROLL_SEED,
    rollSeedHash: FIXED_ROLL_SEED_HASH,
    commitBlockHeight: 99,
    dieSize: 20,
    modifier: 2,
    target: 15,
    createdAt: 0,
  };

  it('verifies a roll that was just resolved', async () => {
    const roll = await resolveRoll(pending, FIXED_ROLL_SEED, FIXED_BLOCK, 100);
    expect(roll.result).toBe(18);
    expect(roll.total).toBe(20);
    expect(roll.outcome).toBe('success');
    expect(await verifyRoll(roll)).toBe(true);
  });

  it('rejects a roll where the seed has been tampered', async () => {
    const roll = await resolveRoll(pending, FIXED_ROLL_SEED, FIXED_BLOCK, 100);
    const tampered: GameRoll = { ...roll, rollSeed: '2'.repeat(64) };
    expect(await verifyRoll(tampered)).toBe(false);
  });

  it('rejects a roll where the result has been tampered', async () => {
    const roll = await resolveRoll(pending, FIXED_ROLL_SEED, FIXED_BLOCK, 100);
    const tampered: GameRoll = { ...roll, result: roll.result === 20 ? 1 : 20 };
    expect(await verifyRoll(tampered)).toBe(false);
  });

  it('rejects a roll where total does not match result + modifier', async () => {
    const roll = await resolveRoll(pending, FIXED_ROLL_SEED, FIXED_BLOCK, 100);
    const tampered: GameRoll = { ...roll, total: roll.total + 5 };
    expect(await verifyRoll(tampered)).toBe(false);
  });

  it('rejects a roll where the block hash has been tampered', async () => {
    const roll = await resolveRoll(pending, FIXED_ROLL_SEED, FIXED_BLOCK, 100);
    const tampered: GameRoll = { ...roll, blockHash: '2'.repeat(64) };
    expect(await verifyRoll(tampered)).toBe(false);
  });

  it('rejects resolveRoll when seed does not match committed hash', async () => {
    await expect(
      resolveRoll(pending, '2'.repeat(64), FIXED_BLOCK, 100),
    ).rejects.toThrow('Roll seed does not match committed hash');
  });
});
