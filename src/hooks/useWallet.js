import { useState, useEffect, useCallback } from 'react';
import { getAccountBalances, getTokenInfoBatch, findUserPositions, findPools } from '../api/hiveEngine';

const TRIBALDEX_API = 'https://info-api.tribaldex.com/pools';

// ── Module-level caches ───────────────────────────────────────────────────
const WALLET_TTL = 5 * 60 * 1000;  // 5 min
const POOL_TTL = 10 * 60 * 1000;  // 10 min
const PRICE_TTL = 12 * 60 * 1000;  // 12 min

const _walletCache = {};             // account → { data, ts }
let _poolCache = { data: null, ts: 0 };
let _priceCache = { data: null, ts: 0 };

// ── Price fetcher (tribaldex, read-only) ──────────────────────────────────
async function fetchPrices() {
    const now = Date.now();
    if (_priceCache.data && now - _priceCache.ts < PRICE_TTL) return _priceCache.data;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${TRIBALDEX_API}?days=1`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return _priceCache.data || {};
        const raw = await res.json();
        const map = {};
        for (const item of raw || []) {
            const pair = item.pair ?? item.tokenPair ?? null;
            if (!pair) continue;
            const [base, quote] = pair.split(':');
            if (base && item.basePriceUSD) map[base] = parseFloat(item.basePriceUSD);
            if (quote && item.quotePriceUSD) map[quote] = parseFloat(item.quotePriceUSD);
        }
        _priceCache = { data: map, ts: now };
        return map;
    } catch {
        return _priceCache.data || {};
    }
}

// ── Pool map fetcher (symbol → [tokenPair]) ───────────────────────────────
async function fetchPoolMap() {
    const now = Date.now();
    if (_poolCache.data && now - _poolCache.ts < POOL_TTL) return _poolCache.data;
    try {
        const pools = await findPools(1000, 0);
        const map = {};
        for (const p of pools || []) {
            const [base, quote] = p.tokenPair.split(':');
            if (!map[base]) map[base] = [];
            if (!map[quote]) map[quote] = [];
            map[base].push(p.tokenPair);
            map[quote].push(p.tokenPair);
        }
        _poolCache = { data: map, ts: now };
        return map;
    } catch {
        return _poolCache.data || {};
    }
}

// ── Main wallet fetch ─────────────────────────────────────────────────────
/**
 * getAccountBalances returns one row per token with ALL balance fields:
 *   balance, stake, pendingUnstake,
 *   delegationsIn, delegationsOut, pendingUndelegations
 *
 * We use that single call instead of 4 separate ones.
 */
async function fetchWalletData(account) {
    const now = Date.now();
    const cached = _walletCache[account];
    if (cached && now - cached.ts < WALLET_TTL) return cached.data;

    // Three parallel fetches: balances (all-in-one), prices, pool set, LP positions
    const [balances, prices, poolMap, lpPositions] = await Promise.all([
        getAccountBalances(account).catch(() => []),
        fetchPrices(),
        fetchPoolMap(),
        findUserPositions(account).catch(() => []),
    ]);

    // Batch-fetch token metadata (stakingEnabled, delegationEnabled, name, precision)
    const symbols = (balances || []).map((b) => b.symbol);
    const tokenMeta = await getTokenInfoBatch(symbols).catch(() => []);
    const metaMap = {};
    for (const t of tokenMeta || []) metaMap[t.symbol] = t;

    // Build token rows from the single balances response
    const tokens = (balances || [])
        .map((b) => {
            const meta = metaMap[b.symbol] || {};
            const liquid = parseFloat(b.balance) || 0;
            const staked = parseFloat(b.stake) || 0;
            const pendingUnstake = parseFloat(b.pendingUnstake) || 0;
            const delegatedIn = parseFloat(b.delegationsIn) || 0;
            const delegatedOut = parseFloat(b.delegationsOut) || 0;
            // pendingUndelegations = in-flight undelegations (returning to staked soon)
            const pendingUndel = parseFloat(b.pendingUndelegations) || 0;

            const price = prices[b.symbol] ?? 0;
            // Total "owned" value: liquid + staked + delegated out + unstaking
            const totalValue = (liquid + staked + delegatedOut + pendingUnstake) * price;

            return {
                symbol: b.symbol,
                name: meta.name || b.symbol,
                precision: meta.precision ?? 8,
                stakingEnabled: meta.stakingEnabled || false,
                delegationEnabled: meta.delegationEnabled || false,
                liquid,
                staked,
                pendingUnstake,
                delegatedIn,
                delegatedOut,
                pendingUndel,
                price,
                totalValue,
                hasPool: !!(poolMap[b.symbol]?.length),
                poolPairs: poolMap[b.symbol] || [],
            };
        })
        // Only show tokens where the user actually has something
        .filter((t) =>
            t.liquid > 0 || t.staked > 0 || t.delegatedOut > 0 ||
            t.delegatedIn > 0 || t.pendingUnstake > 0 || t.pendingUndel > 0
        )
        // Rank by USD value descending; zero-value tokens go to the bottom
        .sort((a, b) => b.totalValue - a.totalValue);

    const totalValueUsd = tokens.reduce((s, t) => s + t.totalValue, 0);

    const data = { tokens, lpPositions: lpPositions || [], totalValueUsd, fetchedAt: now };
    _walletCache[account] = { data, ts: now };
    return data;
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useWallet(account) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const load = useCallback(async (forceRefresh = false) => {
        if (!account) { setData(null); return; }
        if (forceRefresh) delete _walletCache[account];
        setLoading(true);
        setError(null);
        try {
            const result = await fetchWalletData(account);
            setData(result);
            setLastUpdated(result.fetchedAt);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [account]);

    useEffect(() => { load(); }, [load]);

    const refetch = useCallback(() => load(true), [load]);

    return { data, loading, error, lastUpdated, refetch };
}