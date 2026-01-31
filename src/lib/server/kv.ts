/**
 * Redis KV Store for Wallet Responses
 *
 * Simple key-value storage for wallet callback responses.
 * Uses Upstash Redis (works with Vercel, Cloudflare, etc.)
 *
 * Keys:
 *   commitment:{challengeId} -> wallet signed response
 *   storage:{requestId} -> wallet storage response
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

/**
 * Store a commitment response (from wallet callback)
 */
export async function storeCommitmentResponse(challengeId: string, responseData: string): Promise<void> {
	const r = getRedis();
	await r.set(`commitment:${challengeId}`, responseData, { ex: RESPONSE_TTL });
}

/**
 * Get and delete a commitment response (one-time retrieval)
 */
export async function consumeCommitmentResponse(challengeId: string): Promise<string | null> {
	const r = getRedis();
	const key = `commitment:${challengeId}`;
	const data = await r.get<string>(key);
	if (data) {
		await r.del(key);
	}
	return data;
}

/**
 * Check if a commitment response exists (without consuming)
 */
export async function hasCommitmentResponse(challengeId: string): Promise<boolean> {
	const r = getRedis();
	return (await r.exists(`commitment:${challengeId}`)) === 1;
}

/**
 * Store a storage response (from wallet callback)
 */
export async function storeStorageResponse(requestId: string, responseData: string): Promise<void> {
	const r = getRedis();
	await r.set(`storage:${requestId}`, responseData, { ex: RESPONSE_TTL });
}

/**
 * Get and delete a storage response (one-time retrieval)
 */
export async function consumeStorageResponse(requestId: string): Promise<string | null> {
	const r = getRedis();
	const key = `storage:${requestId}`;
	const data = await r.get<string>(key);
	if (data) {
		await r.del(key);
	}
	return data;
}

/**
 * Check if a storage response exists (without consuming)
 */
export async function hasStorageResponse(requestId: string): Promise<boolean> {
	const r = getRedis();
	return (await r.exists(`storage:${requestId}`)) === 1;
}
