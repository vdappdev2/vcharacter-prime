/**
 * Generic Authentication Request (Server-Side Only)
 *
 * Creates signed GenericRequest envelopes carrying an AuthenticationRequestDetails
 * payload for the commitment phase of character creation. The SHA-256 of the user's
 * clientSeed is embedded in the ResponseURI query string — the envelope signature
 * covers the ResponseURI, so the seed hash becomes part of the cryptographic commit.
 *
 * Stateless: no server-side challenge map. Commitment data travels in the signed
 * envelope; the wallet-response's block height (extracted via getSignatureInfo)
 * becomes commitmentBlockHeight, and rollBlockHeight = commitmentBlockHeight + 1.
 *
 * Replaces the legacy LoginConsentChallenge flow. Verus Mobile v1.1.0-1+ supports
 * AuthenticationRequest in production (no experimental-deeplinks toggle required).
 */

import { randomBytes } from 'crypto';
// @ts-ignore - no types available
import bs58check from 'bs58check';
import {
	GenericRequest,
	AuthenticationRequestDetails,
	AuthenticationRequestOrdinalVDXFObject,
	VerifiableSignatureData,
	CompactIAddressObject,
	ResponseURI,
} from 'verus-typescript-primitives';
// @ts-ignore - no types available
import { BN } from 'bn.js';
import { env } from '$env/dynamic/private';
import { VERUS_RPC, CHAIN_IDS } from '../config';
import { withVerusIdFallback } from './verus';

const SERVICE_IDENTITY_WIF = env.SERVICE_IDENTITY_WIF || '';
const SERVICE_IDENTITY_IADDRESS = env.SERVICE_IDENTITY_IADDRESS || '';

function generateRandomIAddress(): string {
	const hash = randomBytes(20);
	const payload = new Uint8Array(21);
	payload[0] = 102; // i-address version byte
	payload.set(hash, 1);
	return bs58check.encode(payload) as string;
}

/**
 * Check if the service identity env vars are configured.
 */
export function isCommitmentConfigured(): boolean {
	return (
		!!SERVICE_IDENTITY_WIF &&
		SERVICE_IDENTITY_WIF !== 'YOUR_WIF_HERE' &&
		!!SERVICE_IDENTITY_IADDRESS
	);
}

/**
 * Create a commitment challenge as a signed GenericRequest + AuthenticationRequest.
 *
 * Stateless — the commitment hash is embedded in the ResponseURI. Because the
 * envelope signature covers the response URIs, the seed hash can't be altered
 * without invalidating the signature.
 *
 * @param clientSeedHash - SHA-256 hash of the client_seed (64-char hex string)
 * @param callbackUrl    - Server endpoint that will receive the GenericResponse
 *                         (via TYPE_REDIRECT GET with the response payload appended
 *                         under GENERIC_RESPONSE_DEEPLINK_VDXF_KEY.vdxfid)
 */
export async function createCommitmentRequest(
	clientSeedHash: string,
	callbackUrl: string
): Promise<{
	qrString: string;
	deeplinkUri: string;
	sessionId: string;
	challengeId: string;
}> {
	if (!isCommitmentConfigured()) {
		throw new Error('SERVICE_IDENTITY_WIF and SERVICE_IDENTITY_IADDRESS must be set');
	}

	const isTestnet = VERUS_RPC.chainId === 'vrsctest';
	const chainId = CHAIN_IDS[isTestnet ? 'testnet' : 'mainnet'];

	const challengeId = generateRandomIAddress();
	const sessionId = generateRandomIAddress();

	// Thread the commitment hash + challengeId through the response URI.
	// Both fields end up signed (the envelope signature covers ResponseURIs).
	const separator = callbackUrl.includes('?') ? '&' : '?';
	const callbackWithCommitment =
		`${callbackUrl}${separator}commitment=${clientSeedHash}&challengeId=${challengeId}`;

	const details = new AuthenticationRequestDetails({
		requestID: CompactIAddressObject.fromAddress(challengeId),
	});

	const request = new GenericRequest({
		details: [new AuthenticationRequestOrdinalVDXFObject({ data: details })],
		createdAt: new BN(Math.floor(Date.now() / 1000)),
		responseURIs: [
			ResponseURI.fromUriString(callbackWithCommitment, ResponseURI.TYPE_REDIRECT),
		],
	});

	// Plan §9.1: both DEFAULT_VERSION and systemID are required or the wallet
	// rejects with "failed to verify request signature."
	request.signature = new VerifiableSignatureData({
		version: VerifiableSignatureData.DEFAULT_VERSION,
		systemID: CompactIAddressObject.fromAddress(chainId),
		identityID: CompactIAddressObject.fromAddress(SERVICE_IDENTITY_IADDRESS),
	});

	if (isTestnet) request.setIsTestnet();

	const signedRequest = await withVerusIdFallback((verusId) =>
		verusId.signGenericRequest(request, SERVICE_IDENTITY_WIF),
	);

	return {
		qrString: signedRequest.toQrString(),
		deeplinkUri: signedRequest.toWalletDeeplinkUri(),
		sessionId,
		challengeId,
	};
}
