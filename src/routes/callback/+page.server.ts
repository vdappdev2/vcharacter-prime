/**
 * Callback Page Server Handler
 *
 * Receives wallet response via URL parameters and stores in KV.
 * The client page just shows a success message.
 */

import type { PageServerLoad } from './$types';
import { storeCommitmentResponse, isKvConfigured } from '$lib/server/kv';

export const load: PageServerLoad = async ({ url }) => {
	if (!isKvConfigured()) {
		return { success: false, error: 'Storage not configured' };
	}

	try {
		const params = url.searchParams;

		// Extract challengeId from the commitment parameter
		const commitment = params.get('commitment');
		if (!commitment) {
			return { success: false, error: 'No commitment parameter found' };
		}

		// Find the response data (base64 encoded)
		let responseData: string | null = null;

		for (const [key, value] of params) {
			if (key === 'commitment') continue;

			if (value && value.length > 50) {
				responseData = value;
				break;
			} else if (key.startsWith('i') && key.length > 30) {
				responseData = value || key;
				break;
			}
		}

		if (!responseData) {
			return { success: false, error: 'No response data found' };
		}

		// The commitment hash is our key for storage
		// Store the response so the polling client can retrieve it
		await storeCommitmentResponse(commitment, responseData);

		return { success: true };
	} catch (err) {
		console.error('Callback error:', err);
		return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
	}
};
