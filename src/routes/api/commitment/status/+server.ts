/**
 * GET /api/commitment/status
 *
 * Non-consuming existence check for a pending commitment envelope.
 * Returns `received` once the wallet callback has stored an envelope keyed by
 * this seedHash, `pending` otherwise. The client then calls verify-stateless,
 * which is the endpoint that actually reads and consumes the envelope.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasCommitmentResponse, isKvConfigured } from '$lib/server/kv';

export const GET: RequestHandler = async ({ url }) => {
	if (!isKvConfigured()) {
		return json({ error: 'Storage not configured' }, { status: 503 });
	}

	const seedHash = url.searchParams.get('seedHash');
	if (!seedHash) {
		return json({ error: 'seedHash parameter required' }, { status: 400 });
	}

	try {
		const received = await hasCommitmentResponse(seedHash);
		return json({ status: received ? 'received' : 'pending' });
	} catch (error) {
		console.error('Error checking commitment status:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Status check failed' },
			{ status: 500 },
		);
	}
};
