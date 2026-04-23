/**
 * Identity Update Module (Server-Side Only)
 *
 * Creates signed identity update requests for on-chain storage.
 * Uses the GenericRequest pattern for wallet compatibility.
 * Stateless - no server-side storage required.
 */

import { VerusIdInterface } from 'verusid-ts-client';
import {
	IdentityUpdateRequestDetails,
	GenericRequest,
	IdentityUpdateRequestOrdinalVDXFObject,
	VerifiableSignatureData,
	CompactIAddressObject,
	ResponseURI,
} from 'verus-typescript-primitives';
// @ts-ignore - no types available
import { BN } from 'bn.js';
import { randomBytes } from 'crypto';
// @ts-ignore - no types available
import bs58check from 'bs58check';
import { env } from '$env/dynamic/private';
import { VERUS_RPC, CHAIN_IDS } from '../config';
import type { StoredCharacter } from '../types';
import { buildCharacterContentMap, buildAchievementContentMap, type AchievementProofData } from '../vdxf';
import { getIdentity } from './verus';

const SERVICE_IDENTITY_WIF = env.SERVICE_IDENTITY_WIF || '';
const SERVICE_IDENTITY_IADDRESS = env.SERVICE_IDENTITY_IADDRESS || '';

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
 * Check if identity update env vars are configured.
 */
export function isStorageConfigured(): boolean {
	return (
		!!SERVICE_IDENTITY_WIF &&
		SERVICE_IDENTITY_WIF !== 'YOUR_WIF_HERE' &&
		!!SERVICE_IDENTITY_IADDRESS
	);
}

/**
 * Create a storage request for a character using GenericRequest pattern
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
		throw new Error('SERVICE_IDENTITY_WIF and SERVICE_IDENTITY_IADDRESS must be set');
	}

	const chainId = CHAIN_IDS[VERUS_RPC.chainId === 'vrsctest' ? 'testnet' : 'mainnet'];
	const isTestnet = VERUS_RPC.chainId === 'vrsctest';

	const requestId = generateRandomIAddress();

	// Build contentmultimap for the character proof
	const contentmultimap = buildCharacterContentMap(character);

	// Get the user's identity info
	const identityInfo = await getIdentity(character.userIdentity);
	const name = identityInfo.identity.name;
	const parent = identityInfo.identity.parent;

	// Build identity update details from CLI-style JSON
	const identityChanges = {
		name,
		parent,
		contentmultimap,
	};

	const details = IdentityUpdateRequestDetails.fromCLIJson(identityChanges, {
		requestid: CompactIAddressObject.fromAddress(requestId).toJson(),
	});

	// Include requestId in callback URL for matching
	const callbackWithRequestId = `${callbackUrl}&requestId=${requestId}`;

	// Build response URIs (TYPE_REDIRECT = GET redirect)
	const responseUris = [
		ResponseURI.fromUriString(callbackWithRequestId, ResponseURI.TYPE_REDIRECT),
	];

	// Create GenericRequest with IdentityUpdateRequestOrdinalVDXFObject
	const request = new GenericRequest({
		details: [
			new IdentityUpdateRequestOrdinalVDXFObject({
				data: details,
			}),
		],
		createdAt: new BN(Math.floor(Date.now() / 1000)),
		responseURIs: responseUris,
	});

	// Plan §9.1: version + systemID both required or wallet rejects the request.
	request.signature = new VerifiableSignatureData({
		version: VerifiableSignatureData.DEFAULT_VERSION,
		systemID: CompactIAddressObject.fromAddress(chainId),
		identityID: CompactIAddressObject.fromAddress(SERVICE_IDENTITY_IADDRESS),
	});

	if (isTestnet) {
		request.setIsTestnet();
	}

	// Sign the request - library handles identity validation and height fetching
	const verusId = getVerusIdInterface();
	const signedRequest = await verusId.signGenericRequest(request, SERVICE_IDENTITY_WIF);

	return {
		requestId,
		qrString: signedRequest.toWalletDeeplinkUri(),
		deeplinkUri: signedRequest.toWalletDeeplinkUri(),
	};
}

/**
 * Create a storage request for an achievement using GenericRequest pattern
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
		throw new Error('SERVICE_IDENTITY_WIF and SERVICE_IDENTITY_IADDRESS must be set');
	}

	const chainId = CHAIN_IDS[VERUS_RPC.chainId === 'vrsctest' ? 'testnet' : 'mainnet'];
	const isTestnet = VERUS_RPC.chainId === 'vrsctest';

	const requestId = generateRandomIAddress();

	const contentmultimap = buildAchievementContentMap(achievement);

	const identityInfo = await getIdentity(userIdentity);
	const name = identityInfo.identity.name;
	const parent = identityInfo.identity.parent;

	// Build identity update details from CLI-style JSON
	const identityChanges = {
		name,
		parent,
		contentmultimap,
	};

	const details = IdentityUpdateRequestDetails.fromCLIJson(identityChanges, {
		requestid: CompactIAddressObject.fromAddress(requestId).toJson(),
	});

	// Include requestId in callback URL for matching
	const callbackWithRequestId = `${callbackUrl}&requestId=${requestId}`;

	// Build response URIs (TYPE_REDIRECT = GET redirect)
	const responseUris = [
		ResponseURI.fromUriString(callbackWithRequestId, ResponseURI.TYPE_REDIRECT),
	];

	// Create GenericRequest with IdentityUpdateRequestOrdinalVDXFObject
	const request = new GenericRequest({
		details: [
			new IdentityUpdateRequestOrdinalVDXFObject({
				data: details,
			}),
		],
		createdAt: new BN(Math.floor(Date.now() / 1000)),
		responseURIs: responseUris,
	});

	// Plan §9.1: version + systemID both required or wallet rejects the request.
	request.signature = new VerifiableSignatureData({
		version: VerifiableSignatureData.DEFAULT_VERSION,
		systemID: CompactIAddressObject.fromAddress(chainId),
		identityID: CompactIAddressObject.fromAddress(SERVICE_IDENTITY_IADDRESS),
	});

	if (isTestnet) {
		request.setIsTestnet();
	}

	// Sign the request - library handles identity validation and height fetching
	const verusId = getVerusIdInterface();
	const signedRequest = await verusId.signGenericRequest(request, SERVICE_IDENTITY_WIF);

	return {
		requestId,
		qrString: signedRequest.toWalletDeeplinkUri(),
		deeplinkUri: signedRequest.toWalletDeeplinkUri(),
	};
}
