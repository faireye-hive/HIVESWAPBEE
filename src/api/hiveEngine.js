import { cachedRead, invalidateCache, writeCache } from '../lib/readCache.js';

// Hive-Engine nodes. Health checks run only when the user clicks Check nodes.
export const HIVE_ENGINE_RPCS = [
    'https://api.hive-engine.com/rpc',
    'https://enginerpc.com',
    'https://herpc.dtools.dev',
    'https://api.primersion.com',
    'https://herpc.kanibot.com',
    'https://herpc.actifit.io',
    'https://engine.thecrazygm.com',
    'https://herpc.filoz.info',
    'https://herpc.liotes.com',
    'https://engine.hive.pizza',
    'https://he.sourov.dev',
];

export const DEFAULT_HIVE_ENGINE_RPC = HIVE_ENGINE_RPCS[0];

const STORAGE_KEY = 'hiveswapbee_he_rpc';
const PROBE_KEY = 'hiveswapbee_rpc_probe';
const FAIL_COOLDOWN_MS = 60 * 1000;
// One saved node, then at most two others, for that call only.
const MAX_FAILOVER = 2;

const cooldown = new Map();
let sessionFallback = null;

export function normalizeRpc(url) {
    return String(url || '').trim().replace(/\/+$/, '');
}

export function getSavedHiveEngineRpc() {
    return normalizeRpc(localStorage.getItem(STORAGE_KEY)) || DEFAULT_HIVE_ENGINE_RPC;
}

export function getHiveEngineRpc() {
    const saved = getSavedHiveEngineRpc();
    if (Date.now() < (cooldown.get(saved) || 0) && sessionFallback) return sessionFallback;
    return saved;
}

export function setHiveEngineRpc(url) {
    const next = normalizeRpc(url) || DEFAULT_HIVE_ENGINE_RPC;
    localStorage.setItem(STORAGE_KEY, next);
    sessionFallback = null;
    cooldown.delete(next);
}

function markDown(url) {
    const failed = normalizeRpc(url);
    cooldown.set(failed, Date.now() + FAIL_COOLDOWN_MS);
    const next = HIVE_ENGINE_RPCS
        .map(normalizeRpc)
        .find((item) => item !== failed && Date.now() >= (cooldown.get(item) || 0));
    if (next) sessionFallback = next;
}

export function contractsUrl(rpc) {
    const base = normalizeRpc(rpc);
    return base.endsWith('/contracts') ? base : `${base}/contracts`;
}

export function readRpcProbe() {
    try {
        return JSON.parse(sessionStorage.getItem(PROBE_KEY) || '{}');
    } catch {
        return {};
    }
}

export function writeRpcProbe(data) {
    sessionStorage.setItem(PROBE_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event('hiveswapbee:rpc-status'));
}

