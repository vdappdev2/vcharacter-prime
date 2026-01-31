/**
 * Identity Update Module (Server-Side Only)
 *
 * Creates signed identity update requests for on-chain storage.
 * Stateless - no server-side storage required.
 */

import { VerusIdInterface } from 'verusid-ts-client';
import {
	IdentityUpdateRequest,
	IdentityUpdateRequestDetails,
	PartialIdentity,
	ResponseUri,
	IdentityID,
	VerusIDSignature,
	IDENTITY_AUTH_SIG_VDXF_KEY,
} from 'verus-typescript-primitives';
// @ts-ignore - no types available
import { BN } from 'bn.js';
import { randomBytes } from 'crypto';
// @ts-ignore - no types available
import bs58check from 'bs58check';
import { env } from '$env/dynamic/private';
import { VERUS_RPC, CHAIN_IDS, SERVICE_IDENTITY } from '../config';
import type { StoredCharacter } from '../types';
import { buildCharacterContentMap, buildAchievementContentMap, type AchievementProofData } from '../vdxf';
import { getIdentity } from './verus';

const SERVICE_IDENTITY_WIF = env.SERVICE_IDENTITY_WIF || '';

function getVerusIdInterface(): VerusIdInterface {
	const chainId = CHAIN_IDS[VERUS_RPC.chainId === 'vrsctest' ? 'testnet' : 'mainnet'];
	return new VerusIdInterface(chainId, VERUS_RPC.endpoint);
}

function generateRandomIAddress(): string {
	const hash = randomBytes(20);
	const payload = new Uint8Array(21);
	payload[0] = 102;
	payload.set(hash, 1);
	return bs58check.encode(payload) as string;
}

/**
 * Check if identity update is configured
 */
export function isStorageConfigured(): boolean {
	return !!SERVICE_IDENTITY_WIF && SERVICE_IDENTITY_WIF !== 'YOUR_WIF_HERE';
}

/**
 * Create a storage request for a character
 */
export async function createCharacterStorageRequest(
	character: StoredCharacter,
	callbackUrl: string
): Promise<{
	requestId: string;
	qrString: string;
	deeplinkUri: string;
}> {
	if (!isStorageConfigured()) {
		throw new Error('SERVICE_IDENTITY_WIF not configured');
	}

	const chainId = CHAIN_IDS[VERUS_RPC.chainId === 'vrsctest' ? 'testnet' : 'mainnet'];
	const isTestnet = VERUS_RPC.chainId === 'vrsctest';

	const requestId = generateRandomIAddress();
	const createdAt = new BN(Math.floor(Date.now() / 1000));

	// Build contentmultimap for the character proof
	const contentmultimap = buildCharacterContentMap(character);

	// Get the user's identity info
	const identityInfo = await getIdentity(character.userIdentity);
	const name = identityInfo.identity.name;
	const parent = identityInfo.identity.parent;

	const identity = PartialIdentity.fromJson({
		name,
		parent,
		contentmultimap,
	});

	// Include requestId in callback URL for matching
	const callbackWithRequestId = `${callbackUrl}&requestId=${requestId}`;

	const details = new IdentityUpdateRequestDetails({
		requestid: new BN(Date.now().toString()),
		createdat: createdAt,
		identity,
		systemid: IdentityID.fromAddress(chainId),
		responseuris: [
			ResponseUri.fromUriString(callbackWithRequestId, ResponseUri.TYPE_REDIRECT),
		],
	});

	if (isTestnet) {
		details.toggleIsTestnet();
	}

	const request = new IdentityUpdateRequest({
		details,
		systemid: IdentityID.fromAddress(chainId),
	});

	// Sign the request
	const verusId = getVerusIdInterface();
	const hashToSign = request.getDetailsHash(0);

	const signatureBase64 = await verusId.signHash(
		SERVICE_IDENTITY.name,
		hashToSign,
		SERVICE_IDENTITY_WIF
	);

	const signature = new VerusIDSignature(
		{ signature: signatureBase64 },
		IDENTITY_AUTH_SIG_VDXF_KEY
	);

	request.signature = signature;
	request.signingid = IdentityID.fromAddress(SERVICE_IDENTITY.iAddress);
	request.setSigned();

	return {
		requestId,
		qrString: request.toQrString(),
		deeplinkUri: request.toWalletDeeplinkUri(),
	};
}

/**
 * Create a storage request for an achievement
 */
export async function createAchievementStorageRequest(
	achievement: AchievementProofData,
	userIdentity: string,
	callbackUrl: string
): Promise<{
	requestId: string;
	qrString: string;
	deeplinkUri: string;
}> {
	if (!isStorageConfigured()) {
		throw new Error('SERVICE_IDENTITY_WIF not configured');
	}

	const chainId = CHAIN_IDS[VERUS_RPC.chainId === 'vrsctest' ? 'testnet' : 'mainnet'];
	const isTestnet = VERUS_RPC.chainId === 'vrsctest';

	const requestId = generateRandomIAddress();
	const createdAt = new BN(Math.floor(Date.now() / 1000));

	const contentmultimap = buildAchievementContentMap(achievement);

	const identityInfo = await getIdentity(userIdentity);
	const name = identityInfo.identity.name;
	const parent = identityInfo.identity.parent;

	const identity = PartialIdentity.fromJson({
		name,
		parent,
		contentmultimap,
	});

	const callbackWithRequestId = `${callbackUrl}&requestId=${requestId}`;

	const details = new IdentityUpdateRequestDetails({
		requestid: new BN(Date.now().toString()),
		createdat: createdAt,
		identity,
		systemid: IdentityID.fromAddress(chainId),
		responseuris: [
			ResponseUri.fromUriString(callbackWithRequestId, ResponseUri.TYPE_REDIRECT),
		],
	});

	if (isTestnet) {
		details.toggleIsTestnet();
	}

	const request = new IdentityUpdateRequest({
		details,
		systemid: IdentityID.fromAddress(chainId),
	});

	const verusId = getVerusIdInterface();
	const hashToSign = request.getDetailsHash(0);

	const signatureBase64 = await verusId.signHash(
		SERVICE_IDENTITY.name,
		hashToSign,
		SERVICE_IDENTITY_WIF
	);

	const signature = new VerusIDSignature(
		{ signature: signatureBase64 },
		IDENTITY_AUTH_SIG_VDXF_KEY
	);

	request.signature = signature;
	request.signingid = IdentityID.fromAddress(SERVICE_IDENTITY.iAddress);
	request.setSigned();

	return {
		requestId,
		qrString: request.toQrString(),
		deeplinkUri: request.toWalletDeeplinkUri(),
	};
}
