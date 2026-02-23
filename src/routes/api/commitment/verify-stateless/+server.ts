/**
 * POST /api/commitment/verify-stateless
 *
 * Stateless verification of wallet commitment response.
 * Takes the signed response and clientSeed, verifies everything,
 * and derives the character - all without server-side state.
 *
 * This enables deployment on serverless platforms like Vercel.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LoginConsentResponse } from 'verus-typescript-primitives';
import { createHash } from 'crypto';
import { COMMITMENT_CONFIG } from '$lib/config';
import { getIdentity, getBlockCount, getBlockByHeight, withVerusIdFallback, CHAIN_IADDRESS } from '$lib/server/verus';
import { rollCharacter } from '$lib/dice';

function sha256(data: string): string {
	return createHash('sha256').update(data).digest('hex');
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { responseData, clientSeed, characterName } = body as {
			responseData: string;
			clientSeed: string;
			characterName?: string;
		};

		if (!responseData) {
			return json({ error: 'responseData is required' }, { status: 400 });
		}

		if (!clientSeed) {
			return json({ error: 'clientSeed is required' }, { status: 400 });
		}

		// Parse the signed response
		let response: LoginConsentResponse;
		try {
			const buffer = Buffer.from(responseData, 'base64');
			response = new LoginConsentResponse();
			response.fromBuffer(buffer);
		} catch (err) {
			return json({ error: 'Invalid response data format' }, { status: 400 });
		}

		// Extract the seedHash from the signed challenge's callback URL
		const redirectUris = response.decision?.request?.challenge?.redirect_uris;
		let committedSeedHash: string | null = null;

		if (redirectUris && redirectUris.length > 0) {
			const redirectUri = redirectUris[0];
			const uri = redirectUri?.uri || redirectUri;
			if (typeof uri === 'string' && uri.includes('commitment=')) {
				const urlParams = new URLSearchParams(uri.split('?')[1] || '');
				committedSeedHash = urlParams.get('commitment');
			}
		}

		if (!committedSeedHash) {
			return json({ error: 'No commitment hash found in signed challenge' }, { status: 400 });
		}

		// Verify the clientSeed matches the committed hash
		const computedHash = sha256(clientSeed);
		if (computedHash !== committedSeedHash) {
			return json({ error: 'Client seed does not match committed hash' }, { status: 400 });
		}

		// Extract signing identity and block height
		const signingId = response.signing_id || '';
		const signature = response.signature?.signature || '';

		if (!signingId || !signature) {
			return json({ error: 'Missing signing identity or signature' }, { status: 400 });
		}

		// Verify signature and get signature info in a single fallback-protected call.
		// Passing chainIAddr avoids a redundant getChainId() RPC inside the library.
		const { isValid, commitmentBlockHeight } = await withVerusIdFallback(async (verusId) => {
			const sigInfo = await verusId.getSignatureInfo(signingId, signature, CHAIN_IADDRESS);
			const valid = await verusId.verifyLoginConsentResponse(response, undefined, CHAIN_IADDRESS);
			return { isValid: valid, commitmentBlockHeight: sigInfo.height };
		});

		if (!isValid) {
			return json({ error: 'Invalid signature' }, { status: 400 });
		}
		const rollBlockHeight = commitmentBlockHeight + COMMITMENT_CONFIG.rollBlockDelay;

		// Check if roll block is available
		const currentHeight = await getBlockCount();
		if (currentHeight < rollBlockHeight) {
			return json({
				status: 'waiting_block',
				currentHeight,
				rollBlockHeight,
				blocksToWait: rollBlockHeight - currentHeight,
				commitmentBlockHeight,
				userIdentity: signingId,
			});
		}

		// Get the roll block hash
		const rollBlock = await getBlockByHeight(rollBlockHeight);
		const rollBlockHash = rollBlock.hash;

		// Look up friendly name
		let userFriendlyName = signingId;
		try {
			const identityInfo = await getIdentity(signingId);
			userFriendlyName = identityInfo.friendlyname;
		} catch (err) {
			console.error('Failed to look up identity friendly name:', err);
		}

		// Derive the character stats and traits
		const diceResult = await rollCharacter(rollBlockHash, clientSeed);

		// Build the complete stored character
		const storedCharacter = {
			name: characterName || 'Unnamed Hero',
			stats: diceResult.stats,
			traits: diceResult.traits,
			verification: {
				block_height: rollBlockHeight,
				block_hash: rollBlockHash,
				client_seed: clientSeed,
				timestamp: Date.now(),
			},
			userIdentity: signingId,
			userFriendlyName,
			commitment: {
				challenge: JSON.stringify(response.decision?.request?.challenge?.toJson?.() || response.decision?.request?.challenge),
				response: responseData,
				signedBlockHeight: commitmentBlockHeight,
				clientSeedHash: committedSeedHash,
			},
			rollBlockHeight,
			rollBlockHash,
		};

		return json({
			status: 'complete',
			character: storedCharacter,
			verification: {
				commitmentBlockHeight,
				rollBlockHeight,
				rollBlockHash,
				userIdentity: signingId,
				userFriendlyName,
			},
		});
	} catch (error) {
		console.error('Error in stateless verification:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Verification failed' },
			{ status: 500 }
		);
	}
};
