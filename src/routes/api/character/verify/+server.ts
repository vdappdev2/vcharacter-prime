/**
 * GET /api/character/verify
 *
 * Public verification endpoint for checking if a character
 * stored on an identity is provably fair.
 *
 * This endpoint:
 * 1. Queries the identity's contentmultimap
 * 2. Extracts character data from the characterProof key
 * 3. Re-derives the character using the stored seeds
 * 4. Compares to verify provably fair creation
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIdentityContent, getBlockByHeight } from '$lib/server/verus';
import { rollCharacter } from '$lib/dice';
import { parseAllCharacters, findCharacterByRollBlockHeight } from '$lib/vdxf';
import { sha256String } from '$lib/crypto';
import { VDXF_KEYS } from '$lib/config';

export const GET: RequestHandler = async ({ url }) => {
  const identity = url.searchParams.get('identity');
  const rollBlockHeightParam = url.searchParams.get('rollBlockHeight');

  if (!identity) {
    return json({ error: 'identity is required' }, { status: 400 });
  }

  try {
    // Get the identity content filtered by our VDXF key
    // This is more reliable than getidentity as it works even if the identity has been updated since
    const characterProofKey = VDXF_KEYS.characterProof;
    const identityContent = await getIdentityContent(
      identity,
      0,           // heightStart
      0,           // heightEnd (0 = max)
      false,       // txProofs
      0,           // txProofHeight
      characterProofKey  // filter by vcharacter.prime key
    );

    if (!identityContent) {
      return json(
        { error: 'Identity not found', valid: false },
        { status: 404 }
      );
    }

    // Check if the identity has character content
    const contentMultiMap = identityContent.identity?.contentmultimap;

    if (!contentMultiMap || !contentMultiMap[characterProofKey]) {
      return json({
        valid: false,
        error: 'No character proof found on this identity',
      });
    }

    // Parse all characters from contentmultimap
    const allCharacters = parseAllCharacters(contentMultiMap as Record<string, unknown>);

    if (allCharacters.length === 0) {
      return json({
        valid: false,
        error: 'Failed to parse character data from identity',
      });
    }

    // Handle multi-character selection
    let characterData;
    if (rollBlockHeightParam) {
      // Find specific character by rollBlockHeight
      const targetHeight = parseInt(rollBlockHeightParam, 10);
      characterData = findCharacterByRollBlockHeight(contentMultiMap as Record<string, unknown>, targetHeight);
      if (!characterData) {
        return json({
          valid: false,
          error: `No character found with rollBlockHeight ${targetHeight}`,
        });
      }
    } else if (allCharacters.length === 1) {
      // Only one character, use it
      characterData = allCharacters[0];
    } else {
      // Multiple characters, require rollBlockHeight parameter
      return json({
        valid: false,
        error: 'Multiple characters found. Please specify rollBlockHeight parameter.',
        characters: allCharacters.map(c => ({
          name: c.name,
          rollBlockHeight: c.proof?.rollBlockHeight,
        })),
      });
    }

    // Extract fields from parsed character data
    const { name, stats, traits, proof } = characterData;

    // Validate required proof fields
    if (!proof?.clientSeed || !proof?.rollBlockHeight || !proof?.rollBlockHash) {
      return json({
        valid: false,
        error: 'Incomplete character verification data',
      });
    }

    const { clientSeed, clientSeedHash, rollBlockHeight, rollBlockHash, commitmentBlockHeight } = proof;

    // Verification step 1: Verify client seed hash matches
    let seedHashValid = false;
    if (clientSeedHash) {
      const computedHash = await sha256String(clientSeed);
      seedHashValid = computedHash === clientSeedHash;
    }

    // Verification step 2: Verify block hash matches blockchain
    let blockHashValid = false;
    try {
      const blockData = await getBlockByHeight(rollBlockHeight);
      blockHashValid = blockData.hash === rollBlockHash;
    } catch (err) {
      console.error('Error fetching block for verification:', err);
    }

    // Verification step 3: Re-derive character and compare
    let statsValid = false;
    let traitsValid = false;

    if (blockHashValid) {
      try {
        const derivedCharacter = await rollCharacter(rollBlockHash, clientSeed);

        // Compare stats (stored with full names: strength, dexterity, etc.)
        if (stats) {
          const storedStats = stats as Record<string, { total: number }>;
          statsValid =
            derivedCharacter.stats.str.total === storedStats.strength?.total &&
            derivedCharacter.stats.dex.total === storedStats.dexterity?.total &&
            derivedCharacter.stats.con.total === storedStats.constitution?.total &&
            derivedCharacter.stats.int.total === storedStats.intelligence?.total &&
            derivedCharacter.stats.wis.total === storedStats.wisdom?.total &&
            derivedCharacter.stats.cha.total === storedStats.charisma?.total;
        }

        // Compare traits (stored with 'spirit' not 'spiritAnimal')
        if (traits) {
          const storedTraits = traits as Record<string, string>;
          traitsValid =
            derivedCharacter.traits.element === storedTraits.element &&
            derivedCharacter.traits.spiritAnimal === storedTraits.spirit &&
            derivedCharacter.traits.sex === storedTraits.sex;
        }
      } catch (err) {
        console.error('Error re-deriving character:', err);
      }
    }

    // All checks must pass
    const allValid = seedHashValid && blockHashValid && statsValid && traitsValid;

    return json({
      valid: allValid,
      character: {
        name: name || 'Unknown',
        identity: identity,
        identityAddress: identityContent.identity?.identityaddress,
        stats,
        traits,
        verification: {
          clientSeed,
          clientSeedHash,
          rollBlockHeight,
          rollBlockHash,
          commitmentBlockHeight,
        },
      },
      verification: {
        seedHashValid,
        blockHashValid,
        statsValid,
        traitsValid,
        allValid,
      },
    });
  } catch (error) {
    console.error('Error verifying character:', error);
    return json(
      {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to verify character',
      },
      { status: 500 }
    );
  }
};
