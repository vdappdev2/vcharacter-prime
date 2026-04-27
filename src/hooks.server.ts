/**
 * Centralized rate-limiting middleware. Runs before every request; only acts
 * on /api/* routes that match a policy entry. Skipped in dev so local testing
 * doesn't trip the limiter (everything looks like 127.0.0.1).
 *
 * Three buckets, tuned to endpoint cost:
 *   - commit (10/min): commitment + storage callbacks (signing work, RPC, Redis writes)
 *   - store  (20/hr):  character/achievement store (one-shot per user action)
 *   - read   (60/min): polls and read-only RPC delegations
 *
 * On block: 429 with Retry-After in seconds.
 */

import type { Handle } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { rateLimit, type Policy } from '$lib/server/rateLimit';

const COMMIT: Policy = { limit: 10, windowSeconds: 60 };
const STORE: Policy = { limit: 20, windowSeconds: 3600 };
const READ: Policy = { limit: 60, windowSeconds: 60 };

const POLICIES: Array<{ match: RegExp; bucket: string; policy: Policy }> = [
	{ match: /^\/api\/commitment\/request$/, bucket: 'commit', policy: COMMIT },
	{ match: /^\/api\/commitment\/callback$/, bucket: 'commit', policy: COMMIT },
	{ match: /^\/api\/storage\/callback$/, bucket: 'commit', policy: COMMIT },
	{ match: /^\/api\/character\/store$/, bucket: 'store', policy: STORE },
	{ match: /^\/api\/achievement\/store$/, bucket: 'store', policy: STORE },
	{ match: /^\/api\/commitment\/status$/, bucket: 'read', policy: READ },
	{ match: /^\/api\/commitment\/verify-stateless$/, bucket: 'read', policy: READ },
	{ match: /^\/api\/storage\/status$/, bucket: 'read', policy: READ },
	{ match: /^\/api\/character\/verify$/, bucket: 'read', policy: READ },
	{ match: /^\/api\/character\/list$/, bucket: 'read', policy: READ },
	{ match: /^\/api\/achievement\/list$/, bucket: 'read', policy: READ },
	{ match: /^\/api\/block$/, bucket: 'read', policy: READ },
	{ match: /^\/api\/game\/block$/, bucket: 'read', policy: READ },
];

export const handle: Handle = async ({ event, resolve }) => {
	if (dev) return resolve(event);
	if (!event.url.pathname.startsWith('/api/')) return resolve(event);

	const match = POLICIES.find((p) => p.match.test(event.url.pathname));
	if (!match) return resolve(event);

	const ip = event.getClientAddress();
	const result = await rateLimit(match.bucket, ip, match.policy);

	if (!result.allowed) {
		return json(
			{ error: 'Rate limit exceeded', retryAfter: result.resetSeconds },
			{
				status: 429,
				headers: {
					'Retry-After': String(result.resetSeconds),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': String(result.resetSeconds),
				},
			},
		);
	}
	return resolve(event);
};
