/**
 * Redis KV Store for Wallet Responses
 *
 * Upstash Redis (works on Vercel, Cloudflare, etc.) — the only persistence used
 * to bridge cross-device wallet flow (desktop QR → phone wallet → desktop poll).
 *
 * Key layout:
 *   prime:commitment:v2:{challengeId} -> wallet-signed GenericResponse buffer (base64url)
 *   prime:storage:v2:{requestId}      -> identityupdate txid (hex)
 *
 * Prefix rationale:
 *   - "prime:" — app namespace. The Upstash instance is shared with vcharacter-sales
 *     (and eventually vcharacter-ninja); without the prefix an orphan key can't be
 *     attributed during triage.
 *   - ":v2:" — flow version. Bumped when migrating from LoginConsent → GenericRequest
 *     so any in-flight v1 entries can't be parsed by the new code. Old entries expire
 *     naturally within RESPONSE_TTL.
 */

import { Redis } from '@upstash/redis';
import { env } from '$env/dynamic/private';

// 30 minute TTL - covers slow blocks and user delays
const RESPONSE_TTL = 30 * 60;

// Lazy initialization to avoid errors when env vars aren't set
let redis: Redis | null = null;

function getRedis(): Redis {
	if (!redis) {
		const url = env.UPSTASH_REDIS_REST_URL;
		const token = env.UPSTASH_REDIS_REST_TOKEN;

		if (!url || !token) {
			throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
		}

		redis = new Redis({ url, token });
	}
	return redis;
}

/**
 * Check if Redis is configured
 */
export function isKvConfigured(): boolean {
	return !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

const commitmentKey = (id: string) => `prime:commitment:v2:${id}`;
const storageKey = (id: string) => `prime:storage:v2:${id}`;

/**
 * Store a commitment response (base64url GenericResponse buffer from wallet callback).
 *
 * First-writer-wins via NX. If a response was already stored for this seedHash,
 * the second write is rejected. This blocks the overwrite variant of the
 * race-to-overwrite attack where a second callback could displace the legit
 * envelope after the first was already written. (See the threat-model memory.)
 *
 * @returns true if stored, false if an entry already existed.
 */
export async function storeCommitmentResponse(challengeId: string, responseData: string): Promise<boolean> {
	const r = getRedis();
	const result = await r.set(commitmentKey(challengeId), responseData, { ex: RESPONSE_TTL, nx: true });
	return result === 'OK';
}

/**
 * Check if a commitment response has arrived (non-consuming).
 */
export async function hasCommitmentResponse(challengeId: string): Promise<boolean> {
	const r = getRedis();
	return (await r.exists(commitmentKey(challengeId))) === 1;
}

/**
 * Read a commitment response without deleting it. Used by verify-stateless so
 * that `waiting_block` retry polls can re-read the same envelope.
 */
export async function peekCommitmentResponse(challengeId: string): Promise<string | null> {
	const r = getRedis();
	return await r.get<string>(commitmentKey(challengeId));
}

/**
 * Delete the commitment response after successful character derivation.
 */
export async function consumeCommitmentResponse(challengeId: string): Promise<void> {
	const r = getRedis();
	await r.del(commitmentKey(challengeId));
}

/**
 * Store a completed storage txid (hex, display order) for the requesting requestId.
 * The GenericResponse is parsed in the callback endpoint, not here — we only persist
 * the extracted txid so /api/storage/status stays trivial.
 *
 * NX semantics — same rationale as storeCommitmentResponse.
 *
 * @returns true if stored, false if an entry already existed.
 */
export async function storeStorageTxid(requestId: string, txid: string): Promise<boolean> {
	const r = getRedis();
	const result = await r.set(storageKey(requestId), txid, { ex: RESPONSE_TTL, nx: true });
	return result === 'OK';
}

/**
 * Get and delete a storage txid (one-time retrieval).
 */
export async function consumeStorageTxid(requestId: string): Promise<string | null> {
	const r = getRedis();
	const key = storageKey(requestId);
	const data = await r.get<string>(key);
	if (data) {
		await r.del(key);
	}
	return data;
}
