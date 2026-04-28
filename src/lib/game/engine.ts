/**
 * Game Engine for The Primordial Trial
 *
 * Manages game state, scene transitions, and core game logic.
 */

import type { StoredCharacter } from '../types';
import type {
  GameState,
  SceneId,
  GameChoice,
  SkillCheck,
  GameRoll,
  ActiveEffect,
  TrialCompletion,
} from './types';
import {
  calculateMaxHp,
  createGuardian,
  createPrimordial,
  applyWoodRegeneration,
  tickEffects,
} from './combat';

// ============================================================================
// Game Initialization
// ============================================================================

/**
 * Create a new game state for a character
 */
export function createGameState(character: StoredCharacter): GameState {
  const maxHp = calculateMaxHp(character);

  return {
    character,
    currentScene: 'intro',
    hp: maxHp,
    maxHp,
    spiritAbilityUsed: false,
    buffs: [],
    debuffs: [],
    choices: [],
    rolls: [],
    bossEnemySkipsFirstAttack: false,
    bossEnemyGetsFreeFirstAttack: false,
    startedAt: Date.now(),
  };
}

// ============================================================================
// Scene Transitions
// ============================================================================

/**
 * Valid scene transitions
 */
const SCENE_FLOW: Record<SceneId, SceneId | null> = {
  intro: 'paths',
  paths: 'guardian',
  guardian: 'puzzles',
  puzzles: 'bargain',
  bargain: 'boss',
  boss: 'resolution',
  resolution: null, // End of game
};

/**
 * Advance to the next scene
 */
export function advanceScene(state: GameState): GameState {
  const nextScene = SCENE_FLOW[state.currentScene];

  if (!nextScene) {
    // Game is over
    return {
      ...state,
      endedAt: Date.now(),
    };
  }

  // Apply end-of-scene effects
  let newHp = state.hp;

  // Wood regeneration
  newHp = applyWoodRegeneration({ ...state, hp: newHp });

  // Tick down effects
  const newBuffs = tickEffects(state.buffs);
  const newDebuffs = tickEffects(state.debuffs);

  return {
    ...state,
    currentScene: nextScene,
    hp: newHp,
    buffs: newBuffs,
    debuffs: newDebuffs,
    combat: undefined, // Clear combat state when leaving combat scene
  };
}

/**
 * Check if game is over (victory or defeat)
 */
export function isGameOver(state: GameState): boolean {
  return state.outcome !== undefined || state.hp <= 0;
}

/**
 * Set game outcome
 */
export function setOutcome(state: GameState, outcome: 'victory' | 'defeat'): GameState {
  return {
    ...state,
    outcome,
    endedAt: Date.now(),
  };
}

// ============================================================================
// Scene 2: Path Choices
// ============================================================================

export type PathChoice = 'might' | 'cunning' | 'spirit' | 'shadows' | 'endurance' | 'charm';

/**
 * Get available path choices for a character
 */
export function getPathChoices(character: StoredCharacter): GameChoice[] {
  const { str, dex, con, int, wis, cha } = character.stats;

  return [
    {
      id: 'might',
      text: 'Path of Might - Force your way through the ancient gates',
      requiredStat: 'str',
      requiredValue: 16,
      available: str.total >= 16,
      unavailableReason: str.total < 16 ? `Requires STR 16+ (you have ${str.total})` : undefined,
    },
    {
      id: 'endurance',
      text: 'Path of Endurance - Endure the gauntlet of elemental fury',
      requiredStat: 'con',
      requiredValue: 16,
      available: con.total >= 16,
      unavailableReason: con.total < 16 ? `Requires CON 16+ (you have ${con.total})` : undefined,
    },
    {
      id: 'cunning',
      text: 'Path of Cunning - Decipher the lock mechanism',
      requiredStat: 'int',
      requiredValue: 14,
      available: int.total >= 14,
      unavailableReason: int.total < 14 ? `Requires INT 14+ (you have ${int.total})` : undefined,
    },
    {
      id: 'spirit',
      text: 'Path of Spirit - Commune with the sanctum\'s essence',
      requiredStat: 'wis',
      requiredValue: 14,
      available: wis.total >= 14,
      unavailableReason: wis.total < 14 ? `Requires WIS 14+ (you have ${wis.total})` : undefined,
    },
    {
      id: 'charm',
      text: 'Path of Charm - Persuade the gate sentinels to stand aside',
      requiredStat: 'cha',
      requiredValue: 14,
      available: cha.total >= 14,
      unavailableReason: cha.total < 14 ? `Requires CHA 14+ (you have ${cha.total})` : undefined,
    },
    {
      id: 'shadows',
      text: 'Path of Shadows - Find a hidden entrance',
      requiredStat: 'dex',
      requiredValue: 16,
      available: dex.total >= 16,
      unavailableReason: dex.total < 16 ? `Requires DEX 16+ (you have ${dex.total})` : undefined,
    },
  ];
}

