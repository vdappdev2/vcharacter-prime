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
    // Daemon RPC filter uses the vdxfid (i-address form). The daemon normalizes
    // internally; FQN is not accepted as a filter arg.
    const primeInauguralKey = VDXF_KEYS.primeInaugural;
    const identityContent = await getIdentityContent(
      identity,
      0,           // heightStart
      0,           // heightEnd (0 = max)
      false,       // txProofs
      0,           // txProofHeight
      primeInauguralKey  // filter by prime.inaugural key
    );

    if (!identityContent) {
      return json(
        { error: 'Identity not found' },
        { status: 404 }
      );
    }

    // Plan §9.3: accept both FQN and i-address outer keys — daemon normalization
    // on storage is undocumented.
    const contentMultiMap = identityContent.identity?.contentmultimap;
    const hasEntries = contentMultiMap &&
      (contentMultiMap[VDXF_KEYS.primeInauguralFqn] || contentMultiMap[VDXF_KEYS.primeInaugural]);

    if (!hasEntries) {
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
