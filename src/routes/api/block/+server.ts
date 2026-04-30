/**
 * Block API Endpoint
 *
 * Provides block data from Verus blockchain for character creation and verification.
 *
 * GET /api/block - Returns the latest block (height, hash, time)
 * GET /api/block?height=N - Returns a specific block by height (for verification)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBlockCount, getBlockByHeight, VerusRpcError } from '$lib/server/verus';
import type { BlockResponse } from '$lib/types';

export const GET: RequestHandler = async ({ url }) => {
  const heightParam = url.searchParams.get('height');

  try {
    if (heightParam) {
      // Verify specific block by height
      const height = parseInt(heightParam, 10);

      if (isNaN(height) || height < 0) {
        throw error(400, 'Invalid height parameter');
      }

      const block = await getBlockByHeight(height);

      const response: BlockResponse = {
        height: block.height,
        hash: block.hash,
        time: block.time,
      };

      return json(response);
    }

    // Get latest block
    const height = await getBlockCount();
    const block = await getBlockByHeight(height);

    const response: BlockResponse = {
      height: block.height,
      hash: block.hash,
      time: block.time,
    };

    return json(response);
  } catch (err) {
    if (err instanceof VerusRpcError) {
      // Handle specific RPC errors
      if (err.code === -5) {
        throw error(404, 'Block not found');
      }
      throw error(502, `Verus RPC error: ${err.message}`);
    }

    // Re-throw SvelteKit errors
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }

    // Network or other errors
    console.error('[block] error', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw error(502, 'Failed to fetch block data from Verus');
  }
};
