/**
 * GET /api/storage/callback
 *
 * Wallet TYPE_REDIRECT landing point for on-chain storage flows (character or
 * achievement). Receives a signed GenericResponse from the wallet, parses it,
 * extracts the identityupdate txid, and stores the txid in Redis for the
 * desktop polling endpoint (/api/storage/status) to pick up.
 *
 * Unlike /api/commitment/callback, we DO parse the response here — the only
 * payload we care about is the txid and there's no downstream verification
 * step to defer it to. See upgrade-plan.md §9.4.
 */

import type { RequestHandler } from './$types';
import {
	GenericResponse,
	GENERIC_RESPONSE_DEEPLINK_VDXF_KEY,
	IdentityUpdateResponseOrdinalVDXFObject,
	IdentityUpdateResponseDetails,
} from 'verus-typescript-primitives';
import { storeStorageResult, isKvConfigured } from '$lib/server/kv';
import { verifyStorageOnChain } from '$lib/server/identityUpdate';

export const GET: RequestHandler = async ({ url }) => {
	if (!isKvConfigured()) {
		return htmlResponse(errorPage('Storage not configured'), 503);
	}

	const requestId = url.searchParams.get('requestId');
	if (!requestId) {
		return htmlResponse(errorPage('Missing requestId parameter'), 400);
	}

	const responseData = url.searchParams.get(GENERIC_RESPONSE_DEEPLINK_VDXF_KEY.vdxfid);
	if (!responseData) {
		return htmlResponse(errorPage('Missing wallet response payload'), 400);
	}

	try {
		const parsed = parseStorageResponse(responseData);
		if (!parsed) {
			return htmlResponse(errorPage('Invalid response format'), 400);
		}
		const { txid, signingId } = parsed;

		// Verify against chain (mempool included). False means the daemon hasn't
		// seen the tx yet — record anyway, the UI surfaces "still waiting."
		const verified = signingId
			? await verifyStorageOnChain(signingId, txid)
			: false;

		const stored = await storeStorageResult(requestId, txid, verified);
		if (!stored) {
			console.warn('[storage/callback] duplicate result for requestId — rejecting second write');
			return htmlResponse(
				errorPage('A storage result was already received for this request.'),
				409,
			);
		}
		return htmlResponse(successPage(), 200);
	} catch (err) {
		console.error('Storage callback error:', err);
		return htmlResponse(
			errorPage(err instanceof Error ? err.message : 'Unknown error'),
			500,
		);
	}
};

/**
 * Decode a base64url-encoded GenericResponse and pull out the identityupdate
 * txid plus the signing identity (so we can verify the txid on chain).
 * GenericResponse has no static fromQrString/fromWalletDeeplinkUri helpers —
 * decode manually per plan §9.4.
 */
function parseStorageResponse(
	responseData: string,
): { txid: string; signingId: string | null } | null {
	try {
		const buf = Buffer.from(responseData, 'base64url');
		const response = new GenericResponse();
		response.fromBuffer(buf, 0);

		const detail = response.details[0];
		if (!(detail instanceof IdentityUpdateResponseOrdinalVDXFObject)) {
			console.error('Storage callback: response missing IdentityUpdateResponse detail');
			return null;
		}

		const responseDetails = detail.data as IdentityUpdateResponseDetails;
		const txidBuffer = responseDetails.txid;
		if (!txidBuffer) {
			console.error('Storage callback: no txid in response');
			return null;
		}

		// txid is stored in natural order; reverse for display
		const txid = Buffer.from(txidBuffer as unknown as Uint8Array).reverse().toString('hex');

		// Signing identity comes from the envelope signature, used for the
		// on-chain verification step. Optional — if missing, we still record the
		// txid but mark verified=false.
		const signingId = response.signature?.identityID?.toIAddress?.() ?? null;

		return { txid, signingId };
	} catch (err) {
		console.error('Storage callback parse error:', err);
		return null;
	}
}

function htmlResponse(body: string, status: number): Response {
	return new Response(body, {
		status,
		headers: { 'Content-Type': 'text/html' },
	});
}

function successPage(): string {
	return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stored Successfully</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0b0b10; color: #eee; }
    .card { background: #16161d; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.3); max-width: 28rem; }
    h1 { color: #fbbf24; margin: 0 0 0.5rem; }
    p { color: #a1a1aa; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Stored Successfully</h1>
    <p>Your data has been saved to the blockchain.</p>
    <p style="font-size: 0.8rem;">You can return to your browser to see the confirmation.</p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
	return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Storage Failed</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0b0b10; color: #eee; }
    .card { background: #16161d; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.3); max-width: 28rem; }
    h1 { color: #ef4444; margin: 0 0 0.5rem; }
    p { color: #a1a1aa; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Storage Failed</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