/**
 * Apply path choice to game state
 */
export function choosePath(state: GameState, path: PathChoice): GameState {
  // Validate choice is available
  const choices = getPathChoices(state.character);
  const choice = choices.find(c => c.id === path);

  if (!choice || !choice.available) {
    throw new Error(`Path ${path} is not available to this character`);
  }

  // Apply path-specific bonus
  let buffs = [...state.buffs];

  switch (path) {
    case 'might':
      buffs.push({
        description: 'Forceful Entry: +1 damage this session',
        type: 'buff',
        value: 1,
        scenesRemaining: 99, // Lasts entire game
      });
      break;
    case 'cunning':
      buffs.push({
        description: 'Mechanical Insight: +2 to puzzle checks',
        type: 'buff',
        value: 2,
        scenesRemaining: 99,
      });
      break;
    case 'spirit':
      buffs.push({
        description: 'Sanctum\'s Blessing: +2 to spirit bargain',
        type: 'buff',
        value: 2,
        scenesRemaining: 99,
      });
      break;
    case 'endurance':
      buffs.push({
        description: 'Ironclad Resolve: +3 HP this session',
        type: 'buff',
        value: 3,
        scenesRemaining: 99,
      });
      break;
    case 'charm':
      buffs.push({
        description: 'Disarming Presence: +1 attack this session',
        type: 'buff',
        value: 1,
        scenesRemaining: 99,
      });
      break;
    case 'shadows':
      buffs.push({
        description: 'Shadow Walker: +1 defense this session',
        type: 'buff',
        value: 1,
        scenesRemaining: 99,
      });
      break;
  }

  // Apply immediate effects
  let hp = state.hp;
  let maxHp = state.maxHp;
  if (path === 'endurance') {
    maxHp += 3;
    hp += 3;
  }

  return {
    ...state,
    pathChosen: path,
    choices: [...state.choices, `path:${path}`],
    buffs,
    hp,
    maxHp,
  };
}

// ============================================================================
// Scene 3: Guardian Combat Setup
// ============================================================================

/**
 * Initialize combat with the guardian
 */
export function initGuardianCombat(state: GameState): GameState {
  const guardian = createGuardian(state.character.traits.element);

  return {
    ...state,
    combat: {
      enemy: guardian,
      round: 1,
      playerDefending: false,
      rounds: [],
    },
  };
}

// ============================================================================
// Scene 4: Puzzle Skill Checks
// ============================================================================

/**
 * Get puzzle skill checks for Scene 4
 */
export function getPuzzleChecks(): SkillCheck[] {
  return [
    {
      id: 'decipher',
      description: 'Decipher the ancient runes inscribed on the wall',
      stat: 'int',
      dc: 14,
      successDesc: 'The runes reveal a weakness in the Primordial\'s defenses.',
      failureDesc: 'You trigger a trap! Energy crackles through you.',
      successEffect: {
        type: 'buff',
        value: 2,
        description: 'Rune Knowledge: +2 to attack vs Primordial',
        duration: 99,
      },
      failureEffect: {
        type: 'damage',
        value: 4,
      },
    },
    {
      // Mechanics live on GameState flags (bossEnemySkipsFirstAttack /
      // bossEnemyGetsFreeFirstAttack) consumed in resolveCombatRound on
      // round 1 of boss combat — see attemptPuzzle in
      // src/routes/play/+page.svelte. No buff/debuff here on purpose:
      // a "+1 attack" buff would silently bleed into getPlayerAttackMod's
      // substring match.
      id: 'perceive',
      description: 'Sense the true path through the shifting corridors',
      stat: 'wis',
      dc: 14,
      successDesc: 'You sense the Primordial readying its strike and slip past its opening attack.',
      failureDesc: 'You stumble into an ambush position. The Primordial will strike first.',
    },
    {
      id: 'manipulate',
      description: 'Manipulate the intricate lock mechanism',
      stat: 'dex',
      dc: 14,
      successDesc: 'The lock clicks open, revealing a hidden healing spring.',
      failureDesc: 'A poisoned needle pricks your finger.',
      successEffect: {
        type: 'heal',
        value: 8,
      },
      failureEffect: {
        type: 'damage',
        value: 3,
      },
    },
  ];
}

// ============================================================================
// Scene 5: Spirit Bargain
// ============================================================================

export type BargainChoice = 'power' | 'wisdom';

/**
 * Check if player can choose both (passed CHA check)
 */
