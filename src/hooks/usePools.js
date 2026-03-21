import { useState, useEffect, useCallback } from 'react';
import { findPools, findPool, findLiquidityPositions, findUserPositions, getTokenInfoBatch } from '../api/hiveEngine';

/**
 * Hook to fetch and cache all pools with token metadata.
 */
export function usePools() {
    const [pools, setPools] = useState([]);
    const [tokenMap, setTokenMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchPools = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const rawPools = await findPools(1000, 0);
            if (!rawPools) {
                setPools([]);
                return;
            }

            // Collect unique token symbols
            const symbols = new Set();
            for (const pool of rawPools) {
                const [base, quote] = pool.tokenPair.split(':');
                symbols.add(base);
                symbols.add(quote);
            }

            // Fetch token metadata
            const tokensArr = await getTokenInfoBatch([...symbols]);
            const tMap = {};
            if (tokensArr) {
                for (const t of tokensArr) {
                    tMap[t.symbol] = t;
                }
            }
            setTokenMap(tMap);
            setPools(rawPools);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPools();
    }, [fetchPools]);

    return { pools, tokenMap, loading, error, refetch: fetchPools };
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

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);

    return { pool, positions, loading, error, refetch: fetchDetail };
}

/**
 * Hook for user LP positions
 */
export function useUserPositions(account) {
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!account) {
            setPositions([]);
            return;
        }
        setLoading(true);
        findUserPositions(account)
            .then((data) => setPositions(data || []))
            .catch(() => setPositions([]))
            .finally(() => setLoading(false));
    }, [account]);

    return { positions, loading };
}
