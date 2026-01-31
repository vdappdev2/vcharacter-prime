/**
 * Game Module - The Primordial Trial
 *
 * Exports all game-related functionality.
 */

// Types
export type {
  GameRoll,
  PendingRoll,
  Enemy,
  CombatAction,
  CombatRoundResult,
  SceneId,
  GameChoice,
  SkillCheck,
  GameEffect,
  ActiveEffect,
  GameState,
  ElementBonus,
  SpiritAbility,
  TrialCompletion,
  StartGameRequest,
  StartGameResponse,
  CommitRollRequest,
  CommitRollResponse,
  RevealRollRequest,
  RevealRollResponse,
} from './types';

// Dice system
export {
  generateRollSeed,
  hashRollSeed,
  combineGameSeed,
  deriveGameRoll,
  deriveMultipleRolls,
  resolveRoll,
  simulateRoll,
  verifyRoll,
  verifyAllRolls,
  deriveBatchRolls,
  makeRollLabel,
  COMBAT_ROLL_LABELS,
  SKILL_CHECK_LABELS,
} from './dice';
export type { BatchRollSpec } from './dice';

// Combat system
export {
  BASE_HP,
  HP_PER_CON_MOD,
  BASE_DEFENSE,
  calculateMaxHp,
  calculateDefense,
  GUARDIANS,
  PRIMORDIAL_STANDARD,
  PRIMORDIAL_HARD,
  createGuardian,
  createPrimordial,
  getElementBonus,
  shouldRegenerate,
  useSpiritAbility,
  getPlayerAttackMod,
  calculatePlayerDamage,
  calculateEnemyDamage,
  getPlayerDefense,
  resolveCombatRound,
  isCombatOver,
  getCombatOutcome,
  applyWoodRegeneration,
  tickEffects,
} from './combat';
export type { SpiritAbilityResult } from './combat';

// Game engine
export {
  createGameState,
  advanceScene,
  isGameOver,
  setOutcome,
  getPathChoices,
  choosePath,
  initGuardianCombat,
  getPuzzleChecks,
  resolveSkillCheck,
  canChooseBoth,
  applyBargainChoice,
  initBossCombat,
  generateAchievement,
  recordRoll,
  applyDamage,
  applyHealing,
  useSpiritAbilityFlag,
  addBuff,
  addDebuff,
} from './engine';
export type { PathChoice, BargainChoice } from './engine';

// Verification
export { verifyBossFight } from './verification';
export type { ReplayVerificationResult } from './verification';
