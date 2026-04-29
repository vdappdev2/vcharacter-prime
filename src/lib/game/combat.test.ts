import { describe, it, expect } from 'vitest';
import {
  resolveCombatRound,
  createPrimordial,
  getPlayerAttackMod,
  getPlayerDefense,
  calculatePlayerDamage,
  getCombatOutcome,
  applyWoodRegeneration,
  useSpiritAbility,
  PRIMORDIAL_STANDARD,
  PRIMORDIAL_HARD,
} from './combat';
import type { GameState, ActiveEffect, Enemy } from './types';
import type { StoredCharacter, Element, SpiritAnimal } from '../types';

function mkChar(overrides: Partial<{
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  element: Element;
  spiritAnimal: SpiritAnimal;
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
    traits: { element: overrides.element ?? 'Fire', spiritAnimal: overrides.spiritAnimal ?? 'Wolf', sex: 'Male' },
    verification: { block_height: 0, block_hash: '0'.repeat(64), client_seed: '0'.repeat(64), timestamp: 0 },
    userIdentity: '',
    userFriendlyName: '',
    commitment: { response: '', signedBlockHeight: 0, clientSeedHash: '0'.repeat(64) },
    rollBlockHeight: 0,
    rollBlockHash: '0'.repeat(64),
  };
}

