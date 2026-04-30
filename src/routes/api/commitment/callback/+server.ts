/**
 * GET /api/commitment/callback
 *
 * Wallet TYPE_REDIRECT landing point for the character-creation commitment flow.
 *
 * Verus Mobile appends the signed GenericResponse buffer to this URL under the
 * query key GENERIC_RESPONSE_DEEPLINK_VDXF_KEY.vdxfid, base64url-encoded. We
 * pass the raw base64url value through to Redis (keyed by the clientSeedHash
 * that was baked into the signed envelope's ResponseURI). The desktop browser
 * polls /api/commitment/status using the same seedHash and then hands the
 * response payload to /api/commitment/verify-stateless for signature checking,
 * block-height extraction, and character derivation.
 *
 * This endpoint does NOT verify the signature — that's verify-stateless's job.
 * It only persists the opaque payload and shows a success/error page on the
 * phone.
 *
 * See upgrade-plan.md §9.4 for the wallet-side response shape.
 */

import type { RequestHandler } from './$types';
import { GENERIC_RESPONSE_DEEPLINK_VDXF_KEY } from 'verus-typescript-primitives';
import { storeCommitmentResponse, isKvConfigured } from '$lib/server/kv';

export const GET: RequestHandler = async ({ url }) => {
	if (!isKvConfigured()) {
		return htmlResponse(errorPage('Storage not configured'), 503);
	}

	const commitment = url.searchParams.get('commitment');
	if (!commitment) {
		return htmlResponse(errorPage('Missing commitment parameter'), 400);
	}

	const responseData = url.searchParams.get(GENERIC_RESPONSE_DEEPLINK_VDXF_KEY.vdxfid);
	if (!responseData) {
		return htmlResponse(errorPage('Missing wallet response payload'), 400);
	}

	try {
		// The clientSeedHash (commitment) is our Redis key — it uniquely identifies
		// the character-creation attempt and matches what the desktop browser polls.
		// NX: first writer wins. A second callback for the same seedHash is rejected
		// — prevents overwriting a legit envelope with a later-arriving one.
		const stored = await storeCommitmentResponse(commitment, responseData);
		if (!stored) {
			console.warn('[commitment/callback] duplicate envelope for seedHash — rejecting second write');
			return htmlResponse(
				errorPage('A response was already received for this commitment. If you did not expect this, restart character creation.'),
				409,
			);
		}
		return htmlResponse(successPage(), 200);
	} catch (err) {
		console.error('[commitment/callback] error', {
			error: err instanceof Error ? err.message : String(err),
		});
		return htmlResponse(
			errorPage(err instanceof Error ? err.message : 'Unknown error'),
			500,
		);
	}
};

function htmlResponse(body: string, status: number): Response {
	return new Response(body, {
		status,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function successPage(): string {
	return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signed Successfully</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0b0b10; color: #eee; }
    .card { background: #16161d; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.3); max-width: 28rem; }
    h1 { color: #fbbf24; margin: 0 0 0.5rem; }
    p { color: #a1a1aa; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Signed Successfully</h1>
    <p>You can return to your browser to continue.</p>
    <p style="font-size: 0.8rem;">If you're on a different device, go back to the browser where you started.</p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
	return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Commitment Failed</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0b0b10; color: #eee; }
    .card { background: #16161d; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.3); max-width: 28rem; }
    h1 { color: #ef4444; margin: 0 0 0.5rem; }
    p { color: #a1a1aa; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Commitment Failed</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}
