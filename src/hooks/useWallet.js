import { useState, useEffect, useCallback } from 'react';
import {
    getAccountBalances, getTokenInfoBatch,
    findUserPositions, findPools,
    getMarketMetrics, getAllTokensMeta,
} from '../api/hiveEngine';

const TRIBALDEX_API = 'https://info-api.tribaldex.com/pools';

// ── Module-level caches ───────────────────────────────────────────────────
const WALLET_TTL = 5 * 60 * 1000;  // 5 min  — balances change often
const PRICE_TTL = 12 * 60 * 1000;  // 12 min — tribaldex prices
const POOL_TTL = 10 * 60 * 1000;  // 10 min — pool set
const METRICS_TTL = 15 * 60 * 1000;  // 15 min — % change, lastPrice
const META_TTL = 60 * 60 * 1000;  // 60 min — token precision/flags (rarely changes)

const _walletCache = {};
let _priceCache = { data: null, ts: 0 };
let _poolCache = { data: null, ts: 0 };
let _metricsCache = { data: null, ts: 0 };
let _metaCache = { data: null, ts: 0 };

// ── Tribaldex prices ──────────────────────────────────────────────────────
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
    } catch { return _priceCache.data || {}; }
}

// ── Pool map ──────────────────────────────────────────────────────────────
async function fetchPoolMap() {
    const now = Date.now();
    if (_poolCache.data && now - _poolCache.ts < POOL_TTL) return _poolCache.data;
    try {
        const pools = await findPools(1000, 0);
        const map = {};
        for (const p of pools || []) {
            const [b, q] = p.tokenPair.split(':');
            if (!map[b]) map[b] = [];
            if (!map[q]) map[q] = [];
            map[b].push(p.tokenPair);
            map[q].push(p.tokenPair);
        }
        _poolCache = { data: map, ts: now };
        return map;
    } catch { return _poolCache.data || {}; }
}

// ── Market metrics (% change, lastPrice) ─────────────────────────────────
// HE metrics table has: symbol, volume, volumeExpiration, lastPrice,
//   lowestAsk, highestBid, lastDayPrice, lastDayPriceExpiration, priceChangeHive, priceChangePercent
async function fetchMetrics() {
    const now = Date.now();
    if (_metricsCache.data && now - _metricsCache.ts < METRICS_TTL) return _metricsCache.data;
    try {
        // Fetch up to 2000 (paginate if needed — most instances have < 1000 tokens)
        const [page1, page2] = await Promise.all([
            getMarketMetrics(1000, 0).catch(() => []),
            getMarketMetrics(1000, 1000).catch(() => []),
        ]);
        const all = [...(page1 || []), ...(page2 || [])];
        const map = {};
        for (const m of all) {
            if (!m.symbol) continue;
            map[m.symbol] = {
                lastPrice: parseFloat(m.lastPrice) || 0,
                lastDayPrice: parseFloat(m.lastDayPrice) || 0,
                priceChangePercent: parseFloat(m.priceChangePercent) || null,
                volume: parseFloat(m.volume) || 0,
            };
        }
        _metricsCache = { data: map, ts: now };
        console.info(`[HiveSwapBee] market metrics: ${Object.keys(map).length} symbols`);
        return map;
    } catch { return _metricsCache.data || {}; }
}

// ── Token metadata (precision, flags) ────────────────────────────────────
async function fetchTokenMeta() {
    const now = Date.now();
    if (_metaCache.data && now - _metaCache.ts < META_TTL) return _metaCache.data;
    try {
        const [page1, page2] = await Promise.all([
            getAllTokensMeta(1000, 0).catch(() => []),
            getAllTokensMeta(1000, 1000).catch(() => []),
        ]);
        const all = [...(page1 || []), ...(page2 || [])];
        const map = {};
        for (const t of all) {
            if (!t.symbol) continue;
            map[t.symbol] = {
                name: t.name || t.symbol,
                precision: t.precision ?? 8,
                stakingEnabled: t.stakingEnabled || false,
                delegationEnabled: t.delegationEnabled || false,
            };
        }
        _metaCache = { data: map, ts: now };
        console.info(`[HiveSwapBee] token meta: ${Object.keys(map).length} tokens`);
        return map;
    } catch { return _metaCache.data || {}; }
}

