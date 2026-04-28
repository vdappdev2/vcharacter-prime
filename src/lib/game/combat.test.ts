import { describe, it, expect } from 'vitest';
import {
  resolveCombatRound,
  createPrimordial,
  getPlayerAttackMod,
} from './combat';
import type { GameState, ActiveEffect } from './types';
import type { StoredCharacter } from '../types';

function mkChar(overrides: Partial<{
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
}> = {}): StoredCharacter {
  const stat = (mod: number) => ({ dice: [3, 4, 4, 4] as [number, number, number, number], total: 13 + mod * 2, modifier: mod });
  return {
    name: 'Test',
    stats: {
      str: stat(overrides.str ?? 1),
      dex: stat(overrides.dex ?? 1),
      con: stat(overrides.con ?? 1),
      int: stat(overrides.int ?? 0),
      wis: stat(overrides.wis ?? 0),
      cha: stat(overrides.cha ?? 0),
    },
    traits: { element: 'Fire', spiritAnimal: 'Wolf', sex: 'Male' },
    verification: { block_height: 0, block_hash: '0'.repeat(64), client_seed: '0'.repeat(64), timestamp: 0 },
    userIdentity: '',
    userFriendlyName: '',
    commitment: { response: '', signedBlockHeight: 0, clientSeedHash: '0'.repeat(64) },
    rollBlockHeight: 0,
    rollBlockHash: '0'.repeat(64),
  };
}

function mkBossState(overrides: Partial<GameState> = {}): GameState {
  const character = mkChar();
  const enemy = createPrimordial(false);
  return {
    character,
    currentScene: 'boss',
    hp: 25,
    maxHp: 25,
    spiritAbilityUsed: false,
    buffs: [],
    debuffs: [],
    choices: [],
    rolls: [],
    bossEnemySkipsFirstAttack: false,
    bossEnemyGetsFreeFirstAttack: false,
    startedAt: 0,
    combat: {
      enemy,
      round: 1,
      playerDefending: false,
      rounds: [],
    },
    ...overrides,
  };
}

describe('WIS perceive — failure (free attack on round 1)', () => {
  it('runs the free attack and suppresses the regular enemy turn', () => {
    // Free attack rolls high → should hit. Regular enemy rolls also high
    // (would also hit), but the regular turn must be suppressed so the
    // boss only swings once.
    const state = mkBossState({ bossEnemyGetsFreeFirstAttack: true });
    const result = resolveCombatRound(state, 'attack', 20, 6, 20, 6, 20, 6);

    expect(result.enemyAction).toBe('free-attack-hit');
    // Standard Primordial: baseDamage 5, player CON +1 reduces to 4.
    // Only ONE swing should land — not two.
    expect(result.enemyDamage).toBe(4);
    expect(result.narrative).toContain('Ambushed');
    expect(result.narrative).not.toContain('strikes you');
  });

  it('still suppresses the regular enemy turn when the free attack misses', () => {
    // Free attack rolls 1 → certain miss vs any defense ≥ 5.
    // Regular enemy rolls high → would have hit. Must NOT land.
    const state = mkBossState({ bossEnemyGetsFreeFirstAttack: true });
    const result = resolveCombatRound(state, 'attack', 20, 6, 20, 6, 1, 6);

    expect(result.enemyAction).toBe('free-attack-miss');
    expect(result.enemyDamage).toBe(0);
    expect(result.narrative).toContain('opening strike misses');
  });

  it('does not fire on round 2', () => {
    const state = mkBossState({
      bossEnemyGetsFreeFirstAttack: true,
      combat: { enemy: createPrimordial(false), round: 2, playerDefending: false, rounds: [] },
    });
    const result = resolveCombatRound(state, 'attack', 20, 6, 20, 6, 20, 6);
    expect(result.enemyAction).toBe('attack');
  });

  it('does not fire on guardian combat round 1', () => {
    const state = mkBossState({
      currentScene: 'guardian',
      bossEnemyGetsFreeFirstAttack: true,
    });
    const result = resolveCombatRound(state, 'attack', 20, 6, 20, 6, 20, 6);
    expect(result.enemyAction).toBe('attack');
  });
});

describe('WIS perceive — success (skip enemy turn on round 1)', () => {
  it('skips the enemy turn entirely on round 1 of boss combat', () => {
    const state = mkBossState({ bossEnemySkipsFirstAttack: true });
    const result = resolveCombatRound(state, 'attack', 20, 6, 20, 6);

    expect(result.enemyAction).toBe('foreseen-skip');
    expect(result.enemyDamage).toBe(0);
    expect(result.narrative).toContain('Foreseen');
  });

  it('does not silently grant a phantom +1 attack buff to the player', () => {
    // Regression test for P3: the previous Foreseen buff carried value 1
    // and a description containing "attack", so getPlayerAttackMod's
    // substring match would add +1 to every attack roll for the rest of
    // the boss fight. Verify that no such buff exists in canon state and
    // that getPlayerAttackMod returns just the player's base modifier.
    const character = mkChar({ str: 2 });
    const buffs: ActiveEffect[] = []; // perceive success should add no buff now
    expect(getPlayerAttackMod(character, buffs, 1)).toBe(2); // STR only on r1
    expect(getPlayerAttackMod(character, buffs, 2)).toBe(2); // STR + INT(0) on r2+
  });
});

describe('resolveCombatRound — baseline (no perceive flags)', () => {
  it('runs the regular enemy turn on round 1 of boss combat when no flags are set', () => {
    const state = mkBossState();
    const result = resolveCombatRound(state, 'attack', 20, 6, 20, 6);
    expect(result.enemyAction).toBe('attack');
  });
});
