import { useState, useEffect, useCallback, useRef } from 'react';
import { findPools, findPool, findLiquidityPositions, findUserPositions, getTokenInfoBatch, findDistributionBatches } from '../api/hiveEngine';

const TRIBALDEX_API = 'https://info-api.tribaldex.com/pools';

// ── Module-level caches ───────────────────────────────────────────────────
// Tribaldex: keyed by days, 12-minute TTL — avoids hammering their API
const VOLUME_TTL = 12 * 60 * 1000;
const _volumeCache = {}; // { [days]: { data: {volumeMap, tokenPriceMap}, ts } }

// Distribution: 10-minute TTL
const DISTRO_TTL = 10 * 60 * 1000;
let _distroCache = { data: null, ts: 0 };

// User positions: 3-minute TTL (lighter, per-user)
const USER_POS_TTL = 3 * 60 * 1000;
const _userPosCache = {}; // { [account]: { data: [], ts } }

// ── calcDistroStats (exported for use in PoolTable/PoolDetailModal) ────────
/**
 * Calculate distribution stats for a pool's active batches.
 * ~1 tick per 24h based on lastTickTime analysis.
 */
export function calcDistroStats(batches, tokenPriceMap, liquidityUSD) {
    const TICKS_PER_DAY = 1;
    let dailyUSD = 0;
    const dailyByToken = {};

    for (const batch of batches || []) {
        const ticksLeft = parseInt(batch.numTicksLeft) || 0;
        if (ticksLeft <= 0) continue;
        for (const tb of batch.tokenBalances || []) {
            const price = tokenPriceMap?.[tb.symbol] ?? 0;
            const totalQty = parseFloat(tb.quantity) || 0;
            const dailyQty = (totalQty / ticksLeft) * TICKS_PER_DAY;
            dailyByToken[tb.symbol] = (dailyByToken[tb.symbol] || 0) + dailyQty;
            if (price > 0) dailyUSD += dailyQty * price;
        }
    }

    const annualUSD = dailyUSD * 365;
    const apr = (liquidityUSD > 0 && annualUSD > 0)
        ? (annualUSD / liquidityUSD) * 100
        : 0;

    return { dailyUSD, annualUSD, apr, dailyByToken };
}

// ── Tribaldex fetch (with per-days cache) ─────────────────────────────────
async function fetchVolumeData(days) {
    const now = Date.now();
    const cached = _volumeCache[days];
    if (cached && now - cached.ts < VOLUME_TTL) {
        console.info(`[HiveSwapBee] tribaldex cache hit (${days}d)`);
        return cached.data;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch(`${TRIBALDEX_API}?days=${days}`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) { console.warn(`[HiveSwapBee] tribaldex HTTP ${res.status}`); return cached?.data || null; }

        const raw = await res.json();
        if (!Array.isArray(raw) || raw.length === 0) return cached?.data || null;

        const volumeMap = {};
        const tokenPriceMap = {};

        for (const item of raw) {
            const pair = item.pair ?? item.tokenPair ?? item.token_pair ?? null;
            if (!pair) continue;

            const [base, quote] = pair.split(':');
            if (base && item.basePriceUSD) tokenPriceMap[base] = parseFloat(item.basePriceUSD);
            if (quote && item.quotePriceUSD) tokenPriceMap[quote] = parseFloat(item.quotePriceUSD);

            const volumeUSD = parseFloat(item.totalVolumeUSD) || 0;
            const feeUSD = parseFloat(item.totalFeeUSD) || 0;
            const liquidityUSD = parseFloat(item.totalLiquidityUSD) || 0;
            const apr = liquidityUSD > 0 ? (feeUSD / liquidityUSD) * (365 / days) * 100 : 0;

            volumeMap[pair] = { volumeUSD, feeUSD, liquidityUSD, apr };
        }

        if (!Object.keys(volumeMap).length) return cached?.data || null;

        const data = { volumeMap, tokenPriceMap };
        _volumeCache[days] = { data, ts: now };
        console.info(`[HiveSwapBee] tribaldex fetched: ${Object.keys(volumeMap).length} pools, ${Object.keys(tokenPriceMap).length} prices (${days}d)`);
        return data;
    } catch (err) {
        clearTimeout(timer);
        console.warn('[HiveSwapBee] tribaldex fetch failed:', err.message);
        // Return stale cache if available rather than nothing
        return cached?.data || null;
    }
}

