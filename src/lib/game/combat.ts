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
  maxHp: 30,
  attackBonus: 4,
  defense: 13,
  baseDamage: 5,
  specialName: 'Primordial Strike',
  specialDesc: 'Deals d6 extra damage',
};

export const PRIMORDIAL_HARD: Omit<Enemy, 'hp'> = {
  name: 'The Primordial (Empowered)',
  element: 'Fire',
  maxHp: 31,
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
 *
 * Element perks not handled here (each lives where its trigger lives):
 *   - Fire:  +3 damage on the player's first successful attack each combat
 *            (resolveCombatRound, gated on combat.firstHitDealt)
 *   - Air:   +4 to the player's round-1 attack roll, every combat
 *            (getPlayerAttackMod, gated on combatRound === 1)
 *   - Water: +3 to the WIS perceive check in Scene 4
 *            (attemptPuzzle in src/routes/play/+page.svelte)
 *   - Wood:  +2 HP healed at the end of each combat
 *            (applyWoodRegeneration, gated on the leaving-combat-scene check)
 */
export function getElementBonus(
  playerElement: Element,
  context: 'attack' | 'defense' | 'damage',
  enemyElement?: Element
): number {
  // enemyElement reserved for future matchup-based perks; not used today.
  void enemyElement;
  switch (playerElement) {
    case 'Earth':
      if (context === 'defense') return 2;
      return 0;
    case 'Metal':
      if (context === 'damage') return 1;
      return 0;
    // Fire / Water / Air / Wood perks fire elsewhere — see doc comment above.
    case 'Fire':
    case 'Water':
    case 'Air':
    case 'Wood':
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
  narrative: string;
  healing?: number;
  buff?: ActiveEffect;
}

type SpiritCategory = 'offensive' | 'defensive' | 'restorative';

/**
 * Spirit animals are grouped into three mechanical categories. Per-animal
 * flavor (move name + narrative) differentiates them; the math is per
 * category. WIS modifier scales every category — this is the Spirit Bond
 * pitch in the game guide.
 */
const SPIRIT_CATEGORIES: Record<SpiritAnimal, SpiritCategory> = {
  Tiger: 'offensive',
  Wolf: 'offensive',
  Dragon: 'offensive',
  Eagle: 'offensive',
  Bear: 'defensive',
  Elephant: 'defensive',
  Octopus: 'defensive',
  Spider: 'defensive',
  Whale: 'restorative',
  Owl: 'restorative',
  Deer: 'restorative',
  Frog: 'restorative',
};

const SPIRIT_FLAVOR: Record<SpiritAnimal, { move: string; narrative: (wisNote: string) => string }> = {
  Tiger:    { move: 'Pounce',           narrative: (n) => `You pounce with the Tiger's ferocity. Your strikes will land with devastating power.${n}` },
  Wolf:     { move: 'Pack Tactics',     narrative: (n) => `You channel the Wolf. Pack tactics guide every strike.${n}` },
  Dragon:   { move: 'Primordial Flame', narrative: (n) => `Dragon fire courses through your veins. Each blow sears.${n}` },
  Eagle:    { move: 'Talon Strike',     narrative: (n) => `Eagle vision sharpens. You see every opening.${n}` },
  Bear:     { move: 'Resolve',          narrative: (n) => `The Bear's spirit settles over you. Blows glance off.${n}` },
  Elephant: { move: 'Stand Firm',       narrative: (n) => `Elephant strength roots you in place. You will not be moved.${n}` },
  Octopus:  { move: 'Slip',             narrative: (n) => `Like the Octopus, you slip every grasp aimed at you.${n}` },
  Spider:   { move: 'Web Shroud',       narrative: (n) => `Spectral webs curl around you, deflecting blows.${n}` },
  Whale:    { move: 'Ocean Vitality',   narrative: (n) => `The Whale spirit fills you with oceanic vitality.${n}` },
  Owl:      { move: 'Insight',          narrative: (n) => `The Owl's clarity mends your wounds.${n}` },
  Deer:     { move: 'Grace',            narrative: (n) => `The Deer's grace renews you.${n}` },
  Frog:     { move: 'Regeneration',     narrative: (n) => `Frog spirit knits flesh back together.${n}` },
};

/**
 * Use spirit animal ability.
 *
 * Three categories — offensive (atk/dmg buff), defensive (defense buff),
 * restorative (instant heal). All scale with the player's WIS modifier
 * (clamped at 0). Buffs use scenesRemaining: 1 — they apply for the rest
 * of the current combat scene and tick down on the next advanceScene call.
 *
 * Buff descriptions embed the substring tokens that getPlayerAttackMod /
 * calculatePlayerDamage / getPlayerDefense already match on, so no new
 * consumer plumbing is needed.
 */
export function useSpiritAbility(spirit: SpiritAnimal, state: GameState): SpiritAbilityResult {
  const wisMod = Math.max(0, state.character.stats.wis.modifier);
  const wisNote = wisMod > 0 ? ' Your spiritual bond amplifies the effect.' : '';
  const flavor = SPIRIT_FLAVOR[spirit];
  const narrative = flavor.narrative(wisNote);

  switch (SPIRIT_CATEGORIES[spirit]) {
    case 'offensive': {
      const value = 2 + wisMod;
      return {
        narrative,
        buff: {
          description: `${spirit} ${flavor.move}: +${value} attack & damage`,
          type: 'buff',
          value,
          scenesRemaining: 1,
          label: spirit,
        },
      };
    }
    case 'defensive': {
      const value = 3 + wisMod;
      return {
        narrative,
        buff: {
          description: `${spirit} ${flavor.move}: +${value} defense`,
          type: 'buff',
          value,
          scenesRemaining: 1,
          label: spirit,
        },
      };
    }
    case 'restorative':
      return { narrative, healing: 6 + wisMod };
  }
}

// ============================================================================
// Damage Calculation
// ============================================================================

/**
 * Calculate player's attack modifier
 * STR always applies. From round 2+, INT bonus kicks in (exploit weakness — pattern recognition).
 * Air element adds +4 to the round-1 attack roll, every combat.
 */
export function getPlayerAttackMod(character: StoredCharacter, buffs: ActiveEffect[], combatRound: number = 1): number {
  let mod = character.stats.str.modifier; // Melee uses STR

  // INT: Exploit Weakness — from round 2+ the character reads enemy patterns
  if (combatRound >= 2) {
    mod += Math.max(0, character.stats.int.modifier);
  }

  // Air element: +4 round-1 attack ("first strike" — replaces the dead
  // initiative-100 perk that never triggered).
  if (combatRound === 1 && character.traits.element === 'Air') {
    mod += 4;
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
 * Buffs whose description contains "defense", "Shadow", or "Wisdom" stack
 * (mirrors the substring-match pattern used by getPlayerAttackMod and
 * calculatePlayerDamage so Path of Shadows and the Gift of Wisdom bargain
 * actually take effect).
 */
export function getPlayerDefense(
  character: StoredCharacter,
  buffs: ActiveEffect[],
  debuffs: ActiveEffect[],
  combatRound: number = 1,
): number {
  let defense = BASE_DEFENSE + character.stats.dex.modifier;

  // WIS: Insightful Defense — from round 2+ the character reads enemy attack patterns
  if (combatRound >= 2) {
    defense += Math.max(0, character.stats.wis.modifier);
  }

  // Element bonus
  defense += getElementBonus(character.traits.element, 'defense');

  // Buff bonuses (Path of Shadows, Gift of Wisdom from Spirit Bargain)
  for (const buff of buffs) {
    if (
      buff.description.includes('defense')
      || buff.description.includes('Shadow')
      || buff.description.includes('Wisdom')
    ) {
      defense += buff.value;
    }
  }

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
 *
 * On round 1 of boss combat, consumes the WIS-puzzle one-shot flags from
 * state (bossEnemyGetsFreeFirstAttack / bossEnemySkipsFirstAttack):
 *   - bossEnemyGetsFreeFirstAttack: enemy attacks once, before the player.
 *     The normal enemy turn is suppressed (one swing total, not two).
 *     Caller must pass enemyFreeAttackRoll / enemyFreeDamageRoll.
 *   - bossEnemySkipsFirstAttack: enemy turn is skipped entirely.
 * Clearing both flags in state is the caller's job.
 */
export function resolveCombatRound(
  state: GameState,
  playerAction: CombatAction,
  playerAttackRoll: number,    // d20 result (1-20)
  playerDamageRoll: number,    // Weapon damage roll
  enemyAttackRoll: number,     // d20 result (1-20)
  enemyDamageRoll: number,     // Enemy damage roll
  enemyFreeAttackRoll?: number,
  enemyFreeDamageRoll?: number,
): CombatRoundResult {
  const { character, combat, buffs, debuffs } = state;
  if (!combat) throw new Error('Not in combat');

  const { enemy, round, playerDefending } = combat;
  let playerDamage = 0;
  let enemyDamage = 0;
  let narrative = '';

  const playerDefense = getPlayerDefense(character, buffs, debuffs, round);

  // --- WIS-puzzle one-shot: free enemy attack before the player acts ---
  // (Only on round 1 of boss combat. Failure of the WIS perceive check.)
  // When this fires, the regular enemy turn is suppressed below — the boss
  // gets one swing, not two.
  const isFirstBossRound = state.currentScene === 'boss' && round === 1;
  const runFreeAttack =
    isFirstBossRound
    && state.bossEnemyGetsFreeFirstAttack === true
    && enemyFreeAttackRoll !== undefined
    && enemyFreeDamageRoll !== undefined;
  let freeAttackHit = false;
  if (runFreeAttack) {
    const freeAttackTotal = enemyFreeAttackRoll! + enemy.attackBonus;
    if (freeAttackTotal >= playerDefense) {
      const freeDamage = calculateEnemyDamage(enemy, character);
      enemyDamage += freeDamage;
      freeAttackHit = true;
      narrative += `Ambushed! The ${enemy.name} strikes before you can react (${enemyFreeAttackRoll}+${enemy.attackBonus}=${freeAttackTotal} vs ${playerDefense}) and lands ${freeDamage} damage. `;
    } else {
      narrative += `The ${enemy.name} lunges first, but its opening strike misses (${enemyFreeAttackRoll}+${enemy.attackBonus}=${freeAttackTotal} vs ${playerDefense}). `;
    }
  }

  // --- Player Turn ---
  switch (playerAction) {
    case 'attack': {
      const strMod = character.stats.str.modifier;
      const intMod = round >= 2 ? Math.max(0, character.stats.int.modifier) : 0;
      const attackMod = getPlayerAttackMod(character, buffs, round);
      const attackTotal = playerAttackRoll + attackMod;
      const hit = attackTotal >= enemy.defense;

      // Build attack breakdown string. Each contribution gets its own segment
      // so a player can see at a glance which buffs are active — e.g.
      // "1+2INT+4Air+2Eagle+2Rune" rather than the old opaque "1+2INT+8buff".
      const modParts = [`${strMod}`];
      if (intMod > 0) modParts.push(`${intMod}INT`);
      if (round === 1 && character.traits.element === 'Air') modParts.push('4Air');
      for (const buff of buffs) {
        if (buff.description.includes('attack') || buff.description.includes('Pack Tactics')) {
          const label = buff.label ?? buff.description.split(/[ :]/)[0];
          modParts.push(`${buff.value}${label}`);
        }
      }
      const modBreakdown = modParts.join('+');

      if (hit) {
        playerDamage = calculatePlayerDamage(character, playerDamageRoll, buffs, enemy.element);
        // Fire element: +3 bonus damage on the first successful attack each combat.
        const isFireFirstHit =
          character.traits.element === 'Fire' && !combat.firstHitDealt;
        if (isFireFirstHit) {
          playerDamage += 3;
        }
        narrative += `You strike the ${enemy.name}! (${playerAttackRoll}+${modBreakdown}=${attackTotal} vs ${enemy.defense}) `;
        if (isFireFirstHit) {
          narrative += `Searing flame opens the wound for +3 bonus damage. `;
        }
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
  // WIS-puzzle one-shot: success on the perceive check skips the boss's first attack.
  const enemySkipsForeseen = isFirstBossRound && !!state.bossEnemySkipsFirstAttack;

  let enemyActionLabel: string;
  if (runFreeAttack) {
    // The free attack above was the enemy's swing for this round; suppress
    // the regular enemy turn so the boss only attacks once.
    enemyActionLabel = freeAttackHit ? 'free-attack-hit' : 'free-attack-miss';
  } else if (enemySkipsForeseen) {
    narrative += `Foreseen — the ${enemy.name}'s opening attack passes through empty air. `;
    enemyActionLabel = 'foreseen-skip';
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
    enemyActionLabel = 'attack';
  }

  // Apply damage
  const newEnemyHp = Math.max(0, enemy.hp - playerDamage);
  const newPlayerHp = Math.max(0, state.hp - enemyDamage);

  // Check for end conditions. Mutual-KO defaults to defeat — except for Wood
  // characters, whose end-of-combat regen pulls them back ("last gasp").
  // Outcome resolution is duplicated in getCombatOutcome below; both must agree.
  const playerDown = newPlayerHp <= 0;
  const enemyDown = newEnemyHp <= 0;
  const woodLastGasp = playerDown && enemyDown && character.traits.element === 'Wood';

  if (enemyDown && !playerDown) {
    narrative += `The ${enemy.name} falls! Victory is yours!`;
  } else if (woodLastGasp) {
    narrative += `The ${enemy.name} falls and you collapse beside it — but Wood spirit stirs your life back. Victory through sacrifice.`;
  } else if (playerDown) {
    narrative += 'Darkness takes you. The trial has ended in defeat.';
  }

  return {
    round,
    playerAction,
    playerDamage,
    enemyAction: enemyActionLabel,
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
 *
 * Mutual KO (both at 0) defaults to defeat — the player's hard-floor death
 * check wins the tie. Wood characters get a "last gasp" exception: their
 * end-of-combat regen pulls them above 0, so a mutual KO becomes victory
 * (the regen lands in advanceScene → applyWoodRegeneration). Mirror this
 * in resolveCombatRound's narrative.
 */
export function getCombatOutcome(state: GameState): 'victory' | 'defeat' | 'ongoing' {
  if (!state.combat) return 'ongoing';

  const playerDown = state.hp <= 0;
  const enemyDown = state.combat.enemy.hp <= 0;

  if (
    playerDown
    && enemyDown
    && state.character.traits.element === 'Wood'
    && state.hp + WOOD_REGEN_AMOUNT > 0
  ) {
    return 'victory';
  }

  if (playerDown) return 'defeat';
  if (enemyDown) return 'victory';
  return 'ongoing';
}

/**
 * Wood element heal amount, applied at the end of each combat scene.
 * Also drives the "last gasp" mutual-KO survival check in getCombatOutcome.
 */
export const WOOD_REGEN_AMOUNT = 2;

/**
 * Apply Wood regeneration at end of combat
 *
 * Wood characters heal +2 HP at the end of each combat scene (guardian or
 * boss), capped at maxHp. Called from advanceScene before currentScene is
 * updated, so state.currentScene is the scene we're leaving.
 */
export function applyWoodRegeneration(state: GameState): number {
  if (state.character.traits.element !== 'Wood') return state.hp;
  // Only fire when leaving a combat scene.
  if (state.currentScene !== 'guardian' && state.currentScene !== 'boss') return state.hp;
  return Math.min(state.hp + WOOD_REGEN_AMOUNT, state.maxHp);
}

/**
 * Tick down buff/debuff durations
 */
export function tickEffects(effects: ActiveEffect[]): ActiveEffect[] {
  return effects
    .map(e => ({ ...e, scenesRemaining: e.scenesRemaining - 1 }))
    .filter(e => e.scenesRemaining > 0);
}
