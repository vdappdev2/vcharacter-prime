/**
 * Per-IP fixed-window rate limiter backed by Upstash Redis.
 *
 * Why fixed-window (not sliding): two Redis commands per check (INCR + EXPIRE),
 * trivial to reason about, no extra dependencies. The boundary-burst quirk
 * (up to 2x the limit straddling a window boundary) is irrelevant for our
 * DoS-mitigation use case.
 *
 * Why a separate Redis client from kv.ts: kv.ts holds application data; this
 * holds infra counters. Upstash is HTTP-based, no connection pooling concern.
 *
 * Fail-open: any Redis error or missing config returns allowed=true. A rate
 * limiter must never become a hard dependency that takes the site down.
 *
 * Key prefix `prime:rl:` keeps these counters isolated from sister apps
 * (sales, ninja) sharing the Upstash account.
 */

import { Redis } from '@upstash/redis';
import { env } from '$env/dynamic/private';

let redis: Redis | null = null;

function getRedis(): Redis | null {
	if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
	if (!redis) {
		redis = new Redis({
			url: env.UPSTASH_REDIS_REST_URL,
			token: env.UPSTASH_REDIS_REST_TOKEN,
		});
	}
	return redis;
}

export interface Policy {
	limit: number;
	windowSeconds: number;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetSeconds: number;
}

export async function rateLimit(
	bucket: string,
	ip: string,
	policy: Policy,
): Promise<RateLimitResult> {
	const r = getRedis();
	if (!r) return { allowed: true, remaining: policy.limit, resetSeconds: 0 };

	const now = Math.floor(Date.now() / 1000);
	const windowStart = now - (now % policy.windowSeconds);
	const key = `prime:rl:${bucket}:${ip}:${windowStart}`;
	const resetSeconds = windowStart + policy.windowSeconds - now;

	try {
		const count = await r.incr(key);
		if (count === 1) {
			await r.expire(key, policy.windowSeconds);
		}
		return {
			allowed: count <= policy.limit,
			remaining: Math.max(0, policy.limit - count),
			resetSeconds,
		};
	} catch (err) {
		console.error('[rateLimit] Redis error, failing open:', err);
		return { allowed: true, remaining: policy.limit, resetSeconds: 0 };
	}
}
