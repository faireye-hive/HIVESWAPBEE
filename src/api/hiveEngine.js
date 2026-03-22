// ── RPC pool with automatic rotation ─────────────────────────────────────

export const DEFAULT_HIVE_ENGINE_RPC = 'https://api.hive-engine.com/rpc';

const FALLBACK_RPCS = [
    'https://api.hive-engine.com/rpc',
    'https://engine.rishipanthee.com',
    'https://herpc.dtools.dev',
    'https://ha.herpc.dtools.dev',
    'https://enginerpc.com',
];

let _rpcIndex = 0;

export function getHiveEngineRpc() {
    const saved = localStorage.getItem('hiveswapbee_he_rpc');
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

async function sscCall(method, params, attempt = 0) {
    const MAX_ATTEMPTS = FALLBACK_RPCS.length * 2;
    if (attempt >= MAX_ATTEMPTS) {
        throw new Error('All Hive-Engine RPC endpoints failed. Please try again later.');
    }

    const rpc = getHiveEngineRpc();
    const apiUrl = rpc.endsWith('/contracts')
        ? rpc
        : `${rpc.replace(/\/$/, '')}/contracts`;

    const body = { jsonrpc: '2.0', id: Date.now(), method, params };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || 'RPC error');
        return json.result;
    } catch (err) {
        clearTimeout(timer);
        const isNetworkErr =
            err.name === 'AbortError' || err.name === 'TypeError' ||
            err.message.includes('NetworkError') || err.message.includes('Failed to fetch') ||
            err.message.includes('Load failed') || err.message.includes('HTTP 5');
        if (isNetworkErr) {
            console.warn(`[HiveSwapBee] RPC ${rpc} failed (attempt ${attempt + 1}): ${err.message}`);
            rotateRpc();
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            return sscCall(method, params, attempt + 1);
        }
        throw err;
    }
}

/* ── Market Pools ── */
export async function findPools(limit = 1000, offset = 0) {
    return sscCall('find', { contract: 'marketpools', table: 'pools', query: {}, limit, offset });
}
export async function findPool(tokenPair) {
    const r = await sscCall('find', { contract: 'marketpools', table: 'pools', query: { tokenPair }, limit: 1, offset: 0 });
    return r?.[0] || null;
}
export async function findLiquidityPositions(tokenPair, limit = 1000, offset = 0) {
    return sscCall('find', { contract: 'marketpools', table: 'liquidityPositions', query: { tokenPair }, limit, offset });
}
export async function findUserPositions(account, limit = 1000) {
    return sscCall('find', { contract: 'marketpools', table: 'liquidityPositions', query: { account }, limit, offset: 0 });
}

/* ── Tokens ── */
export async function getTokenInfo(symbol) {
    const r = await sscCall('find', { contract: 'tokens', table: 'tokens', query: { symbol }, limit: 1, offset: 0 });
    return r?.[0] || null;
}
export async function getTokenInfoBatch(symbols) {
    return sscCall('find', { contract: 'tokens', table: 'tokens', query: { symbol: { $in: symbols } }, limit: 1000, offset: 0 });
}
export async function getTokenBalance(account, symbol) {
    const r = await sscCall('find', { contract: 'tokens', table: 'balances', query: { account, symbol }, limit: 1, offset: 0 });
    return r?.[0] || null;
}
export async function getAccountBalances(account, limit = 1000) {
    return sscCall('find', { contract: 'tokens', table: 'balances', query: { account }, limit, offset: 0 });
}

/* ── Distribution ── */
/**
 * Fetch all active pool distribution batches.
 * strategy='pool', active=true, numTicksLeft > 0
 */
export async function findDistributionBatches(limit = 1000) {
    return sscCall('find', {
        contract: 'distribution',
        table: 'batches',
        query: { strategy: 'pool', active: true },
        limit,
        offset: 0,
    });
}

/* ── Metrics ── */
export async function getMarketPoolsParams() {
    const r = await sscCall('find', { contract: 'marketpools', table: 'params', query: {}, limit: 1, offset: 0 });
    return r?.[0] || null;
}
export async function getPoolCount() {
    const pools = await findPools(1000, 0);
    return pools?.length || 0;
}
export async function findMetrics(limit = 1000, offset = 0) {
    return sscCall('find', { contract: 'market', table: 'metrics', query: {}, limit, offset });
}