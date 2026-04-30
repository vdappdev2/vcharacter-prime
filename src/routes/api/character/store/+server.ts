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
import { sanitizeCharacterName } from '$lib/server/sanitize';
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

    // Re-sanitize the name at the storage boundary. verify-stateless already
    // validates on first submission, but the name can be edited client-side
    // between roll and store, so the on-chain write is the canonical gate.
    const nameResult = sanitizeCharacterName(character.name);
    if (!nameResult.ok) {
      return json({ error: nameResult.error }, { status: 400 });
    }
    character.name = nameResult.value || 'Unnamed Hero';

    // Wallet TYPE_REDIRECT destination. identityUpdate.ts will append requestId.
    const callbackUrl = `${url.origin}/api/storage/callback?type=character`;

    // Create the storage request
    const result = await createCharacterStorageRequest(character, callbackUrl);

    return json({
      requestId: result.requestId,
      qrString: result.qrString,
      deeplinkUri: result.deeplinkUri,
    });
  } catch (error) {
    console.error('[character/store] error creating storage request', {
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      { error: error instanceof Error ? error.message : 'Failed to create storage request' },
      { status: 500 }
    );
  }
};
