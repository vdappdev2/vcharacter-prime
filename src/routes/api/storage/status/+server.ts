/**
 * GET /api/storage/status
 *
 * Check if a wallet storage response is available.
 * Returns the txid if storage was confirmed.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumeStorageResponse, isKvConfigured } from '$lib/server/kv';
import {
	GenericRequest,
	IdentityUpdateResponseOrdinalVDXFObject,
	IdentityUpdateResponseDetails,
} from 'verus-typescript-primitives';

export const GET: RequestHandler = async ({ url }) => {
	if (!isKvConfigured()) {
		return json({ error: 'Storage not configured' }, { status: 503 });
	}

	const requestId = url.searchParams.get('requestId');
	if (!requestId) {
		return json({ error: 'requestId parameter required' }, { status: 400 });
	}

	try {
		const responseData = await consumeStorageResponse(requestId);

		if (!responseData) {
			return json({ status: 'pending' });
		}

		// Parse the response (GenericRequest envelope containing IdentityUpdateResponseOrdinalVDXFObject)
		let response: GenericRequest;
		try {
			if (responseData.startsWith('verusid://') || responseData.includes('://')) {
				response = GenericRequest.fromWalletDeeplinkUri(responseData);
			} else {
				response = GenericRequest.fromQrString(responseData);
			}
		} catch {
			return json({ error: 'Invalid response data format' }, { status: 400 });
		}

		// Extract IdentityUpdateResponseDetails from the first detail
		const detail = response.details[0];
		if (!(detail instanceof IdentityUpdateResponseOrdinalVDXFObject)) {
			return json({ error: 'Response does not contain identity update response' }, { status: 400 });
		}

		const responseDetails = detail.data as IdentityUpdateResponseDetails;
		const txidBuffer = responseDetails.txid;
		if (!txidBuffer) {
			return json({ error: 'No txid in response' }, { status: 400 });
		}

		// txid is stored in natural order, reverse for display
		const txid = txidBuffer.reverse().toString('hex');

		return json({
			status: 'stored',
			txid,
		});
	} catch (error) {
		console.error('Error checking storage status:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Status check failed' },
			{ status: 500 }
		);
	}
};
