import { useState, useEffect, useCallback, useRef } from 'react';
import { findPools, findPool, findLiquidityPositions, findUserPositions, getTokenInfoBatch, findDistributionBatches } from '../api/hiveEngine';

const TRIBALDEX_API = 'https://info-api.tribaldex.com/pools';

// ── Distribution cache (module-level, 5 min TTL) ────────────────────────
let _distroCache = { data: null, ts: 0 };
const DISTRO_TTL = 5 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Calculate distribution stats for a pool's active batches.
 * Based on Hive-Engine data analysis: distributions tick ~once per 24h.
 *
 * @param {Array}  batches       – active distribution batches for this pool
 * @param {Object} tokenPriceMap – symbol → USD price
 * @param {number} liquidityUSD  – pool liquidity in USD (from tribaldex)
 * @returns {{ dailyUSD, annualUSD, apr, dailyByToken }}
 */
export function calcDistroStats(batches, tokenPriceMap, liquidityUSD) {
    const TICKS_PER_DAY = 1; // confirmed ~1 tick/24h from lastTickTime analysis

    let dailyUSD = 0;
    const dailyByToken = {}; // symbol → qty per day

    for (const batch of batches || []) {
        const ticksLeft = parseInt(batch.numTicksLeft) || 0;
        if (ticksLeft <= 0) continue;

        for (const tb of batch.tokenBalances || []) {
            const price = tokenPriceMap?.[tb.symbol] ?? 0;
            const totalQty = parseFloat(tb.quantity) || 0;
            // Remaining balance spread over remaining ticks
            const qtyPerTick = totalQty / ticksLeft;

            const dailyQty = qtyPerTick * TICKS_PER_DAY;
            dailyByToken[tb.symbol] = (dailyByToken[tb.symbol] || 0) + dailyQty;

            if (price > 0) {
                dailyUSD += dailyQty * price;
            }
        }
    }

    const annualUSD = dailyUSD * 365;
    const apr = (liquidityUSD > 0 && annualUSD > 0)
        ? (annualUSD / liquidityUSD) * 100
        : 0;

    return { dailyUSD, annualUSD, apr, dailyByToken };
}

// ── Tribaldex fetch (volume + token prices) ─────────────────────────────

async function fetchVolumeData(days) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch(`${TRIBALDEX_API}?days=${days}`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) { console.warn(`[HiveSwapBee] tribaldex ${res.status}`); return null; }

        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;

        const volumeMap = {};
        const tokenPriceMap = {};

        for (const item of data) {
            const pair = item.pair ?? item.tokenPair ?? item.token_pair ?? null;
            if (!pair) continue;

            // Token prices (basePriceUSD / quotePriceUSD from tribaldex)
            const [base, quote] = pair.split(':');
            if (base && item.basePriceUSD) tokenPriceMap[base] = parseFloat(item.basePriceUSD);
            if (quote && item.quotePriceUSD) tokenPriceMap[quote] = parseFloat(item.quotePriceUSD);

            const volumeUSD = parseFloat(item.totalVolumeUSD) || 0;
            const feeUSD = parseFloat(item.totalFeeUSD) || 0;
            const liquidityUSD = parseFloat(item.totalLiquidityUSD) || 0;
            const apr = liquidityUSD > 0 ? (feeUSD / liquidityUSD) * (365 / days) * 100 : 0;

            volumeMap[pair] = { volumeUSD, feeUSD, liquidityUSD, apr };
        }

        if (!Object.keys(volumeMap).length) return null;
        console.info(`[HiveSwapBee] tribaldex: ${Object.keys(volumeMap).length} pools, ${Object.keys(tokenPriceMap).length} prices (${days}d)`);
        return { volumeMap, tokenPriceMap };
    } catch (err) {
        clearTimeout(timer);
        console.warn('[HiveSwapBee] tribaldex fetch failed:', err.message);
        return null;
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

    // ── Pool fetch ───────────────────────────────────────────────────────
    const fetchPools = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
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

    // ── Volume + prices fetch ────────────────────────────────────────────
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

    // ── Distribution fetch ───────────────────────────────────────────────
    const fetchDistributions = useCallback(async () => {
        const map = await fetchDistros();
        setDistroMap(map || {});
    }, []);

    useEffect(() => { fetchPools(); fetchDistributions(); }, [fetchPools, fetchDistributions]);
    useEffect(() => { fetchVolume(volumeDays); }, [volumeDays, fetchVolume]);

    const refetch = useCallback(() => {
        fetchPools();
        fetchVolume(volumeDays);
        // Force distro re-fetch by clearing cache
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
        findUserPositions(account)
            .then((d) => setPositions(d || []))
            .catch(() => setPositions([]))
            .finally(() => setLoading(false));
    }, [account]);

    return { positions, loading };
}