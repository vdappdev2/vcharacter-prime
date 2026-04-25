/**
 * Game Types for The Primordial Trial
 *
 * Type definitions for gameplay state, combat, dice rolls, and enemies.
 */

import type { StoredCharacter, Element, SpiritAnimal } from '../types';

// ============================================================================
// Dice Roll Types
// ============================================================================

/**
 * A single dice roll during gameplay
 */
export interface GameRoll {
  /** Unique label for this roll (e.g., "scene3_attack_1") */
  label: string;
  /** Action that triggered this roll */
  action: string;
  /** Client seed used for this roll (hex) */
  rollSeed: string;
  /** Hash of rollSeed (committed before block) */
  rollSeedHash: string;
  /** Block height used for randomness */
  blockHeight: number;
  /** Block hash used for randomness */
  blockHash: string;
  /** Die size (e.g., 20 for d20, 6 for d6) */
  dieSize: number;
  /** Raw roll result (1 to dieSize) */
  result: number;
  /** Stat modifier applied */
  modifier: number;
  /** Final total (result + modifier) */
  total: number;
  /** Target DC or enemy defense */
  target?: number;
  /** Outcome description */
  outcome: 'hit' | 'miss' | 'success' | 'fail' | 'critical';
  /** Timestamp of roll */
  timestamp: number;
}

/**
 * Pending roll awaiting block confirmation
 */
export interface PendingRoll {
  /** Unique label for this roll */
  label: string;
  /** Action description */
  action: string;
  /** Client seed (hex) */
  rollSeed: string;
  /** Hash of rollSeed */
  rollSeedHash: string;
  /** Block height when committed */
  commitBlockHeight: number;
  /** Die size */
  dieSize: number;
  /** Modifier to apply */
  modifier: number;
  /** Target DC (optional) */
  target?: number;
  /** When this was created */
  createdAt: number;
}

// ============================================================================
// Combat Types
// ============================================================================

/**
 * Enemy definition
 */
export interface Enemy {
  /** Enemy name */
  name: string;
  /** Enemy type/element */
  element: Element;
  /** Maximum HP */
  maxHp: number;
  /** Current HP */
  hp: number;
  /** Attack bonus (added to d20) */
  attackBonus: number;
  /** Defense value (player must roll this or higher to hit) */
  defense: number;
  /** Base damage dealt */
  baseDamage: number;
  /** Special ability name */
  specialName?: string;
  /** Special ability description */
  specialDesc?: string;
  /** Whether special has been used */
  specialUsed?: boolean;
}

/**
 * Combat action types
 */
export type CombatAction = 'attack' | 'defend' | 'special' | 'flee';

/**
 * Result of a combat round
 */
export interface CombatRoundResult {
  /** Round number */
  round: number;
  /** Player's action */
  playerAction: CombatAction;
  /** Player's roll (if applicable) */
  playerRoll?: GameRoll;
  /** Damage dealt by player */
  playerDamage: number;
  /** Enemy's action */
  enemyAction: string;
  /** Enemy's roll (if applicable) */
  enemyRoll?: GameRoll;
  /** Damage dealt by enemy */
  enemyDamage: number;
  /** Narrative description of the round */
  narrative: string;
  /** Player HP after round */
  playerHpAfter: number;
  /** Enemy HP after round */
  enemyHpAfter: number;
}

// ============================================================================
// Scene Types
// ============================================================================

/**
 * Scene identifiers
 */
export type SceneId =
  | 'intro'           // Scene 1: The Summoning
  | 'paths'           // Scene 2: The Three Paths
  | 'guardian'        // Scene 3: First Guardian Combat
  | 'puzzles'         // Scene 4: Puzzle Chamber
  | 'bargain'         // Scene 5: Spirit's Bargain
  | 'boss'            // Scene 6: Final Trial
  | 'resolution';     // Scene 7: Mark of the Worthy

/**
 * A choice option in the game
 */
export interface GameChoice {
  /** Choice identifier */
  id: string;
  /** Display text */
  text: string;
  /** Required stat (if gated) */
  requiredStat?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  /** Required stat value (if gated) */
  requiredValue?: number;
  /** Whether this choice is available to the current character */
  available: boolean;
  /** Why it's unavailable (if applicable) */
  unavailableReason?: string;
}

/**
 * Skill check definition
 */
export interface SkillCheck {
  /** Check identifier */
  id: string;
  /** Description of the check */
  description: string;
  /** Stat used for the check */
  stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  /** Difficulty class */
  dc: number;
  /** Description of success outcome */
  successDesc: string;
  /** Description of failure outcome */
  failureDesc: string;
  /** Mechanical effect of success */
  successEffect?: GameEffect;
  /** Mechanical effect of failure */
  failureEffect?: GameEffect;
}

/**
 * A game effect (buff, debuff, damage, healing)
 */
