/**
 * POST /api/commitment/verify-stateless
 *
 * Stateless verification of a wallet-signed GenericResponse (AuthenticationRequest
 * flow). Takes only the revealed clientSeed + optional characterName; pulls the
 * signed envelope out of Redis itself (keyed by SHA256(clientSeed)), verifies,
 * extracts the signing block height, and derives the character.
 *
 * Security note: the server ignores any responseData the client sends. We ONLY
 * trust the envelope that arrived at /api/commitment/callback with the matching
 * seedHash in its signed ResponseURI. That callback stored it to Redis under
 * that exact seedHash — so the lookup by SHA256(clientSeed) binds the revealed
 * seed to the signed envelope without needing to reconstruct request bytes.
 *
 * Redis is consumed only on success. `waiting_block` retries keep the envelope.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	GenericResponse,
	AuthenticationResponseOrdinalVDXFObject,
} from 'verus-typescript-primitives';
import { createHash } from 'crypto';
import { COMMITMENT_CONFIG } from '$lib/config';
import {
	getIdentity,
	getBlockCount,
	getBlockByHeight,
	withVerusIdFallback,
	CHAIN_IADDRESS,
} from '$lib/server/verus';
import {
	peekCommitmentResponse,
	consumeCommitmentResponse,
	isKvConfigured,
} from '$lib/server/kv';
import { sanitizeCharacterName } from '$lib/server/sanitize';
import { rollCharacter } from '$lib/dice';

function sha256(data: string): string {
	return createHash('sha256').update(data).digest('hex');
}

export const POST: RequestHandler = async ({ request }) => {
	if (!isKvConfigured()) {
		return json({ error: 'Storage not configured' }, { status: 503 });
	}

	try {
		const body = await request.json();
		const { clientSeed, characterName } = body as {
			clientSeed: string;
			characterName?: string;
		};

		if (!clientSeed) {
			return json({ error: 'clientSeed is required' }, { status: 400 });
		}

		const nameResult = sanitizeCharacterName(characterName);
		if (!nameResult.ok) {
			return json({ error: nameResult.error }, { status: 400 });
		}

		// Derive seedHash — this is the Redis key. Callback endpoint writes under
		// exactly this key because the seedHash is baked into the signed ResponseURI.
		const seedHash = sha256(clientSeed);

		const responseData = await peekCommitmentResponse(seedHash);
		if (!responseData) {
			return json(
				{ error: 'No commitment response found — wait for the wallet to sign, or restart the flow.' },
				{ status: 404 },
			);
		}

		// Decode the signed GenericResponse. Plan §9.4: no static helpers —
		// base64url → Buffer → fromBuffer.
		let response: GenericResponse;
		try {
			const buf = Buffer.from(responseData, 'base64url');
			response = new GenericResponse();
			response.fromBuffer(buf, 0);
		} catch (decodeErr) {
			console.error('[verify-stateless] envelope decode failed', {
				seedHashPrefix: seedHash.slice(0, 8),
				error: decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
			});
			// Bad envelope in Redis — treat as permanent failure and clean up.
			await consumeCommitmentResponse(seedHash);
			return json({ error: 'Invalid commitment response data' }, { status: 400 });
		}

		const detail = response.details[0];
		if (!(detail instanceof AuthenticationResponseOrdinalVDXFObject)) {
			console.error('[verify-stateless] envelope is not AuthenticationResponse', {
				seedHashPrefix: seedHash.slice(0, 8),
			});
			await consumeCommitmentResponse(seedHash);
			return json({ error: 'Response is not an AuthenticationResponse' }, { status: 400 });
		}

		if (!response.signature) {
			console.error('[verify-stateless] envelope missing signature', {
				seedHashPrefix: seedHash.slice(0, 8),
			});
			await consumeCommitmentResponse(seedHash);
			return json({ error: 'Response is missing signature' }, { status: 400 });
		}

		const signingId = response.signature.identityID?.toIAddress?.() || '';
		const signatureAsVch = response.signature.signatureAsVch;
		if (!signingId || !signatureAsVch) {
			console.error('[verify-stateless] signature incomplete', {
				seedHashPrefix: seedHash.slice(0, 8),
				hasSigningId: Boolean(signingId),
				hasSignatureAsVch: Boolean(signatureAsVch),
			});
			await consumeCommitmentResponse(seedHash);
			return json({ error: 'Response signature incomplete' }, { status: 400 });
		}

		// Verify envelope + extract the block height embedded in the pbaas identity
		// signature, in one fallback-protected RPC round-trip.
		const base64Sig = Buffer.from(signatureAsVch as unknown as Uint8Array).toString('base64');
		const { isValid, commitmentBlockHeight } = await withVerusIdFallback(async (verusId) => {
			const valid = await verusId.verifyGenericResponse(response);
			const sigInfo = await verusId.getSignatureInfo(signingId, base64Sig, CHAIN_IADDRESS);
			return { isValid: valid, commitmentBlockHeight: sigInfo.height };
		});

		if (!isValid) {
			console.error('[verify-stateless] signature verification failed', {
				seedHashPrefix: seedHash.slice(0, 8),
				signingId,
				commitmentBlockHeight,
			});
			await consumeCommitmentResponse(seedHash);
			return json({ error: 'Invalid response signature' }, { status: 400 });
		}

		const rollBlockHeight = commitmentBlockHeight + COMMITMENT_CONFIG.rollBlockDelay;

		// Roll block not mined yet → keep the envelope in Redis, report status, let
		// the client poll back.
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

		const rollBlock = await getBlockByHeight(rollBlockHeight);
		const rollBlockHash = rollBlock.hash;

		let userFriendlyName = signingId;
		try {
			const identityInfo = await getIdentity(signingId);
			userFriendlyName = identityInfo.friendlyname;
		} catch (err) {
			console.warn('[verify-stateless] friendly name lookup failed (non-fatal)', {
				signingId,
				error: err instanceof Error ? err.message : String(err),
			});
		}

		const diceResult = await rollCharacter(rollBlockHash, clientSeed);

		const storedCharacter = {
			name: nameResult.value || 'Unnamed Hero',
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
				response: responseData, // base64url GenericResponse
				signedBlockHeight: commitmentBlockHeight,
				clientSeedHash: seedHash,
			},
			rollBlockHeight,
			rollBlockHash,
		};

		// Successful derivation — consume the Redis entry so the same commitment
		// can't be replayed for a second character.
		await consumeCommitmentResponse(seedHash);

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
		console.error('[verify-stateless] unexpected error', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return json(
			{ error: error instanceof Error ? error.message : 'Verification failed' },
			{ status: 500 },
		);
	}
};
