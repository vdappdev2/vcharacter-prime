/**
 * GET /api/storage/status
 *
 * Poll for the on-chain storage result. Returns `stored` with the txid once
 * the wallet callback has delivered a signed identityupdate response.
 *
 * The response parsing happens in /api/storage/callback; this endpoint just
 * drains the Redis entry.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumeStorageResult, isKvConfigured } from '$lib/server/kv';

export const GET: RequestHandler = async ({ url }) => {
	if (!isKvConfigured()) {
		return json({ error: 'Storage not configured' }, { status: 503 });
	}

	const requestId = url.searchParams.get('requestId');
	if (!requestId) {
		return json({ error: 'requestId parameter required' }, { status: 400 });
	}

	try {
		const result = await consumeStorageResult(requestId);
		if (result) {
			// `verified === true`: chain (incl. mempool) confirms the wallet's txid.
			// `verified === false`: daemon hadn't seen it yet — UI shows "still waiting."
			return json({ status: 'received', txid: result.txid, verified: result.verified });
		}
		return json({ status: 'pending' });
	} catch (error) {
		console.error('[storage/status] error', {
			error: error instanceof Error ? error.message : String(error),
		});
		return json(
			{ error: error instanceof Error ? error.message : 'Status check failed' },
			{ status: 500 },
		);
	}
};
