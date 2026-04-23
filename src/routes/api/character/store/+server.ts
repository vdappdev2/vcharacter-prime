/**
 * POST /api/character/store
 *
 * Creates a storage request for storing character proof on-chain.
 * Returns QR string and deeplink for wallet integration.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  createCharacterStorageRequest,
  isStorageConfigured,
} from '$lib/server/identityUpdate';
import { buildCharacterContentMap } from '$lib/vdxf';
import { getIdentity } from '$lib/server/verus';
import type { StoredCharacter } from '$lib/types';

export const POST: RequestHandler = async ({ request, url }) => {
  // Check if storage is configured
  if (!isStorageConfigured()) {
    return json(
      {
        error: 'Storage service not configured.',
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { character } = body as { character: StoredCharacter };

    if (!character) {
      return json({ error: 'character is required' }, { status: 400 });
    }

    // Validate character data
    if (!character.userIdentity) {
      return json({ error: 'character.userIdentity is required' }, { status: 400 });
    }
    if (!character.verification?.client_seed) {
      return json({ error: 'character.verification.client_seed is required' }, { status: 400 });
    }
    if (!character.commitment?.clientSeedHash) {
      return json({ error: 'character.commitment.clientSeedHash is required' }, { status: 400 });
    }
    if (!character.rollBlockHeight || !character.rollBlockHash) {
      return json({ error: 'character roll block data is required' }, { status: 400 });
    }

    // Wallet TYPE_REDIRECT destination. identityUpdate.ts will append requestId.
    const callbackUrl = `${url.origin}/api/storage/callback?type=character`;

    // Create the storage request
    const result = await createCharacterStorageRequest(character, callbackUrl);

    // Debug: Log deeplink info
    console.log('=== Storage Request Debug ===');
    console.log('Deeplink length:', result.deeplinkUri.length);
    console.log('QR string length:', result.qrString.length);

    // Debug: Output complete updateidentity command for manual testing
    // Fetch identity to get proper name and parent (like vtimestamp does)
    const identityInfo = await getIdentity(character.userIdentity);
    const contentmultimap = buildCharacterContentMap(character);
    const updateIdentityCmd = {
      name: identityInfo.identity.name,
      parent: identityInfo.identity.parent,
      contentmultimap,
    };
    console.log('\n=== MANUAL UPDATEIDENTITY COMMAND ===');
    console.log('Copy and paste this command to manually store the character:\n');
    console.log(`./verus -chain=vrsctest updateidentity '${JSON.stringify(updateIdentityCmd)}'`);
    console.log('\n=== END COMMAND ===\n');

    return json({
      requestId: result.requestId,
      qrString: result.qrString,
      deeplinkUri: result.deeplinkUri,
    });
  } catch (error) {
    console.error('Error creating storage request:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Failed to create storage request' },
      { status: 500 }
    );
  }
};