export interface GameEffect {
  /** Effect type */
  type: 'damage' | 'heal' | 'buff' | 'debuff';
  /** Numeric value (damage amount, heal amount, bonus value) */
  value: number;
  /** Description for buffs/debuffs */
  description?: string;
  /** Duration in scenes (for buffs/debuffs) */
  duration?: number;
}

// ============================================================================
// Game State
// ============================================================================

/**
 * Active buff or debuff
 */
export interface ActiveEffect {
  /** Effect description */
  description: string;
  /** Effect type */
  type: 'buff' | 'debuff';
  /** Numeric value */
  value: number;
  /** Scenes remaining */
  scenesRemaining: number;
}

/**
 * Complete game state
 */
export interface GameState {
  /** The character being played */
  character: StoredCharacter;

  /** Current scene */
  currentScene: SceneId;

  /** Current HP */
  hp: number;

  /** Maximum HP (20 + CON modifier * 3) */
  maxHp: number;

  /** Whether spirit ability has been used */
  spiritAbilityUsed: boolean;

  /** Active buffs */
  buffs: ActiveEffect[];

  /** Active debuffs */
  debuffs: ActiveEffect[];

  /** Path chosen in Scene 2 */
  pathChosen?: 'might' | 'cunning' | 'spirit' | 'shadows' | 'endurance' | 'charm';

  /** Choice made in Scene 5 */
  bargainChoice?: 'power' | 'wisdom';

  /** All choices made (for achievement record) */
  choices: string[];

  /** All rolls made (for verification) */
  rolls: GameRoll[];

  /** Current combat state (if in combat) */
  combat?: {
    enemy: Enemy;
    round: number;
    playerDefending: boolean;
    rounds: CombatRoundResult[];
  };

  /** Game outcome */
  outcome?: 'victory' | 'defeat';

  /** When game started */
  startedAt: number;

  /** When game ended (if finished) */
  endedAt?: number;
}

// ============================================================================
// Element and Spirit Bonuses
// ============================================================================

/**
 * Element bonus definition
 */
export interface ElementBonus {
  /** Element */
  element: Element;
  /** Bonus description */
  description: string;
  /** Stat affected (if any) */
  affectedStat?: string;
  /** Bonus value */
  bonus: number;
  /** Condition when bonus applies */
  condition: string;
}

/**
 * Spirit animal ability
 */
export interface SpiritAbility {
  /** Spirit animal */
  spirit: SpiritAnimal;
  /** Ability name */
  name: string;
  /** Ability description */
  description: string;
  /** Effect when used */
  effect: GameEffect | ((state: GameState) => GameState);
}

// ============================================================================
// Achievement Types
// ============================================================================

/**
 * Trial completion achievement
 */
export interface TrialCompletion {
  /** Character name */
  characterName: string;
  /** Character's creation roll block height (unique ID) */
  characterRollBlockHeight: number;
  /** Whether trial was completed (victory) */
  completed: boolean;
  /** Final HP (0 if defeated) */
  finalHp: number;
  /** Number of scenes completed */
  scenesCompleted: number;
  /** Path chosen */
  pathChosen?: string;
  /** Bargain choice */
  bargainChoice?: string;
  /** Whether spirit ability was used */
  spiritAbilityUsed: boolean;
  /** Key rolls for verification */
  keyRolls: GameRoll[];
  /** Total damage dealt */
  damageDealt: number;
  /** Total damage taken */
  damageTaken: number;
  /** Game duration in seconds */
  durationSeconds: number;
  /** Timestamp of completion */
  timestamp: number;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Request to start a new game
 */
export interface StartGameRequest {
  /** Character roll block height (identifies which character) */
  characterRollBlockHeight: number;
  /** Identity that owns the character */
  identity: string;
}

/**
 * Response from starting a game
 */
export interface StartGameResponse {
  /** Game session ID */
  sessionId: string;
  /** Initial game state */
  state: GameState;
  /** Error if failed */
  error?: string;
}

/**
 * Request to commit to a dice roll
 */
export interface CommitRollRequest {
  /** Game session ID */
  sessionId: string;
  /** Roll label */
  label: string;
  /** Action description */
  action: string;
  /** Roll seed hash */
  rollSeedHash: string;
  /** Die size */
  dieSize: number;
  /** Modifier to apply */
  modifier: number;
  /** Target DC (optional) */
  target?: number;
}

/**
 * Response from roll commitment
 */
export interface CommitRollResponse {
  /** Block height when committed */
  commitBlockHeight: number;
  /** Roll block height (commit + 1) */
  rollBlockHeight: number;
  /** Error if failed */
  error?: string;
}

/**
 * Request to reveal and resolve a roll
 */
export interface RevealRollRequest {
  /** Game session ID */
  sessionId: string;
  /** Roll label */
  label: string;
  /** Roll seed (revealed) */
  rollSeed: string;
}

/**
 * Response from roll reveal
 */
export interface RevealRollResponse {
  /** The resolved roll */
  roll: GameRoll;
  /** Updated game state */
  state: GameState;
  /** Error if failed */
  error?: string;
}
