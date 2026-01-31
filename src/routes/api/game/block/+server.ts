/**
 * Game Block API
 *
 * Provides block data for provably fair gameplay rolls.
 *
 * GET /api/game/block
 *   Returns current block height
 *
 * GET /api/game/block?waitFor=N
 *   Waits until block N is available, returns its hash
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBlockCount, getBlockByHeight, VerusRpcError, RPC_ERROR_CODES } from '$lib/server/verus';

export const GET: RequestHandler = async ({ url }) => {
	const waitForParam = url.searchParams.get('waitFor');

	try {
		// Get current block height
		const currentHeight = await getBlockCount();

		// If no waitFor, just return current height
		if (!waitForParam) {
			return json({
				currentHeight,
				ready: false,
			});
		}

		const waitForHeight = parseInt(waitForParam, 10);
		if (isNaN(waitForHeight)) {
			return json({ error: 'Invalid waitFor parameter' }, { status: 400 });
		}

		// Check if the requested block is available
		if (currentHeight < waitForHeight) {
			return json({
				currentHeight,
				waitForHeight,
				blocksToWait: waitForHeight - currentHeight,
				ready: false,
			});
		}

		// Block is available, fetch it
		const block = await getBlockByHeight(waitForHeight);

		return json({
			currentHeight,
			waitForHeight,
			blockHash: block.hash,
			blockTime: block.time,
			ready: true,
		});
	} catch (error) {
		if (error instanceof VerusRpcError) {
			if (error.code === RPC_ERROR_CODES.BLOCK_NOT_FOUND) {
				return json({ error: 'Block not found' }, { status: 404 });
			}
			return json({ error: error.message }, { status: 500 });
		}

		console.error('Game block API error:', error);
		return json({ error: 'Failed to fetch block data' }, { status: 500 });
	}
};
