/**
 * Boss Fight Replay Verification
 *
 * Replays a boss fight using stored proof data to verify the outcome.
 * Uses deterministic dice derivation from seed + block hash.
 */

import type { StoredCharacter, Element, SpiritAnimal } from '../types';
import type { GameState, Enemy, ActiveEffect } from './types';
import { combineGameSeed, deriveGameRoll } from './dice';
import {
  createPrimordial,
  calculateMaxHp,
  resolveCombatRound,
  useSpiritAbility,
  getCombatOutcome,
} from './combat';
import type { ParsedAchievementData } from '../vdxf';

export interface ReplayVerificationResult {
  valid: boolean;
  expectedOutcome: 'victory' | 'defeat';
  expectedFinalHp: number;
  expectedRounds: number;
  actualOutcome?: 'victory' | 'defeat';
  actualFinalHp?: number;
  actualRounds?: number;
  error?: string;
}

interface MinimalCharacter {
  name: string;
  stats: {
    str: { total: number; modifier: number };
    dex: { total: number; modifier: number };
    con: { total: number; modifier: number };
    int: { total: number; modifier: number };
    wis: { total: number; modifier: number };
    cha: { total: number; modifier: number };
  };
  traits: {
    element: Element;
    spiritAnimal: SpiritAnimal;
    sex: 'Male' | 'Female';
  };
}

/**
 * Replay a boss fight and verify the outcome matches the stored achievement
 */
