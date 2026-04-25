/**
 * Combat System for The Primordial Trial
 *
 * Turn-based combat with deterministic dice rolls (verifiable replay).
 */

import type { StoredCharacter, Element, SpiritAnimal } from '../types';
import type { GameState, Enemy, CombatAction, CombatRoundResult, GameRoll, ActiveEffect } from './types';
import { calculateModifier } from '../dice';

// ============================================================================
// Constants
// ============================================================================

/**
 * Base HP for all characters
 */
export const BASE_HP = 20;

/**
 * HP per CON modifier point
 */
export const HP_PER_CON_MOD = 3;

/**
 * Base defense (before DEX modifier)
 */
export const BASE_DEFENSE = 10;

// ============================================================================
// HP Calculation
// ============================================================================

/**
 * Calculate maximum HP for a character
 * Formula: 20 + (CON modifier * 3)
 */
export function calculateMaxHp(character: StoredCharacter): number {
  const conMod = character.stats.con.modifier;
  return Math.max(BASE_HP + (conMod * HP_PER_CON_MOD), 5); // Minimum 5 HP
}

/**
 * Calculate defense value for a character
 * Formula: 10 + DEX modifier
 */
export function calculateDefense(character: StoredCharacter): number {
  return BASE_DEFENSE + character.stats.dex.modifier;
}

// ============================================================================
// Enemy Definitions
// ============================================================================

/**
 * Guardian enemies for Scene 3 (counter-element to player)
 */
export const GUARDIANS: Record<Element, Omit<Enemy, 'hp'>> = {
  Fire: {
    name: 'Water Serpent',
    element: 'Water',
    maxHp: 18,
    attackBonus: 3,
    defense: 12,
    baseDamage: 4,
    specialName: 'Extinguish',
    specialDesc: 'Reduces fire damage by 2',
  },
  Water: {
    name: 'Earth Golem',
    element: 'Earth',
    maxHp: 22,
    attackBonus: 2,
    defense: 14,
    baseDamage: 5,
    specialName: 'Absorb',
    specialDesc: 'Heals 2 HP when hit by water attacks',
  },
  Earth: {
    name: 'Air Elemental',
    element: 'Air',
    maxHp: 14,
    attackBonus: 4,
    defense: 10,
    baseDamage: 3,
    specialName: 'Erode',
    specialDesc: 'Ignores earth defense bonus',
  },
  Air: {
    name: 'Fire Phoenix',
    element: 'Fire',
    maxHp: 16,
    attackBonus: 4,
    defense: 11,
    baseDamage: 4,
    specialName: 'Updraft',
    specialDesc: 'Air characters lose initiative bonus',
  },
  Wood: {
    name: 'Metal Construct',
    element: 'Metal',
    maxHp: 20,
    attackBonus: 3,
    defense: 13,
    baseDamage: 5,
    specialName: 'Chop',
    specialDesc: '+3 damage vs wood characters',
  },
  Metal: {
    name: 'Fire Forge',
    element: 'Fire',
    maxHp: 18,
    attackBonus: 3,
    defense: 12,
    baseDamage: 4,
    specialName: 'Melt',
    specialDesc: 'Metal characters have -2 defense',
  },
};

/**
 * The Primordial (final boss)
 */
export const PRIMORDIAL_STANDARD: Omit<Enemy, 'hp'> = {
  name: 'The Primordial',
  element: 'Fire', // Primordial encompasses all elements
  maxHp: 25,
  attackBonus: 4,
  defense: 13,
  baseDamage: 5,
  specialName: 'Primordial Strike',
  specialDesc: 'Deals d6 extra damage',
};

export const PRIMORDIAL_HARD: Omit<Enemy, 'hp'> = {
  name: 'The Primordial (Empowered)',
  element: 'Fire',
  maxHp: 28,
  attackBonus: 5,
  defense: 14,
  baseDamage: 6,
  specialName: 'Primordial Wrath',
  specialDesc: 'Deals d6 extra damage and regenerates 2 HP per round',
};

/**
 * Create a guardian enemy based on player's element
 */
export function createGuardian(playerElement: Element): Enemy {
  const template = GUARDIANS[playerElement];
  return {
    ...template,
    hp: template.maxHp,
  };
}

/**
 * Create the Primordial boss
 */
export function createPrimordial(hard: boolean): Enemy {
  const template = hard ? PRIMORDIAL_HARD : PRIMORDIAL_STANDARD;
  return {
    ...template,
    hp: template.maxHp,
  };
}

// ============================================================================
// Element Bonuses
// ============================================================================

/**
 * Get element combat bonus
 */
