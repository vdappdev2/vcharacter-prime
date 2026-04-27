import { describe, it, expect } from 'vitest';
import {
  buildCharacterContentMap,
  parseAllCharacters,
  parseCharacterContentMap,
  type ContentMultiMap,
} from './vdxf';
import { VDXF_KEYS } from './config';
import type { StoredCharacter, StatRoll } from './types';

function statRoll(dice: [number, number, number, number]): StatRoll {
  const total = dice.reduce((a, b) => a + b, 0);
  return { dice, total, modifier: Math.floor((total - 13) / 2) };
}

function makeCharacter(overrides: Partial<StoredCharacter> = {}): StoredCharacter {
  const base: StoredCharacter = {
    name: 'Aldric',
    stats: {
      str: statRoll([5, 2, 4, 2]),
      dex: statRoll([3, 6, 1, 2]),
      con: statRoll([6, 2, 6, 5]),
      int: statRoll([4, 1, 6, 3]),
      wis: statRoll([3, 4, 4, 5]),
      cha: statRoll([4, 6, 1, 5]),
    },
    traits: {
      element: 'Earth',
      spiritAnimal: 'Spider',
      sex: 'Female',
    },
    verification: {
      block_height: 100,
      block_hash: '0'.repeat(64),
      client_seed: '1'.repeat(64),
      timestamp: 1700000000,
    },
    userIdentity: 'i6V4or9qptD5JzxkqgUKz45tvtBNMb72N3',
    userFriendlyName: 'tester@',
    commitment: {
      response: 'fake-base64-response',
      signedBlockHeight: 99,
      clientSeedHash:
        '3138bb9bc78df27c473ecfd1410f7bd45ebac1f59cf3ff9cfe4db77aab7aedd3',
    },
    rollBlockHeight: 100,
    rollBlockHash: '0'.repeat(64),
  };
  return { ...base, ...overrides };
}