// ── Smart decimal formatter ───────────────────────────────────────────────
// Exported so UserWallet can use it too
export function smartDec(num, precision) {
    const n = parseFloat(num);
    if (isNaN(n) || n === 0) return '0';
    const p = precision ?? 8;
    if (p === 0) return n.toFixed(0);
    if (p <= 2) return n.toFixed(2);
    if (p <= 4) return n.toFixed(4);
    // For high precision, trim trailing zeros up to 6 decimal places
    const s = n.toFixed(Math.min(p, 8));
    // Remove trailing zeros after decimal but keep at least 2
    const trimmed = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    const dotIdx = trimmed.indexOf('.');
    if (dotIdx === -1) return trimmed;
    const decimals = trimmed.length - dotIdx - 1;
    if (decimals < 2) return n.toFixed(2);
    return trimmed;
}

// ── Main wallet fetch ─────────────────────────────────────────────────────
async function fetchWalletData(account) {
    const now = Date.now();
    const cached = _walletCache[account];
    if (cached && now - cached.ts < WALLET_TTL) return cached.data;

    // Balances is the only "fresh" call — everything else from cache
    const [balances, prices, poolMap, metrics, tokenMeta, lpPositions] = await Promise.all([
        getAccountBalances(account).catch(() => []),
        fetchPrices(),
        fetchPoolMap(),
        fetchMetrics(),
        fetchTokenMeta(),
        findUserPositions(account).catch(() => []),
    ]);

    const tokens = (balances || [])
        .map((b) => {
            const meta = tokenMeta[b.symbol] || {};
            const m = metrics[b.symbol] || {};
            const prec = meta.precision ?? 8;

            const liquid = parseFloat(b.balance) || 0;
            const staked = parseFloat(b.stake) || 0;
            const pendingUnstake = parseFloat(b.pendingUnstake) || 0;
            const delegatedIn = parseFloat(b.delegationsIn) || 0;
            const delegatedOut = parseFloat(b.delegationsOut) || 0;
            const pendingUndel = parseFloat(b.pendingUndelegations) || 0;

            const price = prices[b.symbol] ?? 0;
            // Value = liquid + staked + delegated out (still yours) + pending unstake
            const totalValue = (liquid + staked + delegatedOut + pendingUnstake) * price;

            // % change: prefer HE market priceChangePercent, else compute from lastPrice vs lastDayPrice
            let pctChange = m.priceChangePercent;
            if (pctChange === null && m.lastPrice > 0 && m.lastDayPrice > 0) {
                pctChange = ((m.lastPrice - m.lastDayPrice) / m.lastDayPrice) * 100;
            }

            return {
                symbol: b.symbol,
                name: meta.name || b.symbol,
                precision: prec,
                stakingEnabled: meta.stakingEnabled || false,
                delegationEnabled: meta.delegationEnabled || false,
                liquid, staked, pendingUnstake, delegatedIn, delegatedOut, pendingUndel,
                price,
                pctChange,          // null if unknown
                totalValue,
                hasPool: !!(poolMap[b.symbol]?.length),
                poolPairs: poolMap[b.symbol] || [],
            };
        })
        .filter((t) =>
            t.liquid > 0 || t.staked > 0 || t.delegatedOut > 0 ||
            t.delegatedIn > 0 || t.pendingUnstake > 0 || t.pendingUndel > 0
        )
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
        if (forceRefresh) {
            delete _walletCache[account];
            // Also bust metrics/prices so user gets fresh % change on manual refresh
            _metricsCache = { data: null, ts: 0 };
            _priceCache = { data: null, ts: 0 };
        }
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