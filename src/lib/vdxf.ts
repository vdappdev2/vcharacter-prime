/**
 * VDXF Helpers for Character Storage
 *
 * Helper functions for building ContentMultiMap structures
 * for storing character data on-chain.
 *
 * Schema: prime.inaugural (outer key)
 *   Labels (inside DataDescriptor):
 *   - .name   → Character display name (string)
 *   - .stats  → Stats object (strength, dexterity, etc.)
 *   - .traits → Traits object (element, spirit, sex)
 *   - .proof  → Cryptographic proof for verification
 */

import type { StoredCharacter } from './types';
import type { TrialCompletion } from './game/types';
import { VDXF_KEYS } from './config';

// ============================================================================
// Types for ContentMultiMap structure
// ============================================================================

/**
 * DataDescriptor structure used in contentmultimap
 * objectdata can be:
 * - { message: string } for text/plain (when we create it)
 * - string (hex-encoded) for application/json (when daemon returns it)
 * - null for deleted entries
 */
interface DataDescriptor {
  version: number;
  label: string;
  mimetype: string;
  objectdata: { message: string } | string | null;
  flags?: number;
}

/**
 * DataDescriptor wrapper - keyed by the dataDescriptor VDXF key
 */
type DataDescriptorWrapper = {
  [key: string]: DataDescriptor;
};

/**
 * ContentMultiMap structure for updateidentity
 */
export type ContentMultiMap = {
  [outerKey: string]: DataDescriptorWrapper[];
};

// ============================================================================
// Building Functions
// ============================================================================

/**
 * Build a single DataDescriptor entry
 *
 * Under application/json the on-chain payload must be valid JSON, so bare
 * string values are JSON.stringified (producing a quoted JSON string).
 * Under text/plain we keep the legacy passthrough so bare strings produce
 * the {message: <string>} shape unchanged.
 */
function buildDataDescriptor(
  label: string,
  value: string | object,
  mimetype: string = 'text/plain'
): DataDescriptorWrapper {
  const message =
    mimetype === 'application/json'
      ? JSON.stringify(value)
      : typeof value === 'object'
        ? JSON.stringify(value)
        : value;

  return {
    [VDXF_KEYS.dataDescriptor]: {
      version: 1,
      label,
      mimetype,
      objectdata: { message },
    },
  };
}

/**
 * Build a ContentMultiMap for character storage
 *
 * Creates the complete structure for storing character proof on-chain.
 * Uses a single outer key (vcharacter.prime) with labeled DataDescriptor entries.
 *
 * Schema: prime.inaugural (outer key)
 *   Labels inside DataDescriptor:
 *   - .name   → Character display name
 *   - .stats  → Stats JSON (strength, dexterity, etc.)
 *   - .traits → Traits JSON (element, spirit, sex)
 *   - .proof  → Cryptographic proof for verification
 *
 * The proof contains everything needed for trustless verification:
 *   - clientSeed: The revealed seed (hash must match commitment)
 *   - rollBlockHeight: Block used for randomness
 *   - rollBlockHash: Hash of that block (verifiable on-chain)
 *   - commitmentBlockHeight: Block at which the wallet signed the commitment
 *     (extracted from the signed GenericResponse envelope signature)
 *
 * @param character - The complete stored character with all verification data
 * @returns ContentMultiMap ready for updateidentity
 */
export function buildCharacterContentMap(character: StoredCharacter): ContentMultiMap {
  const entries: DataDescriptorWrapper[] = [];

  // Name entry: application/json with a JSON-encoded string payload. The
  // reader hex-decodes then JSON.parses to recover the bare string. This
  // keeps getidentity output as opaque hex blobs rather than human-readable
  // strings — casual obfuscation only, content remains publicly decodable.
  entries.push(
    buildDataDescriptor(VDXF_KEYS.labels.name, character.name, 'application/json'),
  );

  const statsData = {
    strength: character.stats.str,
    dexterity: character.stats.dex,
    constitution: character.stats.con,
    intelligence: character.stats.int,
    wisdom: character.stats.wis,
    charisma: character.stats.cha,
  };
  entries.push(
    buildDataDescriptor(VDXF_KEYS.labels.stats, statsData, 'application/json'),
  );

  const traitsData = {
    element: character.traits.element,
    spirit: character.traits.spiritAnimal,
    sex: character.traits.sex,
  };
  entries.push(
    buildDataDescriptor(VDXF_KEYS.labels.traits, traitsData, 'application/json'),
  );

  // Proof entry - minimal data needed for verification.
  // Anyone can verify: SHA256(clientSeed) == clientSeedHash, and re-derive character
  const proofData = {
    clientSeed: character.verification.client_seed,
    clientSeedHash: character.commitment.clientSeedHash,
    rollBlockHeight: character.rollBlockHeight,
    rollBlockHash: character.rollBlockHash,
    commitmentBlockHeight: character.commitment.signedBlockHeight,
  };
  entries.push(
    buildDataDescriptor(VDXF_KEYS.labels.proof, proofData, 'application/json'),
  );

  // Plan §9.2: outer key MUST be the FQN string for custom keys. Wallet rejects
  // raw i-address outer keys with "Cannot update with unknown key".
  return {
    [VDXF_KEYS.primeInauguralFqn]: entries,
  };
}