export function getElementBonus(
  playerElement: Element,
  context: 'attack' | 'defense' | 'damage' | 'initiative',
  enemyElement?: Element
): number {
  switch (playerElement) {
    case 'Fire':
      if (context === 'damage' && enemyElement === 'Wood') return 2;
      return 0;
    case 'Water':
      // Water has perception bonus, not combat
      return 0;
    case 'Earth':
      if (context === 'defense') return 2;
      return 0;
    case 'Air':
      if (context === 'initiative') return 100; // Always first
      return 0;
    case 'Wood':
      // Wood has regeneration, handled separately
      return 0;
    case 'Metal':
      if (context === 'damage') return 1;
      return 0;
    default:
      return 0;
  }
}

/**
 * Check if player should regenerate (Wood element)
 */
export function shouldRegenerate(playerElement: Element): boolean {
  return playerElement === 'Wood';
}

// ============================================================================
// Spirit Animal Abilities
// ============================================================================

export interface SpiritAbilityResult {
  /** Description of what happened */
  narrative: string;
  /** Direct damage to enemy */
  damage?: number;
  /** Healing to player */
  healing?: number;
  /** Buff to add */
  buff?: ActiveEffect;
  /** Whether enemy skips turn */
  enemySkipsTurn?: boolean;
  /** Whether to auto-succeed next check */
  autoSucceed?: boolean;
  /** Whether to auto-miss enemy attack */
  enemyAutoMiss?: boolean;
  /** Damage over time to enemy */
  poisonDamage?: number;
  /** Poison duration */
  poisonDuration?: number;
}

/**
 * Use spirit animal ability
 *
 * WIS "Spirit Bond" enhances numeric abilities:
 * - Wolf: +5 + wisMod attack buff
 * - Dragon: 8 + wisMod direct damage
 * - Tiger: +3 + wisMod damage buff
 * - Whale: 6 + wisMod healing
 * - Frog: 2 + floor(wisMod/2) poison per round
 * - Boolean effects (Bear, Eagle, Spider, Owl, Octopus, Elephant, Deer): unchanged
 */
export function useSpiritAbility(spirit: SpiritAnimal, state: GameState): SpiritAbilityResult {
  const wisMod = Math.max(0, state.character.stats.wis.modifier);
  const wisNote = wisMod > 0 ? ' Your spiritual bond amplifies the effect.' : '';

  switch (spirit) {
    case 'Wolf': {
      const value = 5 + wisMod;
      return {
        narrative: `You channel the spirit of the Wolf. Pack tactics guide your next strike.${wisNote}`,
        buff: {
          description: `Wolf Pack Tactics: +${value} to next attack`,
          type: 'buff',
          value,
          scenesRemaining: 1,
        },
      };
    }

    case 'Bear':
      return {
        narrative: 'You unleash a mighty roar infused with the Bear spirit. Your enemy staggers back, stunned.',
        enemySkipsTurn: true,
      };

    case 'Eagle':
      return {
        narrative: 'The Eagle spirit grants you perfect clarity. You will not miss your mark.',
        autoSucceed: true,
      };

    case 'Dragon': {
      const damage = 8 + wisMod;
      return {
        narrative: `Ancient dragon fire erupts from within you, engulfing your foe in primordial flame for ${damage} damage!${wisNote}`,
        damage,
      };
    }

    case 'Octopus':
      return {
        narrative: 'Like the Octopus, you slip free from all constraints. No trap can hold you.',
        buff: {
          description: 'Octopus Escape: Immune to grapple/trap',
          type: 'buff',
          value: 0,
          scenesRemaining: 99,
        },
      };

    case 'Owl':
      return {
        narrative: 'The Owl whispers secrets of the night. Hidden truths are revealed to you.',
        autoSucceed: true, // For perception/puzzle checks
      };

    case 'Tiger': {
      const value = 3 + wisMod;
      return {
        narrative: `You pounce with the ferocity of the Tiger. Your next strike will be devastating.${wisNote}`,
        buff: {
          description: `Tiger Pounce: +${value} damage on next attack`,
          type: 'buff',
          value,
          scenesRemaining: 1,
        },
      };
    }

    case 'Deer':
      return {
        narrative: 'With the Deer\'s grace, you vanish from the battlefield. The enemy cannot follow.',
        // Special: allows fleeing combat without penalty
        buff: {
          description: 'Deer Swift Escape: Can flee safely',
          type: 'buff',
          value: 0,
          scenesRemaining: 1,
        },
      };

    case 'Spider':
      return {
        narrative: 'Spectral webs ensnare your foe. Their next attack will surely miss.',
        enemyAutoMiss: true,
      };

    case 'Whale': {
      const healing = 6 + wisMod;
      return {
        narrative: `The Whale spirit fills you with oceanic vitality. Your wounds mend for ${healing} HP.${wisNote}`,
        healing,
      };
    }

    case 'Elephant':
      return {
        narrative: 'You become immovable as the Elephant. Fear and pain cannot touch you.',
        buff: {
          description: 'Elephant Unshakeable: Immune to fear/stun',
          type: 'buff',
          value: 0,
          scenesRemaining: 99,
        },
      };

    case 'Frog': {
      const poisonDamage = 2 + Math.floor(wisMod / 2);
      return {
        narrative: `Venom of the Frog spirit seeps into your enemy. They will suffer ${poisonDamage} damage per round.${wisNote}`,
        poisonDamage,
        poisonDuration: 3,
      };
    }

    default:
      return {
        narrative: 'You call upon your spirit animal, but nothing happens.',
      };
  }
}