export async function verifyBossFight(
  character: MinimalCharacter,
  achievement: ParsedAchievementData
): Promise<ReplayVerificationResult> {
  // Validate required fields
  if (!achievement.bossSceneSeed || !achievement.bossSceneBlockHash || !achievement.playerActions) {
    return {
      valid: false,
      expectedOutcome: 'victory',
      expectedFinalHp: 0,
      expectedRounds: 0,
      error: 'Missing verification data (seed, block hash, or player actions)',
    };
  }

  try {
    // Create the combined seed for roll derivation
    const combinedSeed = await combineGameSeed(
      achievement.bossSceneBlockHash,
      achievement.bossSceneSeed
    );

    // Determine if hard mode (this affects boss stats)
    const hardMode = achievement.difficulty === 'hard';

    // Initialize game state for replay
    const maxHp = calculateMaxHpFromStats(character.stats.con.modifier);
    let hp = maxHp;
    const enemy = createPrimordial(hardMode);
    let spiritAbilityUsed = false;
    let buffs: ActiveEffect[] = [];
    let round = 1;
    let rollCounter = 0;

    // Replay each action
    for (const action of achievement.playerActions) {
      // Handle special (spirit ability)
      if (action === 'special') {
        if (spiritAbilityUsed) {
          return {
            valid: false,
            expectedOutcome: 'victory',
            expectedFinalHp: 0,
            expectedRounds: 0,
            error: 'Invalid replay: spirit ability used twice',
          };
        }

        const abilityResult = useSpiritAbility(character.traits.spiritAnimal, {
          character: convertToStoredCharacter(character),
          hp,
          maxHp,
          currentScene: 'boss',
          choices: [],
          buffs,
          debuffs: [],
          spiritAbilityUsed: false,
        } as GameState);

        spiritAbilityUsed = true;

        // Apply ability effects
        if (abilityResult.damage) {
          enemy.hp = Math.max(0, enemy.hp - abilityResult.damage);
        }
        if (abilityResult.healing) {
          hp = Math.min(maxHp, hp + abilityResult.healing);
        }
        if (abilityResult.buff) {
          buffs = [...buffs, abilityResult.buff];
        }

        // Check if combat is over
        if (enemy.hp <= 0) {
          return {
            valid: achievement.finalHp === hp && achievement.roundsToWin === round,
            expectedOutcome: 'victory',
            expectedFinalHp: hp,
            expectedRounds: round,
            actualOutcome: 'victory',
            actualFinalHp: achievement.finalHp,
            actualRounds: achievement.roundsToWin,
          };
        }

        continue;
      }

      // Derive rolls for this round
      const playerAttackRoll = deriveGameRoll(combinedSeed, `player_attack_${rollCounter}`, 20);
      rollCounter++;
      const playerDamageRoll = deriveGameRoll(combinedSeed, `player_damage_${rollCounter}`, 6) + 2;
      rollCounter++;
      const enemyAttackRoll = deriveGameRoll(combinedSeed, `enemy_attack_${rollCounter}`, 20);
      rollCounter++;
      const enemyDamageRoll = deriveGameRoll(combinedSeed, `enemy_damage_${rollCounter}`, 6);
      rollCounter++;

      // Create minimal game state for combat resolution
      const gameState: GameState = {
        character: convertToStoredCharacter(character),
        hp,
        maxHp,
        currentScene: 'boss',
        choices: [],
        buffs,
        debuffs: [],
        spiritAbilityUsed,
        combat: {
          enemy,
          round,
          playerDefending: false,
          rounds: [],
        },
      };

      // Resolve combat round
      const result = resolveCombatRound(
        gameState,
        action,
        playerAttackRoll,
        playerDamageRoll,
        enemyAttackRoll,
        enemyDamageRoll
      );

      // Update state
      hp = result.playerHpAfter;
      enemy.hp = result.enemyHpAfter;
      round++;

      // Consume one-time buffs
      buffs = buffs.filter(b => {
        if (b.description.includes('Pack Tactics') || b.description.includes('Pounce')) {
          return false; // Consumed
        }
        return true;
      });

      // Check for end conditions
      if (enemy.hp <= 0) {
        const outcome = 'victory';
        const roundsToWin = round - 1; // Round incremented after resolution
        return {
          valid: achievement.finalHp === hp && achievement.roundsToWin === roundsToWin,
          expectedOutcome: outcome,
          expectedFinalHp: hp,
          expectedRounds: roundsToWin,
          actualOutcome: 'victory',
          actualFinalHp: achievement.finalHp,
          actualRounds: achievement.roundsToWin,
        };
      }

      if (hp <= 0) {
        return {
          valid: false,
          expectedOutcome: 'defeat',
          expectedFinalHp: hp,
          expectedRounds: round - 1,
          error: 'Replay resulted in defeat, but achievement claims victory',
        };
      }
    }

    // If we get here, actions ran out before combat ended
    return {
      valid: false,
      expectedOutcome: 'defeat',
      expectedFinalHp: hp,
      expectedRounds: round - 1,
      error: 'Actions exhausted before combat ended',
    };
  } catch (err) {
    return {
      valid: false,
      expectedOutcome: 'victory',
      expectedFinalHp: 0,
      expectedRounds: 0,
      error: err instanceof Error ? err.message : 'Unknown error during verification',
    };
  }
}

/**
 * Calculate max HP from CON modifier
 */
function calculateMaxHpFromStats(conModifier: number): number {
  return Math.max(20 + conModifier * 3, 5);
}

/**
 * Convert minimal character to StoredCharacter format for combat functions
 */
function convertToStoredCharacter(char: MinimalCharacter): StoredCharacter {
  return {
    name: char.name,
    stats: {
      str: { ...char.stats.str, dice: [] },
      dex: { ...char.stats.dex, dice: [] },
      con: { ...char.stats.con, dice: [] },
      int: { ...char.stats.int, dice: [] },
      wis: { ...char.stats.wis, dice: [] },
      cha: { ...char.stats.cha, dice: [] },
    },
    traits: {
      element: char.traits.element,
      spiritAnimal: char.traits.spiritAnimal,
      sex: char.traits.sex,
    },
    verification: {
      block_height: 0,
      block_hash: '',
      client_seed: '',
      timestamp: 0,
    },
    userIdentity: '',
    userFriendlyName: '',
    commitment: {
      challenge: '',
      response: '',
      signedBlockHeight: 0,
      clientSeedHash: '',
    },
    rollBlockHeight: 0,
    rollBlockHash: '',
  };
}