// ── Distribution fetch (with cache) ──────────────────────────────────────
async function fetchDistros() {
    const now = Date.now();
    if (_distroCache.data && now - _distroCache.ts < DISTRO_TTL) {
        return _distroCache.data;
    }
    try {
        const batches = await findDistributionBatches();
        const map = {};
        for (const b of batches || []) {
            if (!b.tokenPair || !b.active || parseInt(b.numTicksLeft) <= 0) continue;
            if (!map[b.tokenPair]) map[b.tokenPair] = [];
            map[b.tokenPair].push(b);
        }
        _distroCache = { data: map, ts: now };
        console.info(`[HiveSwapBee] distributions: ${Object.keys(map).length} active pools`);
        return map;
    } catch (err) {
        console.warn('[HiveSwapBee] distribution fetch failed:', err.message);
        return _distroCache.data || {};
    }
}

// ── User positions fetch (with cache) ────────────────────────────────────
/**
 * Exported so PoolTable can call it directly.
 * Returns array of position objects: { tokenPair, shares, account }
 */
export async function fetchUserPositionsCached(account) {
    if (!account) return [];
    const now = Date.now();
    const cached = _userPosCache[account];
    if (cached && now - cached.ts < USER_POS_TTL) {
        console.info(`[HiveSwapBee] user positions cache hit (@${account})`);
        return cached.data;
    }
    try {
        const data = await findUserPositions(account);
        _userPosCache[account] = { data: data || [], ts: now };
        return data || [];
    } catch (err) {
        console.warn(`[HiveSwapBee] user positions fetch failed:`, err.message);
        return cached?.data || [];
    }
}

// ── usePools hook ─────────────────────────────────────────────────────────
export function usePools() {
    const [pools, setPools] = useState([]);
    const [tokenMap, setTokenMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [volumeDays, setVolumeDays] = useState(1);
    const [volumeMap, setVolumeMap] = useState(null);
    const [tokenPriceMap, setTokenPriceMap] = useState({});
    const [volumeSource, setVolumeSource] = useState('loading');

    const [distroMap, setDistroMap] = useState({});

    const poolsLoadedRef = useRef(false);

    const fetchPools = useCallback(async () => {
        try {
            setLoading(true); setError(null);
            const rawPools = await findPools(1000, 0);
            if (!rawPools) { setPools([]); return; }

            const symbols = new Set();
            for (const pool of rawPools) {
                const [b, q] = pool.tokenPair.split(':');
                symbols.add(b); symbols.add(q);
            }
            const tokensArr = await getTokenInfoBatch([...symbols]);
            const tMap = {};
            if (tokensArr) for (const t of tokensArr) tMap[t.symbol] = t;
            setTokenMap(tMap);
            setPools(rawPools);
            poolsLoadedRef.current = true;
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchVolume = useCallback(async (days) => {
        setVolumeSource('loading');
        const result = await fetchVolumeData(days);
        if (result?.volumeMap && Object.keys(result.volumeMap).length > 0) {
            setVolumeMap(result.volumeMap);
            setTokenPriceMap(result.tokenPriceMap || {});
            setVolumeSource('tribaldex');
        } else {
            setVolumeMap(null);
            setTokenPriceMap({});
            setVolumeSource('fallback');
        }
    }, []);

    const fetchDistributions = useCallback(async () => {
        const map = await fetchDistros();
        setDistroMap(map || {});
    }, []);

    useEffect(() => { fetchPools(); fetchDistributions(); }, [fetchPools, fetchDistributions]);
    useEffect(() => { fetchVolume(volumeDays); }, [volumeDays, fetchVolume]);

    const refetch = useCallback(() => {
        fetchPools();
        // Force cache clear for current period only
        delete _volumeCache[volumeDays];
        fetchVolume(volumeDays);
        _distroCache = { data: null, ts: 0 };
        fetchDistributions();
    }, [fetchPools, fetchVolume, fetchDistributions, volumeDays]);

    return {
        pools, tokenMap,
        volumeMap, volumeDays, setVolumeDays, volumeSource,
        tokenPriceMap,
        distroMap,
        loading, error, refetch,
    };
}

// ── usePoolDetail ─────────────────────────────────────────────────────────
export function usePoolDetail(tokenPair) {
    const [pool, setPool] = useState(null);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDetail = useCallback(async () => {
        if (!tokenPair) return;
        try {
            setLoading(true); setError(null);
            const [poolData, posData] = await Promise.all([
                findPool(tokenPair),
                findLiquidityPositions(tokenPair, 1000, 0),
            ]);
            setPool(poolData);
            setPositions(posData || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [tokenPair]);

    useEffect(() => { fetchDetail(); }, [fetchDetail]);
    return { pool, positions, loading, error, refetch: fetchDetail };
}

// ── useUserPositions ──────────────────────────────────────────────────────
export function useUserPositions(account) {
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!account) { setPositions([]); return; }
        setLoading(true);
        fetchUserPositionsCached(account)
            .then((d) => setPositions(d || []))
            .catch(() => setPositions([]))
            .finally(() => setLoading(false));
    }, [account]);

    return { positions, loading };
}