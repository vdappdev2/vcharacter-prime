/**
 * Login Consent Module (Server-Side Only)
 *
 * Creates signed login consent challenges for commitment phase.
 * Stateless - no server-side storage required.
 */

import { VerusIdInterface } from 'verusid-ts-client';
import { randomBytes } from 'crypto';
// @ts-ignore - no types available
import bs58check from 'bs58check';
import {
	LoginConsentChallenge,
	RequestedPermission,
	Subject,
	RedirectUri,
	LOGIN_CONSENT_REDIRECT_VDXF_KEY,
	IDENTITY_VIEW,
	ID_FULLYQUALIFIEDNAME_VDXF_KEY,
} from 'verus-typescript-primitives';
import { env } from '$env/dynamic/private';
import { VERUS_RPC, CHAIN_IDS, SERVICE_IDENTITY } from '../config';

const SERVICE_IDENTITY_WIF = env.SERVICE_IDENTITY_WIF || '';

function getVerusIdInterface(): VerusIdInterface {
	const chainId = CHAIN_IDS[VERUS_RPC.chainId === 'vrsctest' ? 'testnet' : 'mainnet'];
	return new VerusIdInterface(chainId, VERUS_RPC.endpoint);
}

function generateRandomIAddress(): string {
	const hash = randomBytes(20);
	const payload = new Uint8Array(21);
	payload[0] = 102; // i-address version byte
	payload.set(hash, 1);
	return bs58check.encode(payload) as string;
}

/**
 * Check if the service identity WIF is configured
 */
export function isCommitmentConfigured(): boolean {
	return !!SERVICE_IDENTITY_WIF && SERVICE_IDENTITY_WIF !== 'YOUR_WIF_HERE';
}

/**
 * Create a commitment challenge request
 *
 * Stateless - the commitment hash is embedded in the callback URL.
 * When signed, the hash becomes part of the cryptographic proof.
 *
 * @param clientSeedHash - SHA-256 hash of the client_seed (hex string)
 * @param callbackUrl - Client page URL where the wallet will redirect
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
		throw new Error('SERVICE_IDENTITY_WIF not configured');
	}

	const verusId = getVerusIdInterface();

	const challengeId = generateRandomIAddress();
	const sessionId = generateRandomIAddress();
	const salt = generateRandomIAddress();
	const createdAt = Math.floor(Date.now() / 1000);

	// Embed commitment hash in callback URL
	const callbackWithCommitment = `${callbackUrl}?commitment=${clientSeedHash}`;

	const challenge = new LoginConsentChallenge({
		challenge_id: challengeId,
		requested_access: [new RequestedPermission(IDENTITY_VIEW.vdxfid)],
		subject: [new Subject('', ID_FULLYQUALIFIEDNAME_VDXF_KEY.vdxfid)],
		redirect_uris: [
			new RedirectUri(callbackWithCommitment, LOGIN_CONSENT_REDIRECT_VDXF_KEY.vdxfid),
		],
		session_id: sessionId,
		created_at: createdAt,
		salt,
	});

	const request = await verusId.createLoginConsentRequest(
		SERVICE_IDENTITY.iAddress,
		challenge,
		SERVICE_IDENTITY_WIF
	);

	return {
		qrString: request.toQrString(),
		deeplinkUri: request.toWalletDeeplinkUri(),
		sessionId,
		challengeId,
	};
}
