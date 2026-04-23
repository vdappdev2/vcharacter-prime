/**
 * POST /api/commitment/request
 *
 * Creates a signed GenericRequest (AuthenticationRequest) with the commitment
 * hash embedded in the response URI. Returns deeplink URL and session info.
 *
 * STATELESS: the commitment hash and challengeId are signed into the response
 * URI. Verification reconstructs them from the wallet's signed GenericResponse.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  createCommitmentRequest,
  isCommitmentConfigured,
} from '$lib/server/genericAuth';

export const POST: RequestHandler = async ({ request, url }) => {
  // Check if commitment flow is configured
  if (!isCommitmentConfigured()) {
    return json(
      {
        error: 'Commitment service not configured. Set SERVICE_IDENTITY_WIF and SERVICE_IDENTITY_IADDRESS.',
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { clientSeedHash } = body;

    if (!clientSeedHash || typeof clientSeedHash !== 'string') {
      return json(
        { error: 'clientSeedHash is required' },
        { status: 400 }
      );
    }

    // Validate hash format (64 hex characters for SHA-256)
    if (!/^[a-f0-9]{64}$/i.test(clientSeedHash)) {
      return json(
        { error: 'clientSeedHash must be a 64-character hex string (SHA-256)' },
        { status: 400 }
      );
    }

    // Wallet TYPE_REDIRECT destination. createCommitmentRequest will append
    // `commitment` and `challengeId` as signed query params.
    const callbackUrl = `${url.origin}/api/commitment/callback`;

    // Create the commitment request
    const result = await createCommitmentRequest(clientSeedHash, callbackUrl);

    return json({
      qrString: result.qrString,
      deeplinkUri: result.deeplinkUri,
      sessionId: result.sessionId,
      challengeId: result.challengeId,
    });
  } catch (error) {
    console.error('Error creating commitment request:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Failed to create commitment request' },
      { status: 500 }
    );
  }
};
