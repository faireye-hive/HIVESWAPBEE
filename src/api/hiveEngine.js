// ── RPC pool with automatic rotation ─────────────────────────────────────

export const DEFAULT_HIVE_ENGINE_RPC = 'https://api.hive-engine.com/rpc';

const FALLBACK_RPCS = [
    'https://api.hive-engine.com/rpc',
    'https://engine.rishipanthee.com',
    'https://herpc.dtools.dev',
    'https://ha.herpc.dtools.dev',
    'https://enginerpc.com',
];

// Index of currently active RPC (in-memory, resets on page reload)
let _rpcIndex = 0;

export function getHiveEngineRpc() {
    const saved = localStorage.getItem('hiveswapbee_he_rpc');
    // If user set a custom RPC, use it (ignore rotation)
    if (saved && saved !== DEFAULT_HIVE_ENGINE_RPC && !FALLBACK_RPCS.includes(saved)) {
        return saved;
    }
    return FALLBACK_RPCS[_rpcIndex] || DEFAULT_HIVE_ENGINE_RPC;
}

export function setHiveEngineRpc(url) {
    localStorage.setItem('hiveswapbee_he_rpc', url);
}

function rotateRpc() {
    _rpcIndex = (_rpcIndex + 1) % FALLBACK_RPCS.length;
    console.warn(`[HiveSwapBee] Rotating HE RPC → ${FALLBACK_RPCS[_rpcIndex]}`);
}

// ── Core RPC call with retry + rotation ──────────────────────────────────

async function sscCall(method, params, attempt = 0) {
    const MAX_ATTEMPTS = FALLBACK_RPCS.length * 2; // try each RPC twice at most
    if (attempt >= MAX_ATTEMPTS) {
        throw new Error('All Hive-Engine RPC endpoints failed. Please try again later.');
    }

    const rpc = getHiveEngineRpc();
    const apiUrl = rpc.endsWith('/contracts')
        ? rpc
        : `${rpc.replace(/\/$/, '')}/contracts`;

    const body = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout per attempt

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();

        // Some nodes return errors in the JSON body
        if (json.error) {
            throw new Error(json.error.message || 'RPC error');
        }

        return json.result;

    } catch (err) {
        clearTimeout(timer);

        const isNetworkErr =
            err.name === 'AbortError' ||
            err.name === 'TypeError' ||          // fetch() network failure
            err.message.includes('NetworkError') ||
            err.message.includes('Failed to fetch') ||
            err.message.includes('Load failed') ||
            err.message.includes('HTTP 5');      // 5xx server errors

        if (isNetworkErr) {
            console.warn(`[HiveSwapBee] RPC ${rpc} failed (attempt ${attempt + 1}): ${err.message}`);
            rotateRpc();
            // Small backoff before retry: 200ms * attempt
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            return sscCall(method, params, attempt + 1);
        }

        // Non-network errors (e.g. bad query) — don't retry
        throw err;
    }
}

/* ---------------------------------------------------------------
   Market Pools
   --------------------------------------------------------------- */

export async function findPools(limit = 1000, offset = 0) {
    return sscCall('find', {
        contract: 'marketpools',
        table: 'pools',
        query: {},
        limit,
        offset,
    });
}

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

export async function findLiquidityPositions(tokenPair, limit = 1000, offset = 0) {
    return sscCall('find', {
        contract: 'marketpools',
        table: 'liquidityPositions',
        query: { tokenPair },
        limit,
        offset,
    });
}

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

export async function getTokenInfoBatch(symbols) {
    return sscCall('find', {
        contract: 'tokens',
        table: 'tokens',
        query: { symbol: { $in: symbols } },
        limit: 1000,
        offset: 0,
    });
}

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
   Metrics
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

export async function getPoolCount() {
    const pools = await findPools(1000, 0);
    return pools?.length || 0;
}

export async function findMetrics(limit = 1000, offset = 0) {
    return sscCall('find', {
        contract: 'market',
        table: 'metrics',
        query: {},
        limit,
        offset,
    });
}