import { useState, useEffect, useCallback, useRef } from 'react';
import { findPools, findPool, findLiquidityPositions, findUserPositions, getTokenInfoBatch } from '../api/hiveEngine';

const TRIBALDEX_API = 'https://info-api.tribaldex.com/pools';

/**
 * Fetch pool stats from tribaldex info API.
 * Returns a map of tokenPair -> { volumeUSD, feeUSD, liquidityUSD, apr }
 * apr is annualised: (feeUSD / liquidityUSD) * (365 / days) * 100
 */
async function fetchVolumeData(days) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch(`${TRIBALDEX_API}?days=${days}`, {
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
            console.warn(`[HiveSwapBee] tribaldex API returned ${res.status}`);
            return null;
        }

        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            console.warn('[HiveSwapBee] tribaldex returned non-array or empty:', data);
            return null;
        }

        const map = {};
        for (const item of data) {
            const pair = item.pair ?? item.tokenPair ?? item.token_pair ?? null;
            if (!pair) continue;

            const volumeUSD = parseFloat(item.totalVolumeUSD) || 0;
            const feeUSD = parseFloat(item.totalFeeUSD) || 0;
            const liquidityUSD = parseFloat(item.totalLiquidityUSD) || 0;

            // Annualised APR: fees earned over `days` projected to 365 days
            const apr = liquidityUSD > 0
                ? (feeUSD / liquidityUSD) * (365 / days) * 100
                : 0;

            map[pair] = { volumeUSD, feeUSD, liquidityUSD, apr };
        }

        if (Object.keys(map).length === 0) {
            console.warn('[HiveSwapBee] tribaldex: parsed 0 entries');
            return null;
        }

        console.info(`[HiveSwapBee] tribaldex: ${Object.keys(map).length} pools loaded (${days}d)`);
        return map;
    } catch (err) {
        clearTimeout(timer);
        console.warn('[HiveSwapBee] tribaldex fetch failed:', err.message);
        return null;
    }
}

/**
 * Hook to fetch and cache all pools with token metadata + USD stats.
 *
 * Exposed:
 *   pools        – raw pool array from hive-engine
 *   tokenMap     – symbol -> token metadata
 *   volumeMap    – tokenPair -> { volumeUSD, feeUSD, liquidityUSD, apr } | null
 *   volumeDays   – selected period (1 | 3 | 7 | 30)
 *   setVolumeDays – setter
 *   volumeSource – 'tribaldex' | 'fallback' | 'loading'
 *   loading      – true while pools are loading
 *   error        – error message if pool fetch failed
 *   refetch      – re-fetch everything
 */
export function usePools() {
    const [pools, setPools] = useState([]);
    const [tokenMap, setTokenMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [volumeDays, setVolumeDays] = useState(1);
    const [volumeMap, setVolumeMap] = useState(null);
    const [volumeSource, setVolumeSource] = useState('loading');

    const poolsLoadedRef = useRef(false);

    // ── Pool fetch (hive-engine) ─────────────────────────────────────────
    const fetchPools = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const rawPools = await findPools(1000, 0);
            if (!rawPools) { setPools([]); return; }

            const symbols = new Set();
            for (const pool of rawPools) {
                const [base, quote] = pool.tokenPair.split(':');
                symbols.add(base);
                symbols.add(quote);
            }

            const tokensArr = await getTokenInfoBatch([...symbols]);
            const tMap = {};
            if (tokensArr) {
                for (const t of tokensArr) tMap[t.symbol] = t;
            }

            setTokenMap(tMap);
            setPools(rawPools);
            poolsLoadedRef.current = true;
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Volume/fee/APR fetch (tribaldex) ─────────────────────────────────
    const fetchVolume = useCallback(async (days) => {
        setVolumeSource('loading');
        const map = await fetchVolumeData(days);
        if (map && Object.keys(map).length > 0) {
            setVolumeMap(map);
            setVolumeSource('tribaldex');
        } else {
            setVolumeMap(null);
            setVolumeSource('fallback');
        }
    }, []);

    useEffect(() => { fetchPools(); }, [fetchPools]);
    useEffect(() => { fetchVolume(volumeDays); }, [volumeDays, fetchVolume]);

    const refetch = useCallback(() => {
        fetchPools();
        fetchVolume(volumeDays);
    }, [fetchPools, fetchVolume, volumeDays]);

    return { pools, tokenMap, volumeMap, volumeDays, setVolumeDays, volumeSource, loading, error, refetch };
}

/**
 * Hook to fetch a single pool and its liquidity positions.
 */
export function usePoolDetail(tokenPair) {
    const [pool, setPool] = useState(null);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDetail = useCallback(async () => {
        if (!tokenPair) return;
        try {
            setLoading(true);
            setError(null);
            const [poolData, positionsData] = await Promise.all([
                findPool(tokenPair),
                findLiquidityPositions(tokenPair, 1000, 0),
            ]);
            setPool(poolData);
            setPositions(positionsData || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [tokenPair]);

    useEffect(() => { fetchDetail(); }, [fetchDetail]);

    return { pool, positions, loading, error, refetch: fetchDetail };
}

/**
 * Hook for user LP positions
 */
export function useUserPositions(account) {
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!account) { setPositions([]); return; }
        setLoading(true);
        findUserPositions(account)
            .then((data) => setPositions(data || []))
            .catch(() => setPositions([]))
            .finally(() => setLoading(false));
    }, [account]);

    return { positions, loading };
}