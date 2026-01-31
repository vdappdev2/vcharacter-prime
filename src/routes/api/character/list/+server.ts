/**
 * GET /api/character/list
 *
 * Lists all characters stored on an identity.
 * Returns summary info for each character (name, traits, rollBlockHeight).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIdentityContent } from '$lib/server/verus';
import { parseAllCharacters } from '$lib/vdxf';
import { VDXF_KEYS } from '$lib/config';

export const GET: RequestHandler = async ({ url }) => {
  const identity = url.searchParams.get('identity');

  if (!identity) {
    return json({ error: 'identity is required' }, { status: 400 });
  }

  try {
    // Get the identity content filtered by our VDXF key
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
        { error: 'Identity not found' },
        { status: 404 }
      );
    }

    // Check if the identity has character content
    const contentMultiMap = identityContent.identity?.contentmultimap;

    if (!contentMultiMap || !contentMultiMap[characterProofKey]) {
      return json({
        identity: identity,
        identityAddress: identityContent.identity?.identityaddress,
        characters: [],
        error: 'No characters found on this identity',
      });
    }

    // Parse all characters from contentmultimap
    const allCharacters = parseAllCharacters(contentMultiMap as Record<string, unknown>);

    if (allCharacters.length === 0) {
      return json({
        identity: identity,
        identityAddress: identityContent.identity?.identityaddress,
        characters: [],
        error: 'No valid characters found on this identity',
      });
    }

    // Return summary for each character
    const characters = allCharacters.map(char => ({
      name: char.name || 'Unknown',
      rollBlockHeight: char.proof?.rollBlockHeight || 0,
      traits: {
        element: char.traits?.element || 'Unknown',
        spirit: char.traits?.spirit || 'Unknown',
        sex: char.traits?.sex || 'Unknown',
      },
    }));

    return json({
      identity: identity,
      identityAddress: identityContent.identity?.identityaddress,
      characters,
    });
  } catch (error) {
    console.error('Error listing characters:', error);
    return json(
      {
        error: error instanceof Error ? error.message : 'Failed to list characters',
      },
      { status: 500 }
    );
  }
};