export function canChooseBoth(state: GameState, chaRoll: GameRoll): boolean {
  const chaMod = state.character.stats.cha.modifier;

  // Check for spirit bargain buff from Path of Spirit
  let bonusMod = 0;
  for (const buff of state.buffs) {
    if (buff.description.includes('spirit') || buff.description.includes('Sanctum')) {
      bonusMod += buff.value;
    }
  }

  const total = chaRoll.result + chaMod + bonusMod;
  return total >= 15; // DC 15 for both
}

/**
 * Apply bargain choice
 */
export function applyBargainChoice(
  state: GameState,
  choice: BargainChoice,
  gotBoth: boolean
): GameState {
  const buffs = [...state.buffs];

  if (choice === 'power' || gotBoth) {
    buffs.push({
      description: 'Spirit Power: +2 damage vs Primordial',
      type: 'buff',
      value: 2,
      scenesRemaining: 99,
    });
  }

  if (choice === 'wisdom' || gotBoth) {
    buffs.push({
      description: 'Spirit Wisdom: +2 defense vs Primordial',
      type: 'buff',
      value: 2,
      scenesRemaining: 99,
    });
  }

  return {
    ...state,
    bargainChoice: choice,
    choices: [...state.choices, `bargain:${choice}${gotBoth ? ':both' : ''}`],
    buffs,
  };
}

// ============================================================================
// Scene 6: Boss Combat Setup
// ============================================================================

/**
 * Initialize combat with the Primordial
 */
export function initBossCombat(state: GameState): GameState {
  // Hard mode if player chose "power" (greedy choice)
  const hardMode = state.bargainChoice === 'power' && !state.choices.includes('bargain:power:both');
  const primordial = createPrimordial(hardMode);

  return {
    ...state,
    combat: {
      enemy: primordial,
      round: 1,
      playerDefending: false,
      rounds: [],
    },
  };
}

// ============================================================================
// Achievement Generation
// ============================================================================

/**
 * Generate trial completion achievement
 */
export function generateAchievement(state: GameState): TrialCompletion {
  // Calculate totals
  let damageDealt = 0;
  let damageTaken = 0;

  if (state.combat) {
    for (const round of state.combat.rounds) {
      damageDealt += round.playerDamage;
      damageTaken += round.enemyDamage;
    }
  }

  // Count scenes completed
  const sceneOrder: SceneId[] = ['intro', 'paths', 'guardian', 'puzzles', 'bargain', 'boss', 'resolution'];
  const scenesCompleted = sceneOrder.indexOf(state.currentScene) + 1;

  // Select key rolls (important moments)
  const keyRolls = state.rolls.filter(r =>
    r.action.includes('attack') ||
    r.action.includes('check') ||
    r.outcome === 'critical'
  ).slice(0, 10); // Limit to 10 most important

  const endTime = state.endedAt || Date.now();
  const durationSeconds = Math.floor((endTime - state.startedAt) / 1000);

  return {
    characterName: state.character.name,
    characterRollBlockHeight: state.character.rollBlockHeight,
    completed: state.outcome === 'victory',
    finalHp: state.hp,
    scenesCompleted,
    pathChosen: state.pathChosen,
    bargainChoice: state.bargainChoice,
    spiritAbilityUsed: state.spiritAbilityUsed,
    keyRolls,
    damageDealt,
    damageTaken,
    durationSeconds,
    timestamp: Date.now(),
  };
}

// ============================================================================
// State Helpers
// ============================================================================

/**
 * Add a roll to game history
 */
export function recordRoll(state: GameState, roll: GameRoll): GameState {
  return {
    ...state,
    rolls: [...state.rolls, roll],
  };
}

/**
 * Apply damage to player
 */
export function applyDamage(state: GameState, damage: number): GameState {
  const newHp = Math.max(0, state.hp - damage);
  return {
    ...state,
    hp: newHp,
    outcome: newHp <= 0 ? 'defeat' : state.outcome,
  };
}

/**
 * Apply healing to player
 */
export function applyHealing(state: GameState, amount: number): GameState {
  return {
    ...state,
    hp: Math.min(state.hp + amount, state.maxHp),
  };
}

/**
 * Mark spirit ability as used
 */
export function useSpiritAbilityFlag(state: GameState): GameState {
  return {
    ...state,
    spiritAbilityUsed: true,
  };
}

/**
 * Add a buff
 */
export function addBuff(state: GameState, buff: ActiveEffect): GameState {
  return {
    ...state,
    buffs: [...state.buffs, buff],
  };
}

/**
 * Add a debuff
 */
export function addDebuff(state: GameState, debuff: ActiveEffect): GameState {
  return {
    ...state,
    debuffs: [...state.debuffs, debuff],
  };
}