// ============================================================================
// Damage Calculation
// ============================================================================

/**
 * Calculate player's attack modifier
 * STR always applies. From round 2+, INT bonus kicks in (exploit weakness — pattern recognition).
 */
export function getPlayerAttackMod(character: StoredCharacter, buffs: ActiveEffect[], combatRound: number = 1): number {
  let mod = character.stats.str.modifier; // Melee uses STR

  // INT: Exploit Weakness — from round 2+ the character reads enemy patterns
  if (combatRound >= 2) {
    mod += Math.max(0, character.stats.int.modifier);
  }

  // Add buff bonuses
  for (const buff of buffs) {
    if (buff.description.includes('attack') || buff.description.includes('Pack Tactics')) {
      mod += buff.value;
    }
  }

  return mod;
}

/**
 * Calculate player's damage
 */
export function calculatePlayerDamage(
  character: StoredCharacter,
  baseWeaponDamage: number,
  buffs: ActiveEffect[],
  enemyElement: Element
): number {
  let damage = baseWeaponDamage + character.stats.str.modifier;

  // Element bonus
  damage += getElementBonus(character.traits.element, 'damage', enemyElement);

  // Buff bonuses
  for (const buff of buffs) {
    if (buff.description.includes('damage') || buff.description.includes('Pounce')) {
      damage += buff.value;
    }
  }

  return Math.max(damage, 1); // Minimum 1 damage
}

/**
 * Calculate enemy damage to player
 */
export function calculateEnemyDamage(
  enemy: Enemy,
  character: StoredCharacter
): number {
  let damage = enemy.baseDamage;

  // Enemy special bonuses
  if (enemy.specialName === 'Chop' && character.traits.element === 'Wood') {
    damage += 3;
  }

  // Player CON reduces damage
  const reduction = Math.max(0, character.stats.con.modifier);
  damage = Math.max(damage - reduction, 1);

  return damage;
}

/**
 * Get player's defense value
 * DEX always applies. From round 2+, WIS bonus kicks in (insightful defense — reading attack patterns).
 */
export function getPlayerDefense(character: StoredCharacter, debuffs: ActiveEffect[], combatRound: number = 1): number {
  let defense = BASE_DEFENSE + character.stats.dex.modifier;

  // WIS: Insightful Defense — from round 2+ the character reads enemy attack patterns
  if (combatRound >= 2) {
    defense += Math.max(0, character.stats.wis.modifier);
  }

  // Element bonus
  defense += getElementBonus(character.traits.element, 'defense');

  // Element penalties
  if (character.traits.element === 'Metal') {
    // Check if fighting Fire enemy (Melt debuff)
    for (const debuff of debuffs) {
      if (debuff.description.includes('Melt')) {
        defense -= 2;
      }
    }
  }

  return defense;
}

// ============================================================================
// Combat Resolution
// ============================================================================

/**
 * Resolve a combat round
 *
 * Takes pre-derived dice values; the caller is responsible for sourcing
 * them from the deterministic dice system.
 */
