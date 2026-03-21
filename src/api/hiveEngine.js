export const DEFAULT_HIVE_ENGINE_RPC = 'https://api.hive-engine.com/rpc';

export function getHiveEngineRpc() {
    return localStorage.getItem('hiveswapbee_he_rpc') || DEFAULT_HIVE_ENGINE_RPC;
}

export function setHiveEngineRpc(url) {
    localStorage.setItem('hiveswapbee_he_rpc', url);
}
/**
 * Generic Hive-Engine sidechain RPC call.
 * @param {string} method - 'find' or 'findOne'
 * @param {object} params - { contract, table, query, limit, offset, indexes }
 */
async function sscCall(method, params) {
    const body = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
    };

    const rpc = getHiveEngineRpc();
    const apiUrl = rpc.endsWith('/contracts') ? rpc : `${rpc.replace(/\/$/, '')}/contracts`;

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`SSC API error: ${res.status}`);

    const json = await res.json();
    return json.result;
}

/* ---------------------------------------------------------------
   Market Pools
   --------------------------------------------------------------- */

/** Fetch all liquidity pools */
export async function findPools(limit = 1000, offset = 0) {
    return sscCall('find', {
        contract: 'marketpools',
        table: 'pools',
        query: {},
        limit,
        offset,
    });
}

/** Fetch a single pool by tokenPair */
export async function findPool(tokenPair) {
    const results = await sscCall('find', {
        contract: 'marketpools',
        table: 'pools',
        query: { tokenPair },
        limit: 1,
        offset: 0,
    });
    return results?.[0] || null;
}

/** Fetch liquidity positions for a given token pair */
export async function findLiquidityPositions(tokenPair, limit = 1000, offset = 0) {
    return sscCall('find', {
        contract: 'marketpools',
        table: 'liquidityPositions',
        query: { tokenPair },
        limit,
        offset,
    });
}

/** Fetch all LP positions for a specific account */
export async function findUserPositions(account, limit = 1000) {
    return sscCall('find', {
        contract: 'marketpools',
        table: 'liquidityPositions',
        query: { account },
        limit,
        offset: 0,
    });
}

/* ---------------------------------------------------------------
   Tokens
   --------------------------------------------------------------- */

/** Fetch token metadata (precision, name, etc.) */
export async function getTokenInfo(symbol) {
    const results = await sscCall('find', {
        contract: 'tokens',
        table: 'tokens',
        query: { symbol },
        limit: 1,
        offset: 0,
    });
    return results?.[0] || null;
}

/** Fetch multiple token metadata at once */
export async function getTokenInfoBatch(symbols) {
    return sscCall('find', {
        contract: 'tokens',
        table: 'tokens',
        query: { symbol: { $in: symbols } },
        limit: 1000,
        offset: 0,
    });
}

/** Fetch a user's balance for a specific token */
export async function getTokenBalance(account, symbol) {
    const results = await sscCall('find', {
        contract: 'tokens',
        table: 'balances',
        query: { account, symbol },
        limit: 1,
        offset: 0,
    });
    return results?.[0] || null;
}

/** Fetch all token balances for an account */
export async function getAccountBalances(account, limit = 1000) {
    return sscCall('find', {
        contract: 'tokens',
        table: 'balances',
        query: { account },
        limit,
        offset: 0,
    });
}

/* ---------------------------------------------------------------
   Metrics helpers
   --------------------------------------------------------------- */

export async function getMarketPoolsParams() {
    const results = await sscCall('find', {
        contract: 'marketpools',
        table: 'params',
        query: {},
        limit: 1,
        offset: 0,
    });
    return results?.[0] || null;
}

/** Get total pool count (fetch minimal data, use length) */
export async function getPoolCount() {
    const pools = await findPools(1000, 0);
    return pools?.length || 0;
}

/** Get all market metrics for tokens */
export async function findMetrics(limit = 1000, offset = 0) {
    return sscCall('find', {
        contract: 'market',
        table: 'metrics',
        query: {},
        limit,
        offset,
    });
}
