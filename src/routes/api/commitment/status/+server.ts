/**
 * GET /api/commitment/status
 *
 * Check if a wallet response is available for a commitment.
 * Returns the response data if available.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumeCommitmentResponse, isKvConfigured } from '$lib/server/kv';

export const GET: RequestHandler = async ({ url }) => {
	if (!isKvConfigured()) {
		return json({ error: 'Storage not configured' }, { status: 503 });
	}

	const seedHash = url.searchParams.get('seedHash');
	if (!seedHash) {
		return json({ error: 'seedHash parameter required' }, { status: 400 });
	}

	try {
		// The commitment hash is used as the key
		const responseData = await consumeCommitmentResponse(seedHash);

		if (responseData) {
			return json({
				status: 'received',
				responseData,
			});
		}

		return json({
			status: 'pending',
		});
	} catch (error) {
		console.error('Error checking commitment status:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Status check failed' },
			{ status: 500 }
		);
	}
};
