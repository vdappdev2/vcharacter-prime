/**
 * Storage Callback Page Server Handler
 *
 * Receives wallet storage response via URL parameters and stores in KV.
 */

import type { PageServerLoad } from './$types';
import { storeStorageResponse, isKvConfigured } from '$lib/server/kv';

export const load: PageServerLoad = async ({ url }) => {
	if (!isKvConfigured()) {
		return { success: false, error: 'Storage not configured' };
	}

	try {
		const params = url.searchParams;

		// Get the requestId for storage key
		const requestId = params.get('requestId');
		if (!requestId) {
			return { success: false, error: 'No requestId parameter found' };
		}

		// Find the response data (base64 encoded)
		let responseData: string | null = null;

		for (const [key, value] of params) {
			if (key === 'type' || key === 'requestId' || key === 'returnTo') continue;

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

		// Store the response so the polling client can retrieve it
		await storeStorageResponse(requestId, responseData);

		return { success: true };
	} catch (err) {
		console.error('Storage callback error:', err);
		return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
	}
};