/**
 * Achievement proof data for on-chain storage
 *
 * Contains all data needed to replay and verify the boss fight.
 */
export interface AchievementProofData {
  // Which character completed the trial
  characterName: string;
  characterRollBlockHeight: number;

  // Deterministic-replay proof for the boss fight
  bossSceneSeed: string;
  bossSceneBlockHeight: number;
  bossSceneBlockHash: string;

  // Player actions sequence (verifiable replay input).
  // CombatAction in src/lib/game/types.ts also includes 'flee', but the play
  // UI doesn't surface a flee button and the Deer-spirit "flee safely" buff
  // isn't currently consumed (see audit on spirit-ability plumbing). If flee
  // is ever wired in, add it here and to ParsedAchievementData below.
  playerActions: ('attack' | 'defend' | 'special')[];

  // Summary stats
  difficulty: 'standard' | 'hard';
  finalHp: number;
  maxHp?: number;
  roundsToWin: number;
  completedAtBlock: number;

  // Trial choices (optional — older achievements may not have these)
  pathChosen?: 'might' | 'cunning' | 'spirit' | 'shadows' | 'endurance' | 'charm';
  bargainChoice?: 'power' | 'wisdom';
  bargainBothBuffs?: boolean;
  spiritAbilityUsed?: boolean;

  // Scene 4 puzzle outcomes — required to reconstruct the player's pre-boss
  // state (INT/DEX HP and buff deltas, WIS round-1 modification) when
  // verifying the boss-fight replay.
  puzzleResults?: {
    decipher?: 'success' | 'failure';
    perceive?: 'success' | 'failure';
    manipulate?: 'success' | 'failure';
  };
}

/**
 * Build a ContentMultiMap for achievement storage
 *
 * Stores a single achievement entry under the primordialTrial key.
 * The proof includes seed + block height so anyone can re-derive
 * and verify the boss fight outcome.
 *
 * @param achievement - The achievement proof data
 * @returns ContentMultiMap ready for updateidentity
 */
export function buildAchievementContentMap(achievement: AchievementProofData): ContentMultiMap {
  const entries: DataDescriptorWrapper[] = [];

  // Single entry containing all achievement data.
  entries.push(buildDataDescriptor('.achievement', achievement, 'application/json'));

  // Plan §9.2: outer key MUST be the FQN string for custom keys.
  return {
    [VDXF_KEYS.primordialTrialFqn]: entries,
  };
}

/**
 * Parsed character data from on-chain storage
 */
export interface ParsedCharacterData {
  name?: string;
  stats?: {
    strength?: { total: number; dice: number[]; modifier: number };
    dexterity?: { total: number; dice: number[]; modifier: number };
    constitution?: { total: number; dice: number[]; modifier: number };
    intelligence?: { total: number; dice: number[]; modifier: number };
    wisdom?: { total: number; dice: number[]; modifier: number };
    charisma?: { total: number; dice: number[]; modifier: number };
  };
  traits?: {
    element?: string;
    spirit?: string;
    sex?: string;
  };
  proof?: {
    clientSeed?: string;
    clientSeedHash?: string;
    rollBlockHeight?: number;
    rollBlockHash?: string;
    commitmentBlockHeight?: number;
  };
}

/**
 * Check if a DataDescriptor is a deletion marker
 */
function isDeleted(descriptor: DataDescriptor): boolean {
  return descriptor.objectdata === null || descriptor.flags === 32;
}

/**
 * Convert hex string to UTF-8 string
 */
