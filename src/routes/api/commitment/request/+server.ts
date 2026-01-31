/**
 * POST /api/commitment/request
 *
 * Creates a signed LoginConsentRequest with commitment hash embedded in callback URL.
 * Returns deeplink URL and session info for tracking.
 *
 * STATELESS: The callback URL points to a client page (/callback), not an API.
 * The client will later submit the signed response for stateless verification.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  createCommitmentRequest,
  isCommitmentConfigured,
} from '$lib/server/loginConsent';

export const POST: RequestHandler = async ({ request, url }) => {
  // Check if commitment flow is configured
  if (!isCommitmentConfigured()) {
    return json(
      {
        error: 'Commitment service not configured. Set SERVICE_IDENTITY_WIF environment variable.',
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

    // Build callback URL - points to CLIENT page, not API
    // The commitment hash is embedded in the URL for stateless verification
    const callbackUrl = `${url.origin}/callback`;

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