export function resolveCombatRound(
  state: GameState,
  playerAction: CombatAction,
  playerAttackRoll: number,    // d20 result (1-20)
  playerDamageRoll: number,    // Weapon damage roll
  enemyAttackRoll: number,     // d20 result (1-20)
  enemyDamageRoll: number      // Enemy damage roll
): CombatRoundResult {
  const { character, combat, buffs, debuffs } = state;
  if (!combat) throw new Error('Not in combat');

  const { enemy, round, playerDefending } = combat;
  let playerDamage = 0;
  let enemyDamage = 0;
  let narrative = '';

  const playerDefense = getPlayerDefense(character, debuffs, round);

  // --- Player Turn ---
  switch (playerAction) {
    case 'attack': {
      const strMod = character.stats.str.modifier;
      const intMod = round >= 2 ? Math.max(0, character.stats.int.modifier) : 0;
      const attackMod = getPlayerAttackMod(character, buffs, round);
      const attackTotal = playerAttackRoll + attackMod;
      const hit = attackTotal >= enemy.defense;

      // Build attack breakdown string
      const modParts = [`${strMod}`];
      if (intMod > 0) modParts.push(`${intMod}INT`);
      const buffMod = attackMod - strMod - intMod;
      if (buffMod > 0) modParts.push(`${buffMod}buff`);
      const modBreakdown = modParts.join('+');

      if (hit) {
        playerDamage = calculatePlayerDamage(character, playerDamageRoll, buffs, enemy.element);
        narrative += `You strike the ${enemy.name}! (${playerAttackRoll}+${modBreakdown}=${attackTotal} vs ${enemy.defense}) `;
        narrative += `You deal ${playerDamage} damage. `;
      } else {
        narrative += `Your attack misses the ${enemy.name}. (${playerAttackRoll}+${modBreakdown}=${attackTotal} vs ${enemy.defense}) `;
      }
      break;
    }

    case 'defend':
      narrative += 'You raise your guard, preparing to deflect the next blow. ';
      // Defending gives +4 defense for this round (handled in enemy attack)
      break;

    case 'flee':
      // Check if player has Deer ability active
      const canFleeSafely = buffs.some(b => b.description.includes('Deer'));
      if (canFleeSafely) {
        narrative += 'With supernatural grace, you escape the battle unharmed. ';
        // Combat ends - handled by caller
      } else {
        narrative += 'You attempt to flee! The enemy gets a free strike as you turn. ';
        // Enemy gets free attack at advantage (not implemented in this simplified version)
      }
      break;
  }

  // --- Enemy Turn ---
  // Check for status effects
  const enemySkipsTurn = combat.rounds.length > 0 &&
    combat.rounds[combat.rounds.length - 1]?.narrative.includes('stunned');
  const enemyAutoMiss = buffs.some(b => b.description.includes('Spider'));

  if (enemySkipsTurn) {
    narrative += `The ${enemy.name} is still recovering from your roar. `;
  } else if (enemyAutoMiss) {
    narrative += `The ${enemy.name} strikes, but spectral webs deflect the blow! `;
    // Remove the spider buff after use
  } else {
    const enemyAttackTotal = enemyAttackRoll + enemy.attackBonus;
    const effectiveDefense = playerAction === 'defend' ? playerDefense + 4 : playerDefense;
    const enemyHit = enemyAttackTotal >= effectiveDefense;

    if (enemyHit) {
      enemyDamage = calculateEnemyDamage(enemy, character);
      narrative += `The ${enemy.name} strikes you! (${enemyAttackRoll}+${enemy.attackBonus}=${enemyAttackTotal} vs ${effectiveDefense}) `;
      narrative += `You take ${enemyDamage} damage. `;
    } else {
      narrative += `The ${enemy.name}'s attack misses. (${enemyAttackRoll}+${enemy.attackBonus}=${enemyAttackTotal} vs ${effectiveDefense}) `;
    }
  }

  // Apply damage
  const newEnemyHp = Math.max(0, enemy.hp - playerDamage);
  const newPlayerHp = Math.max(0, state.hp - enemyDamage);

  // Check for end conditions
  if (newEnemyHp <= 0) {
    narrative += `The ${enemy.name} falls! Victory is yours!`;
  } else if (newPlayerHp <= 0) {
    narrative += 'Darkness takes you. The trial has ended in defeat.';
  }

  return {
    round,
    playerAction,
    playerDamage,
    enemyAction: enemySkipsTurn ? 'stunned' : 'attack',
    enemyDamage,
    narrative,
    playerHpAfter: newPlayerHp,
    enemyHpAfter: newEnemyHp,
  };
}

// ============================================================================
// Combat State Helpers
// ============================================================================

/**
 * Check if combat is over
 */
export function isCombatOver(state: GameState): boolean {
  if (!state.combat) return true;
  return state.hp <= 0 || state.combat.enemy.hp <= 0;
}

/**
 * Get combat outcome
 */
export function getCombatOutcome(state: GameState): 'victory' | 'defeat' | 'ongoing' {
  if (!state.combat) return 'ongoing';
  if (state.hp <= 0) return 'defeat';
  if (state.combat.enemy.hp <= 0) return 'victory';
  return 'ongoing';
}

/**
 * Apply Wood regeneration at end of scene
 */
export function applyWoodRegeneration(state: GameState): number {
  if (state.character.traits.element === 'Wood') {
    const heal = 1;
    return Math.min(state.hp + heal, state.maxHp);
  }
  return state.hp;
}

/**
 * Tick down buff/debuff durations
 */
export function tickEffects(effects: ActiveEffect[]): ActiveEffect[] {
  return effects
    .map(e => ({ ...e, scenesRemaining: e.scenesRemaining - 1 }))
    .filter(e => e.scenesRemaining > 0);
}