function hexToString(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Extract string value from DataDescriptor objectdata
 * Handles both formats:
 * - { message: string } - for text/plain
 * - hex string - for application/json (daemon returns hex-encoded data)
 */
function extractStringValue(descriptor: DataDescriptor): string | undefined {
  if (descriptor.objectdata === null) return undefined;

  // Format 1: { message: string } - text/plain
  if (typeof descriptor.objectdata === 'object' && 'message' in descriptor.objectdata) {
    return descriptor.objectdata.message;
  }

  // Format 2: hex string - application/json
  if (typeof descriptor.objectdata === 'string') {
    try {
      return hexToString(descriptor.objectdata);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Decode a name field that may be either a JSON-encoded string (new
 * application/json shape) or a bare string (legacy text/plain shape).
 * Falls back to the raw value on any parse failure or non-string result.
 */
function tryParseJsonString(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // Not valid JSON → legacy bare string.
  }
  return value;
}

/**
 * Parse a ContentMultiMap back into character data
 *
 * Used for verification - extracts character data from on-chain storage.
 * Handles the schema: vcharacter.prime outer key with labeled DataDescriptor entries
 *
 * @param contentMap - The ContentMultiMap from identity query
 * @returns Parsed character data for verification
 */
export function parseCharacterContentMap(contentMap: Record<string, unknown>): ParsedCharacterData | null {
  // Plan §9.3: accept both FQN and i-address forms — daemon normalization on
  // storage is undocumented and may change.
  const entries = (contentMap[VDXF_KEYS.primeInauguralFqn] ?? contentMap[VDXF_KEYS.primeInaugural]) as
    | DataDescriptorWrapper[]
    | undefined;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const result: ParsedCharacterData = {};

  for (const wrapper of entries) {
    const descriptor = wrapper[VDXF_KEYS.dataDescriptor];
    if (!descriptor || isDeleted(descriptor)) continue;

    const label = descriptor.label;
    if (!label) continue;

    const value = extractStringValue(descriptor);
    if (!value) continue;

    // Match label to known fields
    if (label === VDXF_KEYS.labels.name) {
      // New writes encode name as application/json (JSON-quoted string);
      // legacy text/plain entries on production identities are bare strings.
      result.name = tryParseJsonString(value);
    } else if (label === VDXF_KEYS.labels.stats) {
      try {
        result.stats = JSON.parse(value);
      } catch {
        // Invalid JSON
      }
    } else if (label === VDXF_KEYS.labels.traits) {
      try {
        result.traits = JSON.parse(value);
      } catch {
        // Invalid JSON
      }
    } else if (label === VDXF_KEYS.labels.proof) {
      try {
        result.proof = JSON.parse(value);
      } catch {
        // Invalid JSON
      }
    }
  }

  // Return null if no data found
  if (!result.name && !result.stats && !result.traits && !result.proof) {
    return null;
  }

  return result;
}

/**
 * Parse all characters from a ContentMultiMap
 *
 * Characters are stored sequentially in the contentmultimap array,
 * 4 entries per character (name, stats, traits, proof).
 * Each character uses a unique rollBlockHeight as its identifier.
 *
 * @param contentMap - The ContentMultiMap from identity query
 * @returns Array of parsed character data
 */
export function parseAllCharacters(contentMap: Record<string, unknown>): ParsedCharacterData[] {
  // Plan §9.3: accept both FQN and i-address forms.
  const entries = (contentMap[VDXF_KEYS.primeInauguralFqn] ?? contentMap[VDXF_KEYS.primeInaugural]) as
    | DataDescriptorWrapper[]
    | undefined;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const characters: ParsedCharacterData[] = [];
  let currentCharacter: ParsedCharacterData = {};

  for (const wrapper of entries) {
    const descriptor = wrapper[VDXF_KEYS.dataDescriptor];
    if (!descriptor || isDeleted(descriptor)) continue;

    const label = descriptor.label;
    if (!label) continue;

    const value = extractStringValue(descriptor);
    if (!value) continue;

    // Detect start of a new character (name label)
    if (label === VDXF_KEYS.labels.name) {
      // Save previous character if it has data
      if (currentCharacter.name || currentCharacter.proof) {
        characters.push(currentCharacter);
      }
      // New writes encode name as application/json (JSON-quoted string);
      // legacy text/plain entries on production identities are bare strings.
      currentCharacter = { name: tryParseJsonString(value) };
    } else if (label === VDXF_KEYS.labels.stats) {
      try {
        currentCharacter.stats = JSON.parse(value);
      } catch {
        // Invalid JSON
      }
    } else if (label === VDXF_KEYS.labels.traits) {
      try {
        currentCharacter.traits = JSON.parse(value);
      } catch {
        // Invalid JSON
      }
    } else if (label === VDXF_KEYS.labels.proof) {
      try {
        currentCharacter.proof = JSON.parse(value);
      } catch {
        // Invalid JSON
      }
    }
  }

  // Don't forget the last character
  if (currentCharacter.name || currentCharacter.proof) {
    characters.push(currentCharacter);
  }

  return characters;
}

/**
 * Find a specific character by rollBlockHeight
 *
 * @param contentMap - The ContentMultiMap from identity query
 * @param rollBlockHeight - The roll block height to find
 * @returns The matching character or null
 */
export function findCharacterByRollBlockHeight(
  contentMap: Record<string, unknown>,
  rollBlockHeight: number
): ParsedCharacterData | null {
  const characters = parseAllCharacters(contentMap);
  return characters.find(c => c.proof?.rollBlockHeight === rollBlockHeight) || null;
}

/**
 * Format character data for display in a simple format
 * Useful for QR codes or deeplinks with limited space
 */
export function formatCharacterForCompactStorage(character: StoredCharacter): string {
  return JSON.stringify({
    n: character.name,
    cs: character.verification.client_seed,
    rb: character.rollBlockHeight,
    cb: character.commitment.signedBlockHeight,
    s: {
      str: character.stats.str.total,
      dex: character.stats.dex.total,
      con: character.stats.con.total,
      int: character.stats.int.total,
      wis: character.stats.wis.total,
      cha: character.stats.cha.total,
    },
    t: {
      e: character.traits.element,
      a: character.traits.spiritAnimal,
      x: character.traits.sex,
    },
  });
}

// ============================================================================
// Achievement Parsing
// ============================================================================

/**
 * Parsed achievement data from on-chain storage
 */
export interface ParsedAchievementData {
  characterName?: string;
  characterRollBlockHeight?: number;
  bossSceneSeed?: string;
  bossSceneBlockHeight?: number;
  bossSceneBlockHash?: string;
  playerActions?: ('attack' | 'defend' | 'special')[];
  difficulty?: 'standard' | 'hard';
  finalHp?: number;
  maxHp?: number;
  roundsToWin?: number;
  completedAtBlock?: number;
  pathChosen?: 'might' | 'cunning' | 'spirit' | 'shadows' | 'endurance' | 'charm';
  bargainChoice?: 'power' | 'wisdom';
  bargainBothBuffs?: boolean;
  spiritAbilityUsed?: boolean;
  puzzleResults?: {
    decipher?: 'success' | 'failure';
    perceive?: 'success' | 'failure';
    manipulate?: 'success' | 'failure';
  };
}

/**
 * Parse all achievements from a ContentMultiMap
 *
 * @param contentMap - The ContentMultiMap from identity query (using primordialTrial key)
 * @returns Array of parsed achievement data
 */
export function parseAllAchievements(contentMap: Record<string, unknown>): ParsedAchievementData[] {
  // Plan §9.3: accept both FQN and i-address forms.
  const entries = (contentMap[VDXF_KEYS.primordialTrialFqn] ?? contentMap[VDXF_KEYS.primordialTrial]) as
    | DataDescriptorWrapper[]
    | undefined;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const achievements: ParsedAchievementData[] = [];

  for (const wrapper of entries) {
    const descriptor = wrapper[VDXF_KEYS.dataDescriptor];
    if (!descriptor || isDeleted(descriptor)) continue;

    const value = extractStringValue(descriptor);
    if (!value) continue;

    try {
      const parsed = JSON.parse(value);
      achievements.push(parsed as ParsedAchievementData);
    } catch {
      // Invalid JSON, skip
    }
  }

  return achievements;
}

/**
 * Find achievements for a specific character
 *
 * @param contentMap - The ContentMultiMap from identity query
 * @param characterRollBlockHeight - The character's unique identifier
 * @returns Achievements for that character
 */
export function findAchievementsByCharacter(
  contentMap: Record<string, unknown>,
  characterRollBlockHeight: number
): ParsedAchievementData[] {
  const achievements = parseAllAchievements(contentMap);
  return achievements.filter(a => a.characterRollBlockHeight === characterRollBlockHeight);
}