function stringToHex(s: string): string {
  return Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('buildCharacterContentMap → parseAllCharacters round-trip', () => {
  it('survives a single-character round-trip', () => {
    const character = makeCharacter();
    const contentMap = buildCharacterContentMap(character);
    const parsed = parseAllCharacters(contentMap as Record<string, unknown>);

    expect(parsed).toHaveLength(1);
    const c = parsed[0];
    expect(c.name).toBe('Aldric');
    expect(c.stats?.strength).toEqual(character.stats.str);
    expect(c.stats?.dexterity).toEqual(character.stats.dex);
    expect(c.stats?.constitution).toEqual(character.stats.con);
    expect(c.stats?.intelligence).toEqual(character.stats.int);
    expect(c.stats?.wisdom).toEqual(character.stats.wis);
    expect(c.stats?.charisma).toEqual(character.stats.cha);
    expect(c.traits?.element).toBe('Earth');
    expect(c.traits?.spirit).toBe('Spider');
    expect(c.traits?.sex).toBe('Female');
    expect(c.proof?.clientSeed).toBe(character.verification.client_seed);
    expect(c.proof?.clientSeedHash).toBe(character.commitment.clientSeedHash);
    expect(c.proof?.rollBlockHeight).toBe(character.rollBlockHeight);
    expect(c.proof?.rollBlockHash).toBe(character.rollBlockHash);
    expect(c.proof?.commitmentBlockHeight).toBe(character.commitment.signedBlockHeight);
  });

  it('survives a multi-character round-trip', () => {
    const c1 = makeCharacter({ name: 'Aldric', rollBlockHeight: 100 });
    const c2 = makeCharacter({ name: 'Brynn', rollBlockHeight: 200 });
    const c3 = makeCharacter({ name: 'Cael', rollBlockHeight: 300 });

    const m1 = buildCharacterContentMap(c1);
    const m2 = buildCharacterContentMap(c2);
    const m3 = buildCharacterContentMap(c3);

    const merged: ContentMultiMap = {
      [VDXF_KEYS.primeInauguralFqn]: [
        ...m1[VDXF_KEYS.primeInauguralFqn],
        ...m2[VDXF_KEYS.primeInauguralFqn],
        ...m3[VDXF_KEYS.primeInauguralFqn],
      ],
    };

    const parsed = parseAllCharacters(merged as Record<string, unknown>);
    expect(parsed.map((c) => c.name)).toEqual(['Aldric', 'Brynn', 'Cael']);
    expect(parsed.map((c) => c.proof?.rollBlockHeight)).toEqual([100, 200, 300]);
  });
});

describe('parseAllCharacters', () => {
  it('decodes hex-encoded objectdata (daemon return format)', () => {
    // The daemon returns application/json objectdata as a hex string rather
    // than {message: string}. The parser must handle both.
    const stats = { strength: statRoll([3, 3, 3, 3]) };
    const traits = { element: 'Fire', spirit: 'Wolf', sex: 'Male' };
    const proof = {
      clientSeed: '1'.repeat(64),
      clientSeedHash: 'a'.repeat(64),
      rollBlockHeight: 42,
      rollBlockHash: '0'.repeat(64),
      commitmentBlockHeight: 41,
    };

    const contentMap: Record<string, unknown> = {
      [VDXF_KEYS.primeInauguralFqn]: [
        {
          [VDXF_KEYS.dataDescriptor]: {
            version: 1,
            label: VDXF_KEYS.labels.name,
            mimetype: 'text/plain',
            objectdata: stringToHex('Daemon-Returned'),
          },
        },
        {
          [VDXF_KEYS.dataDescriptor]: {
            version: 1,
            label: VDXF_KEYS.labels.stats,
            mimetype: 'application/json',
            objectdata: stringToHex(JSON.stringify(stats)),
          },
        },
        {
          [VDXF_KEYS.dataDescriptor]: {
            version: 1,
            label: VDXF_KEYS.labels.traits,
            mimetype: 'application/json',
            objectdata: stringToHex(JSON.stringify(traits)),
          },
        },
        {
          [VDXF_KEYS.dataDescriptor]: {
            version: 1,
            label: VDXF_KEYS.labels.proof,
            mimetype: 'application/json',
            objectdata: stringToHex(JSON.stringify(proof)),
          },
        },
      ],
    };

    const parsed = parseAllCharacters(contentMap);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Daemon-Returned');
    expect(parsed[0].stats?.strength).toEqual(stats.strength);
    expect(parsed[0].traits).toEqual(traits);
    expect(parsed[0].proof).toEqual(proof);
  });

  it('skips deletion markers (null objectdata and flags:32)', () => {
    const character = makeCharacter();
    const live = buildCharacterContentMap(character);

    const withDeletions: Record<string, unknown> = {
      [VDXF_KEYS.primeInauguralFqn]: [
        {
          [VDXF_KEYS.dataDescriptor]: {
            version: 1,
            label: VDXF_KEYS.labels.name,
            mimetype: 'text/plain',
            objectdata: null,
          },
        },
        {
          [VDXF_KEYS.dataDescriptor]: {
            version: 1,
            label: VDXF_KEYS.labels.proof,
            mimetype: 'application/json',
            objectdata: { message: '{}' },
            flags: 32,
          },
        },
        ...live[VDXF_KEYS.primeInauguralFqn],
      ],
    };

    const parsed = parseAllCharacters(withDeletions);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe(character.name);
  });

  it('returns [] for an empty or missing outer key', () => {
    expect(parseAllCharacters({})).toEqual([]);
    expect(parseAllCharacters({ [VDXF_KEYS.primeInauguralFqn]: [] })).toEqual([]);
  });
});

describe('parseCharacterContentMap (single-character path)', () => {
  it('matches the first entry from parseAllCharacters', () => {
    const character = makeCharacter();
    const contentMap = buildCharacterContentMap(character);
    const single = parseCharacterContentMap(contentMap as Record<string, unknown>);
    expect(single?.name).toBe(character.name);
    expect(single?.proof?.rollBlockHeight).toBe(character.rollBlockHeight);
  });
});
