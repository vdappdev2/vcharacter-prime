/**
 * Verus RPC Client (Server-Side Only)
 *
 * Handles communication with Verus daemon via JSON-RPC 1.0.
 * This module should only be imported in server-side code (+server.ts files).
 */

import { VERUS_RPC, CHAIN_IDS } from '../config';
import { VerusIdInterface } from 'verusid-ts-client';

/**
 * RPC Error with code and message from daemon
 */
export class VerusRpcError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'VerusRpcError';
    this.code = code;
  }
}

/**
 * Common RPC error codes
 */
export const RPC_ERROR_CODES = {
  BLOCK_NOT_FOUND: -5,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
} as const;

/**
 * JSON-RPC 1.0 request structure
 */
interface RpcRequest {
  jsonrpc: '1.0';
  id: string;
  method: string;
  params: unknown[];
}

/**
 * JSON-RPC response structure
 */
interface RpcResponse<T> {
  result: T | null;
  error: { code: number; message: string } | null;
  id: string;
}

/**
 * Make a raw RPC call to a specific endpoint
 */
async function rpcCallToEndpoint<T>(
  endpoint: string,
  method: string,
  params: unknown[] = []
): Promise<T> {
  const request: RpcRequest = {
    jsonrpc: '1.0',
    id: `vcharacter-${Date.now()}`,
    method,
    params,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(VERUS_RPC.timeout),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP error: ${response.status} ${response.statusText}`);
  }

  const data: RpcResponse<T> = await response.json();

  if (data.error) {
    throw new VerusRpcError(data.error.code, data.error.message);
  }

  return data.result as T;
}

/**
 * Make a raw RPC call to Verus daemon with automatic fallback
 *
 * Tries the primary endpoint first, falls back to secondary on network errors.
 * RPC errors (like block not found) are NOT retried on fallback.
 */
async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  try {
    return await rpcCallToEndpoint<T>(VERUS_RPC.endpoint, method, params);
  } catch (error) {
    // Don't retry RPC errors (these are valid responses from the daemon)
    if (error instanceof VerusRpcError) {
      throw error;
    }

    // Try fallback for network/timeout errors
    if (VERUS_RPC.fallbackEndpoint) {
      console.log(`Primary RPC failed, trying fallback: ${VERUS_RPC.fallbackEndpoint}`);
      return await rpcCallToEndpoint<T>(VERUS_RPC.fallbackEndpoint, method, params);
    }

    throw error;
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Block data from getblock
 */
export interface BlockData {
  hash: string;
  height: number;
  time: number;
  confirmations: number;
  size: number;
  // Other fields omitted for brevity
}

// ============================================================================
// RPC Methods
// ============================================================================

/**
 * Get current block count (chain height)
 *
 * @returns Current block height
 */
export async function getBlockCount(): Promise<number> {
  return rpcCall<number>('getblockcount', []);
}

/**
 * Get block data by hash
 *
 * @param blockhash - Block hash
 * @returns Block data including time
 */
export async function getBlock(blockhash: string): Promise<BlockData> {
  return rpcCall<BlockData>('getblock', [blockhash]);
}

/**
 * Get block hash by height
 *
 * @param height - Block height
 * @returns Block hash as string
 */
export async function getBlockHash(height: number): Promise<string> {
  return rpcCall<string>('getblockhash', [height]);
}

/**
 * Get block data by height
 *
 * First fetches the block hash, then fetches the block data.
 *
 * @param height - Block height
 * @returns Block data including hash and time
 */
export async function getBlockByHeight(height: number): Promise<BlockData> {
  const hash = await getBlockHash(height);
  return getBlock(hash);
}

/**
 * Check if RPC endpoint is reachable
 *
 * @returns true if endpoint responds, false otherwise
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await getBlockCount();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Identity RPC Methods
// ============================================================================

/**
 * Identity info from getidentity
 */
export interface IdentityInfo {
  identity: {
    name: string;
    identityaddress: string;
    primaryaddresses: string[];
    minimumsignatures: number;
    parent: string;
    contentmultimap?: Record<string, unknown>;
    // Other fields omitted
  };
  status: string;
  canspendfor: boolean;
  cansignfor: boolean;
  blockheight: number;
  txid: string;
  vout: number;
  friendlyname: string;
}

/**
 * Get identity info
 *
 * @param identity - Identity name (e.g., "testidx@") or i-address
 * @param height - Optional height; -1 includes mempool, 0 (or omitted) = current
 * @returns Identity info
 */
export async function getIdentity(identity: string, height?: number): Promise<IdentityInfo> {
  const params: unknown[] = [identity];
  if (height !== undefined) params.push(height);
  return rpcCall<IdentityInfo>('getidentity', params);
}

/**
 * Identity content response from getidentitycontent
 */
export interface IdentityContentInfo {
  fullyqualifiedname: string;
  status: string;
  canspendfor: boolean;
  cansignfor: boolean;
  blockheight: number;
  fromheight: number;
  toheight: number;
  txid: string;
  vout: number;
  identity: {
    version: number;
    flags: number;
    primaryaddresses: string[];
    minimumsignatures: number;
    name: string;
    identityaddress: string;
    parent: string;
    systemid: string;
    contentmap: Record<string, unknown>;
    contentmultimap: Record<string, unknown[]>;
    [key: string]: unknown;
  };
}

/**
 * Get identity content, optionally filtered by VDXF key
 *
 * More reliable than getidentity for fetching specific content,
 * as it works even if the identity has been updated since.
 *
 * @param identity - Identity name (e.g., "testidx@") or i-address
 * @param heightStart - Start height (default 0)
 * @param heightEnd - End height (default 0 = max, -1 = include mempool)
 * @param txProofs - Include tx proofs (default false)
 * @param txProofHeight - Height for proof generation (default 0)
 * @param vdxfKey - Filter by specific VDXF key (optional)
 * @param keepDeleted - Include deleted items (default false)
 * @returns Identity content info
 */
export async function getIdentityContent(
  identity: string,
  heightStart: number = 0,
  heightEnd: number = 0,
  txProofs: boolean = false,
  txProofHeight: number = 0,
  vdxfKey?: string,
  keepDeleted: boolean = false
): Promise<IdentityContentInfo> {
  const params: unknown[] = [identity, heightStart, heightEnd, txProofs, txProofHeight];
  if (vdxfKey) {
    params.push(vdxfKey);
    params.push(keepDeleted);
  }
  return rpcCall<IdentityContentInfo>('getidentitycontent', params);
}

// ============================================================================
// VerusIdInterface with Fallback
// ============================================================================

/**
 * Chain i-address for the current network.
 * Passed to VerusIdInterface methods to skip redundant getChainId() RPC calls.
 */
export const CHAIN_IADDRESS = CHAIN_IDS[VERUS_RPC.chainId === 'vrsctest' ? 'testnet' : 'mainnet'];

function createVerusIdInterface(endpoint: string): VerusIdInterface {
  return new VerusIdInterface(CHAIN_IADDRESS, endpoint);
}

/**
 * Run an operation against VerusIdInterface with automatic endpoint fallback.
 *
 * Tries the primary endpoint first. On network/timeout errors, retries
 * with the fallback endpoint. Follows the same pattern as rpcCall().
 */
export async function withVerusIdFallback<T>(
  operation: (verusId: VerusIdInterface) => Promise<T>
): Promise<T> {
  try {
    return await operation(createVerusIdInterface(VERUS_RPC.endpoint));
  } catch (error) {
    if (VERUS_RPC.fallbackEndpoint) {
      console.log(`Primary VerusIdInterface RPC failed, trying fallback: ${VERUS_RPC.fallbackEndpoint}`);
      return await operation(createVerusIdInterface(VERUS_RPC.fallbackEndpoint));
    }
    throw error;
  }
}
