/**
 * GET /api/achievement/list
 *
 * Lists all achievements stored on an identity.
 * Returns summary info for each achievement.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIdentityContent } from '$lib/server/verus';
import { parseAllAchievements } from '$lib/vdxf';
import { VDXF_KEYS } from '$lib/config';

export const GET: RequestHandler = async ({ url }) => {
  const identity = url.searchParams.get('identity');

  if (!identity) {
    return json({ error: 'identity is required' }, { status: 400 });
  }

  try {
    // Daemon RPC filter uses the vdxfid (i-address form).
    const achievementKey = VDXF_KEYS.primordialTrial;
    const identityContent = await getIdentityContent(
      identity,
      0,           // heightStart
      0,           // heightEnd (0 = max)
      false,       // txProofs
      0,           // txProofHeight
      achievementKey  // filter by primordialTrial key
    );

    if (!identityContent) {
      return json(
        { error: 'Identity not found' },
        { status: 404 }
      );
    }

    // Plan §9.3: accept both FQN and i-address outer keys.
    const contentMultiMap = identityContent.identity?.contentmultimap;
    const hasEntries = contentMultiMap &&
      (contentMultiMap[VDXF_KEYS.primordialTrialFqn] || contentMultiMap[VDXF_KEYS.primordialTrial]);

    if (!hasEntries) {
      return json({
        identity: identity,
        identityAddress: identityContent.identity?.identityaddress,
        achievements: [],
      });
    }

    // Parse all achievements from contentmultimap
    const allAchievements = parseAllAchievements(contentMultiMap as Record<string, unknown>);

    // Return achievements
    return json({
      identity: identity,
      identityAddress: identityContent.identity?.identityaddress,
      achievements: allAchievements,
    });
  } catch (error) {
    console.error('[achievement/list] error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      {
        error: error instanceof Error ? error.message : 'Failed to list achievements',
      },
      { status: 500 }
    );
  }
};