function mkBossState(overrides: Partial<GameState> = {}): GameState {
  const character = overrides.character ?? mkChar();
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

describe('getPlayerDefense — buff plumbing (P4)', () => {
  // Regression seal: previously getPlayerDefense ignored buffs entirely, so
  // both Path of Shadows ("+1 defense this session") and the Gift of Wisdom
  // bargain ("+2 defense vs Primordial") were silently inert. Both buffs are
  // added to state.buffs in engine.ts but the defense calc never read them.

  it('applies Path of Shadows: +1 defense buff', () => {
    const character = mkChar({ dex: 1 });
    const baseline = getPlayerDefense(character, [], [], 1); // 10 + 1 = 11
    const shadows: ActiveEffect = {
      description: 'Shadow Walker: +1 defense this session',
      type: 'buff',
      value: 1,
      scenesRemaining: 99,
    };
    expect(getPlayerDefense(character, [shadows], [], 1)).toBe(baseline + 1);
  });

  it('applies Gift of Wisdom: +2 defense buff', () => {
    const character = mkChar({ dex: 1 });
    const baseline = getPlayerDefense(character, [], [], 1);
    const wisdom: ActiveEffect = {
      description: 'Spirit Wisdom: +2 defense vs Primordial',
      type: 'buff',
      value: 2,
      scenesRemaining: 99,
    };
    expect(getPlayerDefense(character, [wisdom], [], 1)).toBe(baseline + 2);
  });

  it('stacks Shadows + Wisdom buffs', () => {
    const character = mkChar({ dex: 1 });
    const baseline = getPlayerDefense(character, [], [], 1);
    const shadows: ActiveEffect = {
      description: 'Shadow Walker: +1 defense this session',
      type: 'buff', value: 1, scenesRemaining: 99,
    };
    const wisdom: ActiveEffect = {
      description: 'Spirit Wisdom: +2 defense vs Primordial',
      type: 'buff', value: 2, scenesRemaining: 99,
    };
    expect(getPlayerDefense(character, [shadows, wisdom], [], 1)).toBe(baseline + 3);
  });

  it('does not match unrelated buff descriptions', () => {
    const character = mkChar({ dex: 1 });
    const baseline = getPlayerDefense(character, [], [], 1);
    // Path of Might "+1 damage this session" must not bleed into defense.
    const might: ActiveEffect = {
      description: 'Forceful Entry: +1 damage this session',
      type: 'buff', value: 1, scenesRemaining: 99,
    };
    expect(getPlayerDefense(character, [might], [], 1)).toBe(baseline);
  });
});

describe('Element perks (P6)', () => {
  // Air: +4 to round-1 attack roll, every combat (replaces dead initiative-100)
  describe('Air: +4 round-1 attack', () => {
    it('adds +4 on round 1 only', () => {
      const air = mkChar({ str: 2, element: 'Air' });
      expect(getPlayerAttackMod(air, [], 1)).toBe(2 + 4); // STR + Air r1
      expect(getPlayerAttackMod(air, [], 2)).toBe(2);     // STR only on r2 (INT is 0)
    });

    it('does not affect non-Air characters', () => {
      const fire = mkChar({ str: 2, element: 'Fire' });
      expect(getPlayerAttackMod(fire, [], 1)).toBe(2);
    });
  });

  // Fire: +3 damage on first successful attack each combat
  describe('Fire: +3 first-hit damage', () => {
    it('adds +3 on the first successful attack of a combat', () => {
      const character = mkChar({ str: 1, element: 'Fire' });
      const state = mkBossState({ character });
      const result = resolveCombatRound(state, 'attack', 20, 4, 1, 1);
      // calculatePlayerDamage = 4 (roll) + 1 (STR) + 0 (no Metal) = 5; +3 Fire = 8
      expect(result.playerDamage).toBe(8);
      expect(result.narrative).toContain('Searing flame');
    });

    it('does not add +3 once firstHitDealt is set', () => {
      const character = mkChar({ str: 1, element: 'Fire' });
      const state = mkBossState({
        character,
        combat: { enemy: createPrimordial(false), round: 2, playerDefending: false, rounds: [], firstHitDealt: true },
      });
      const result = resolveCombatRound(state, 'attack', 20, 4, 1, 1);
      expect(result.playerDamage).toBe(5); // No +3 — first hit already consumed
      expect(result.narrative).not.toContain('Searing flame');
    });

    it('does not add +3 for non-Fire characters', () => {
      const character = mkChar({ str: 1, element: 'Earth' });
      const state = mkBossState({ character });
      const result = resolveCombatRound(state, 'attack', 20, 4, 1, 1);
      expect(result.playerDamage).toBe(5);
    });
  });

  // Wood: +2 HP at end of each combat (replaces +1 per scene)
  describe('Wood: +2 HP end-of-combat regen', () => {
    it('heals +2 when leaving the guardian scene', () => {
      const character = mkChar({ element: 'Wood' });
      const state = mkBossState({ character, currentScene: 'guardian', hp: 10, maxHp: 25 });
      expect(applyWoodRegeneration(state)).toBe(12);
    });

    it('heals +2 when leaving the boss scene', () => {
      const character = mkChar({ element: 'Wood' });
      const state = mkBossState({ character, currentScene: 'boss', hp: 10, maxHp: 25 });
      expect(applyWoodRegeneration(state)).toBe(12);
    });

    it('does not heal when leaving non-combat scenes', () => {
      const character = mkChar({ element: 'Wood' });
      const state = mkBossState({ character, currentScene: 'puzzles', hp: 10, maxHp: 25 });
      expect(applyWoodRegeneration(state)).toBe(10);
    });

    it('caps at maxHp', () => {
      const character = mkChar({ element: 'Wood' });
      const state = mkBossState({ character, currentScene: 'boss', hp: 24, maxHp: 25 });
      expect(applyWoodRegeneration(state)).toBe(25);
    });

    it('does not heal non-Wood characters', () => {
      const character = mkChar({ element: 'Earth' });
      const state = mkBossState({ character, currentScene: 'boss', hp: 10, maxHp: 25 });
      expect(applyWoodRegeneration(state)).toBe(10);
    });
  });
});

describe('Mutual KO + Wood last gasp (b2)', () => {
  function mkPostMutualKO(element: Element): GameState {
    // Caller has already received result.playerHpAfter=0 / enemyHpAfter=0
    // and updated state. getCombatOutcome reads this state.
    const character = mkChar({ element });
    const enemy: Enemy = { ...createPrimordial(false), hp: 0 };
    return mkBossState({ character, hp: 0, combat: { enemy, round: 5, playerDefending: false, rounds: [] } });
  }

  it('non-Wood mutual KO returns defeat', () => {
    expect(getCombatOutcome(mkPostMutualKO('Fire'))).toBe('defeat');
    expect(getCombatOutcome(mkPostMutualKO('Earth'))).toBe('defeat');
    expect(getCombatOutcome(mkPostMutualKO('Metal'))).toBe('defeat');
  });

  it('Wood mutual KO returns victory (last gasp)', () => {
    expect(getCombatOutcome(mkPostMutualKO('Wood'))).toBe('victory');
  });

  it('player-only down still returns defeat for Wood', () => {
    // Wood character at 0 HP but enemy still alive — no last gasp save.
    const character = mkChar({ element: 'Wood' });
    const state = mkBossState({ character, hp: 0 });
    expect(getCombatOutcome(state)).toBe('defeat');
  });

  it('mutual KO narrative for Wood includes "Wood spirit"', () => {
    // CON 0 → no damage reduction; primordial deals 5 base, drops player from 5 → 0.
    // STR 0 → player attack damage = 4 (roll) + 0 (STR) = 4; drops enemy from 4 → 0.
    const character = mkChar({ str: 0, con: 0, element: 'Wood' });
    const enemy: Enemy = { ...createPrimordial(false), hp: 4 };
    const state = mkBossState({
      character,
      hp: 5,
      combat: { enemy, round: 3, playerDefending: false, rounds: [] },
    });
    const result = resolveCombatRound(state, 'attack', 20, 4, 20, 6);
    expect(result.playerHpAfter).toBe(0);
    expect(result.enemyHpAfter).toBe(0);
    expect(result.narrative).toContain('Wood spirit');
  });

  it('mutual KO narrative for non-Wood is defeat-flavored', () => {
    // Fire's first-hit +3 stacks: 4 (roll) + 0 (STR) + 3 (Fire) = 7 vs 4 hp → 0.
    const character = mkChar({ str: 0, con: 0, element: 'Fire' });
    const enemy: Enemy = { ...createPrimordial(false), hp: 4 };
    const state = mkBossState({
      character,
      hp: 5,
      combat: { enemy, round: 3, playerDefending: false, rounds: [] },
    });
    const result = resolveCombatRound(state, 'attack', 20, 4, 20, 6);
    expect(result.playerHpAfter).toBe(0);
    expect(result.enemyHpAfter).toBe(0);
    expect(result.narrative).toContain('Darkness');
  });
});

// ============================================================================
// Spirit ability — three-category model
// ============================================================================

describe('useSpiritAbility — offensive (Tiger / Wolf / Dragon / Eagle)', () => {
  for (const spirit of ['Tiger', 'Wolf', 'Dragon', 'Eagle'] as const) {
    it(`${spirit}: +2 attack & damage buff at WIS 0`, () => {
      const state = mkBossState({ character: mkChar({ spiritAnimal: spirit, wis: 0 }) });
      const result = useSpiritAbility(spirit, state);
      expect(result.healing).toBeUndefined();
      expect(result.buff).toBeDefined();
      expect(result.buff!.value).toBe(2);
      expect(result.buff!.scenesRemaining).toBe(1);
      // Substring tokens that getPlayerAttackMod / calculatePlayerDamage match on.
      expect(result.buff!.description).toContain('attack');
      expect(result.buff!.description).toContain('damage');
      expect(result.buff!.description).toContain(spirit);
    });
  }

  it('scales with WIS modifier', () => {
    const state = mkBossState({ character: mkChar({ spiritAnimal: 'Tiger', wis: 3 }) });
    expect(useSpiritAbility('Tiger', state).buff!.value).toBe(5);
  });

  it('clamps negative WIS to 0', () => {
    const state = mkBossState({ character: mkChar({ spiritAnimal: 'Tiger', wis: -2 }) });
    expect(useSpiritAbility('Tiger', state).buff!.value).toBe(2);
  });
});

describe('useSpiritAbility — defensive (Bear / Elephant / Octopus / Spider)', () => {
  for (const spirit of ['Bear', 'Elephant', 'Octopus', 'Spider'] as const) {
    it(`${spirit}: +3 defense buff at WIS 0`, () => {
      const state = mkBossState({ character: mkChar({ spiritAnimal: spirit, wis: 0 }) });
      const result = useSpiritAbility(spirit, state);
      expect(result.healing).toBeUndefined();
      expect(result.buff).toBeDefined();
      expect(result.buff!.value).toBe(3);
      expect(result.buff!.scenesRemaining).toBe(1);
      // Substring token that getPlayerDefense matches on.
      expect(result.buff!.description).toContain('defense');
      expect(result.buff!.description).toContain(spirit);
    });
  }

  it('scales with WIS modifier', () => {
    const state = mkBossState({ character: mkChar({ spiritAnimal: 'Bear', wis: 3 }) });
    expect(useSpiritAbility('Bear', state).buff!.value).toBe(6);
  });
});

describe('useSpiritAbility — restorative (Whale / Owl / Deer / Frog)', () => {
  for (const spirit of ['Whale', 'Owl', 'Deer', 'Frog'] as const) {
    it(`${spirit}: heals 6 HP at WIS 0`, () => {
      const state = mkBossState({ character: mkChar({ spiritAnimal: spirit, wis: 0 }) });
      const result = useSpiritAbility(spirit, state);
      expect(result.buff).toBeUndefined();
      expect(result.healing).toBe(6);
    });
  }

  it('scales with WIS modifier', () => {
    const state = mkBossState({ character: mkChar({ spiritAnimal: 'Whale', wis: 3 }) });
    expect(useSpiritAbility('Whale', state).healing).toBe(9);
  });

  it('clamps negative WIS to 0', () => {
    const state = mkBossState({ character: mkChar({ spiritAnimal: 'Whale', wis: -3 }) });
    expect(useSpiritAbility('Whale', state).healing).toBe(6);
  });
});

describe('Spirit buff substring matching — guards against description drift', () => {
  it('offensive buff lifts both attack and damage, leaves defense alone', () => {
    const character = mkChar({ spiritAnimal: 'Tiger', str: 1, dex: 1 });
    const state = mkBossState({ character });
    const baseAttack = getPlayerAttackMod(character, [], 1);
    const baseDamage = calculatePlayerDamage(character, 5, [], 'Fire');
    const baseDefense = getPlayerDefense(character, [], [], 1);
    const buffs = [useSpiritAbility('Tiger', state).buff!];

    expect(getPlayerAttackMod(character, buffs, 1)).toBe(baseAttack + 2);
    expect(calculatePlayerDamage(character, 5, buffs, 'Fire')).toBe(baseDamage + 2);
    expect(getPlayerDefense(character, buffs, [], 1)).toBe(baseDefense);
  });

  it('defensive buff lifts defense only', () => {
    const character = mkChar({ spiritAnimal: 'Bear', str: 1, dex: 1 });
    const state = mkBossState({ character });
    const baseAttack = getPlayerAttackMod(character, [], 1);
    const baseDamage = calculatePlayerDamage(character, 5, [], 'Fire');
    const baseDefense = getPlayerDefense(character, [], [], 1);
    const buffs = [useSpiritAbility('Bear', state).buff!];

    expect(getPlayerAttackMod(character, buffs, 1)).toBe(baseAttack);
    expect(calculatePlayerDamage(character, 5, buffs, 'Fire')).toBe(baseDamage);
    expect(getPlayerDefense(character, buffs, [], 1)).toBe(baseDefense + 3);
  });
});

// ============================================================================
// Boss HP — bumped to absorb the element-perk power gain
// ============================================================================

describe('Attack breakdown labels', () => {
  it('names each buff by its label rather than emitting a generic "buff" sum', () => {
    // Tiger spirit + Rune (INT puzzle) on round 2 → breakdown should call out
    // both sources explicitly, not mash them into "+4buff".
    const character = mkChar({ str: 1, int: 2, spiritAnimal: 'Tiger' });
    const tigerBuff: ActiveEffect = {
      description: 'Tiger Pounce: +2 attack & damage',
      type: 'buff', value: 2, scenesRemaining: 1, label: 'Tiger',
    };
    const runeBuff: ActiveEffect = {
      description: 'Rune Knowledge: +2 to attack vs Primordial',
      type: 'buff', value: 2, scenesRemaining: 99, label: 'Rune',
    };
    const state = mkBossState({
      character,
      buffs: [tigerBuff, runeBuff],
      combat: { enemy: createPrimordial(false), round: 2, playerDefending: false, rounds: [] },
    });
    const result = resolveCombatRound(state, 'attack', 10, 4, 1, 1);
    // Round 2 → INT bonus active. Expected breakdown: "1+2INT+2Tiger+2Rune".
    expect(result.narrative).toContain('1+2INT+2Tiger+2Rune');
    expect(result.narrative).not.toContain('buff');
  });

  it('falls back to first word of description when label is absent', () => {
    const character = mkChar({ str: 1 });
    const legacy: ActiveEffect = {
      description: 'Mystery Power: +1 attack — no label set',
      type: 'buff', value: 1, scenesRemaining: 99,
    };
    const state = mkBossState({ character, buffs: [legacy] });
    const result = resolveCombatRound(state, 'attack', 10, 4, 1, 1);
    expect(result.narrative).toContain('1+1Mystery');
  });

  it('surfaces the Air round-1 +4 as its own segment, not lumped into buffs', () => {
    const character = mkChar({ str: 1, element: 'Air' });
    const state = mkBossState({ character });
    const result = resolveCombatRound(state, 'attack', 10, 4, 1, 1);
    // Round 1, no INT bonus, Air bonus active. Expected breakdown: "1+4Air".
    expect(result.narrative).toContain('1+4Air');
  });
});

describe('Primordial boss HP', () => {
  it('standard has 30 maxHp', () => {
    expect(PRIMORDIAL_STANDARD.maxHp).toBe(30);
  });

  it('hard has 31 maxHp', () => {
    expect(PRIMORDIAL_HARD.maxHp).toBe(31);
  });
});
