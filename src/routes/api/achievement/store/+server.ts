/**
 * POST /api/achievement/store
 *
 * Creates a storage request for storing achievement proof on-chain.
 * Returns QR string and deeplink for wallet integration.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AchievementProofData } from '$lib/vdxf';
import {
	createAchievementStorageRequest,
	isStorageConfigured,
} from '$lib/server/identityUpdate';

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
		const { achievement, identity } = body as {
			achievement: AchievementProofData;
			identity: string;
		};

		if (!achievement) {
			return json({ error: 'achievement is required' }, { status: 400 });
		}

		if (!identity) {
			return json({ error: 'identity is required' }, { status: 400 });
		}

		// Validate achievement data
		if (!achievement.characterName) {
			return json({ error: 'achievement.characterName is required' }, { status: 400 });
		}
		if (!achievement.characterRollBlockHeight) {
			return json({ error: 'achievement.characterRollBlockHeight is required' }, { status: 400 });
		}
		if (!achievement.bossSceneSeed) {
			return json({ error: 'achievement.bossSceneSeed is required' }, { status: 400 });
		}
		if (!achievement.bossSceneBlockHeight) {
			return json({ error: 'achievement.bossSceneBlockHeight is required' }, { status: 400 });
		}

		// Wallet TYPE_REDIRECT destination. identityUpdate.ts will append requestId.
		const callbackUrl = `${url.origin}/api/storage/callback?type=achievement`;

		// Create the storage request
		const result = await createAchievementStorageRequest(achievement, identity, callbackUrl);

		return json({
			requestId: result.requestId,
			qrString: result.qrString,
			deeplinkUri: result.deeplinkUri,
		});
	} catch (error) {
		console.error('Error creating achievement storage request:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to create storage request' },
			{ status: 500 }
		);
	}
};