/** One cheap read. No retry. Used only by the manual node check. */
export async function probeHiveEngineRpc(baseUrl, timeoutMs = 5000, signal) {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
        const res = await fetch(contractsUrl(baseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'find',
                params: {
                    contract: 'tokens',
                    table: 'tokens',
                    query: { symbol: 'BEE' },
                    limit: 1,
                    offset: 0,
                },
            }),
            signal: controller.signal,
        });
        const ms = Math.round(performance.now() - started);
        if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}` };
        const json = await res.json();
        if (json.error || !Array.isArray(json.result)) return { ok: false, ms, error: 'bad response' };
        return { ok: true, ms };
    } catch (err) {
        return {
            ok: false,
            ms: Math.round(performance.now() - started),
            error: err.name === 'AbortError' ? 'timeout' : 'unreachable',
        };
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

function readTtl(params) {
    const table = `${params?.contract}:${params?.table}`;
    if (table === 'marketpools:pools') return params.query?.tokenPair ? 12000 : 30000;
    if (table === 'market:metrics') return params.query?.symbol ? 15000 : 60000;
    const ttl = {
        'tokens:tokens': 10 * 60 * 1000,
        'tokens:balances': 12000,
        'marketpools:params': 10 * 60 * 1000,
        'marketpools:liquidityPositions': 60000,
        'market:sellBook': 12000,
        'market:buyBook': 12000,
        'market:tradesHistory': 20000,
        'distribution:batches': 5 * 60 * 1000,
    };
    return ttl[table] || 0;
}

function engineCacheKey(params) {
    return [
        'he',
        normalizeRpc(getSavedHiveEngineRpc()),
        params.contract,
        params.table,
        JSON.stringify(params.query || {}),
        params.limit || '',
        params.offset || 0,
        JSON.stringify(params.indexes || ''),
    ].join(':');
}

/** Drop cached books, pools and balances after a broadcast. */
export function invalidateMarketReads() {
    invalidateCache((key) => /sellBook|buyBook|tradesHistory|balances|marketpools:pools|metrics/.test(key));
}

async function sscCall(method, params, attempt = 0, fresh = false) {
    if (attempt === 0 && method === 'find' && !fresh) {
        const ttl = readTtl(params);
        if (ttl > 0) {
            return cachedRead(engineCacheKey(params), ttl, () => sscCall(method, params, 0, true));
        }
    }
    if (attempt > MAX_FAILOVER) {
        throw new Error('Hive-Engine RPC failed. Open RPC and pick another node.');
    }

    const rpc = getHiveEngineRpc();
    const body = { jsonrpc: '2.0', id: Date.now(), method, params };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch(contractsUrl(rpc), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || 'RPC error');
        if (method === 'find' && readTtl(params) > 0) writeCache(engineCacheKey(params), json.result);
        return json.result;
    } catch (err) {
        clearTimeout(timer);
        const isNetworkErr =
            err.name === 'AbortError' || err.name === 'TypeError' ||
            err.message.includes('NetworkError') || err.message.includes('Failed to fetch') ||
            err.message.includes('Load failed') || err.message.includes('HTTP 5');
        if (isNetworkErr) {
            markDown(rpc);
            return sscCall(method, params, attempt + 1, fresh);
        }
        throw err;
    }
}

/* ── Market Pools ── */
export async function findPools(limit = 1000, offset = 0) {
    return sscCall('find', { contract: 'marketpools', table: 'pools', query: {}, limit, offset });
}
export async function findPool(tokenPair, fresh = false) {
    const r = await sscCall('find', { contract: 'marketpools', table: 'pools', query: { tokenPair }, limit: 1, offset: 0 }, 0, fresh);
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
export async function getTokenBalance(account, symbol, fresh = false) {
    const r = await sscCall('find', { contract: 'tokens', table: 'balances', query: { account, symbol }, limit: 1, offset: 0 }, 0, fresh);
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
export async function getMarketMetric(symbol, fresh = false) {
    const rows = await sscCall('find', {
        contract: 'market', table: 'metrics', query: { symbol }, limit: 1, offset: 0,
    }, 0, fresh);
    return rows?.[0] || null;
}
/* ── Market metrics (price change) ── */
// Returns all market metric rows with priceChangePercent, lastPrice, etc.
export async function getMarketMetrics(limit = 1000, offset = 0) {
    return sscCall('find', {
        contract: 'market',
        table: 'metrics',
        query: {},
        limit,
        offset,
    });
}

/* ── Token metadata paginated (for precision, staking info etc) ── */
export async function getAllTokensMeta(limit = 1000, offset = 0) {
    return sscCall('find', {
        contract: 'tokens',
        table: 'tokens',
        query: {},
        limit,
        offset,
    });
}

/** Walk a table until a short page comes back. Hive-Engine caps a find at 1000 rows. */
export async function findAllPages(contract, table, query = {}, maxPages = 4) {
    const pageSize = 1000;
    const all = [];
    for (let page = 0; page < maxPages; page += 1) {
        const batch = await sscCall('find', {
            contract,
            table,
            query,
            limit: pageSize,
            offset: page * pageSize,
        });
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < pageSize) break;
    }
    return all;
}

/** Token metadata in small batches. A single huge `$in` query gets rejected. */
export async function getTokenInfoChunked(symbols) {
    const unique = [...new Set((symbols || []).filter(Boolean))];
    const size = 80;
    const chunks = [];
    for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
    const parts = await Promise.all(chunks.map((c) => getTokenInfoBatch(c).catch(() => [])));
    return parts.flat().filter(Boolean);
}

export async function getSellBook(symbol, limit = 50, fresh = false) {
    return sscCall('find', {
        contract: 'market',
        table: 'sellBook',
        query: { symbol },
        limit,
        offset: 0,
        indexes: [{ index: 'priceDec', descending: false }],
    }, 0, fresh);
}

export async function getBuyBook(symbol, limit = 50, fresh = false) {
    return sscCall('find', {
        contract: 'market',
        table: 'buyBook',
        query: { symbol },
        limit,
        offset: 0,
        indexes: [{ index: 'priceDec', descending: true }],
    }, 0, fresh);
}

export async function getTradesHistory(symbol, limit = 40, fresh = false) {
    const rows = await sscCall('find', {
        contract: 'market',
        table: 'tradesHistory',
        query: { symbol },
        limit,
        offset: 0,
    }, 0, fresh);
    return (rows || []).slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export async function getAccountOrders(account, symbol, fresh = false) {
    const [buys, sells] = await Promise.all([
        sscCall('find', {
            contract: 'market', table: 'buyBook', query: { account, symbol }, limit: 100, offset: 0,
        }, 0, fresh),
        sscCall('find', {
            contract: 'market', table: 'sellBook', query: { account, symbol }, limit: 100, offset: 0,
        }, 0, fresh),
    ]);
    return { buys: buys || [], sells: sells || [] };
}