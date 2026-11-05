import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Big from 'big.js';
import TokenIcon from './TokenIcon.jsx';
import TokenSelectModal from './TokenSelectModal.jsx';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { findPool, getAccountBalances, getTokenInfo } from '../api/hiveEngine.js';
import { notifyWalletRefresh } from '../hooks/useBalances.js';
import { buildPoolIndex, buildSwap, findRoute, floorToPrecision } from '../lib/swapQuote.js';

const SLIPPAGE_PRESETS = ['0.5', '1', '2', '5'];

function fmtDisplay(value) {
    try {
        const n = new Big(value);
        if (n.gte(1000)) return n.toFixed(4, Big.roundDown);
        if (n.gte(1)) return n.toFixed(6, Big.roundDown).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
        return n.toFixed(8, Big.roundDown).replace(/(\.\d*?[1-9])0+$/, '$1');
    } catch {
        return value || '';
    }
}

export default function SwapForm({ pools, tokenMap, feeMul, fromToken, toToken, onTokensChange }) {
    const { user, swapTokens } = useKeychainContext();
    const toast = useToast();

    const [amount, setAmount] = useState('');
    const [slippage, setSlippage] = useState('1');
    const [balances, setBalances] = useState({});
    const [extraPrecision, setExtraPrecision] = useState({});
    const [picking, setPicking] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [confirmImpact, setConfirmImpact] = useState(false);

    const index = useMemo(() => buildPoolIndex(pools), [pools]);
    const route = useMemo(
        () => findRoute(index, fromToken, toToken),
        [index, fromToken, toToken]
    );

    const tokens = useMemo(() => {
        const map = new Map();
        for (const pool of pools || []) {
            for (const symbol of pool.tokenPair.split(':')) {
                if (!symbol || map.has(symbol)) continue;
                const meta = tokenMap?.[symbol] || {};
                map.set(symbol, {
                    symbol,
                    name: meta.name || symbol,
                    precision: meta.precision,
                });
            }
        }
        for (const symbol of Object.keys(balances)) {
            if (!map.has(symbol)) map.set(symbol, { symbol, name: symbol });
        }
        return [...map.values()];
    }, [pools, tokenMap, balances]);

    const precisionOf = useCallback((symbol) => {
        if (extraPrecision[symbol] != null) return extraPrecision[symbol];
        const fromMap = tokenMap?.[symbol]?.precision;
        if (fromMap != null) return fromMap;
        return null;
    }, [extraPrecision, tokenMap]);

    const precisionTried = useRef(new Set());
    useEffect(() => {
        const needed = [fromToken, toToken, route?.[0]?.to, route?.[1]?.to];
        const missing = needed.filter((s) => (
            s && tokenMap?.[s]?.precision == null && extraPrecision[s] == null && !precisionTried.current.has(s)
        ));
        if (!missing.length) return;
        missing.forEach((s) => precisionTried.current.add(s));
        let cancelled = false;
        Promise.all(missing.map((s) => getTokenInfo(s).catch(() => null))).then((rows) => {
            if (cancelled) return;
            setExtraPrecision((prev) => {
                const next = { ...prev };
                rows.forEach((row, i) => {
                    if (row && row.precision != null) next[missing[i]] = row.precision;
                });
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [fromToken, toToken, route, tokenMap, extraPrecision]);

    const loadBalances = useCallback(() => {
        if (!user) {
            setBalances({});
            return;
        }
        getAccountBalances(user).then((rows) => {
            const map = {};
            for (const row of rows || []) map[row.symbol] = row.balance;
            setBalances(map);
        }).catch(() => {});
    }, [user]);

    useEffect(() => { loadBalances(); }, [loadBalances]);
    useEffect(() => {
        const onRefresh = () => loadBalances();
        window.addEventListener('hiveswapbee:refresh', onRefresh);
        return () => window.removeEventListener('hiveswapbee:refresh', onRefresh);
    }, [loadBalances]);

    useEffect(() => { setConfirmImpact(false); }, [amount, fromToken, toToken, slippage]);

    const fromPrecision = precisionOf(fromToken);
    const amountIn = fromPrecision == null ? null : floorToPrecision(amount, fromPrecision);

    const slipNum = Math.min(49, Math.max(0, parseFloat(slippage)));
    const quote = useMemo(() => {
        if (!amountIn || !route) return null;
        if (precisionOf(fromToken) == null || precisionOf(toToken) == null) return null;
        if (route.length === 2 && precisionOf(route[0].to) == null) return null;
        return buildSwap({
            route,
            amountIn,
            slippagePct: Number.isFinite(slipNum) ? slipNum : 1,
            feeMul,
            precisionOf,
        });
    }, [amountIn, route, precisionOf, fromToken, toToken, slipNum, feeMul]);

    const fromBalance = balances[fromToken] ?? null;
    const insufficient = !!(amountIn && fromBalance != null && new Big(amountIn).gt(fromBalance));
    const impact = quote?.priceImpact ?? null;

    const setPercent = (pct) => {
        if (!fromBalance || fromPrecision == null) return;
        const next = floorToPrecision(new Big(fromBalance).times(pct), fromPrecision);
        if (next) setAmount(next);
    };

    const handleFlip = () => {
        onTokensChange(toToken, fromToken);
        setAmount('');
    };

    const handleSwap = async () => {
        if (!user) {
            toast.error('Connect your wallet first');
            return;
        }
        if (!amountIn) {
            toast.error('Enter an amount');
            return;
        }
        if (!route) {
            toast.error('No liquidity route for this pair');
            return;
        }
        if (insufficient) {
            toast.error(`Not enough ${fromToken}`);
            return;
        }
        if (impact != null && impact > 30) {
            toast.error('Price impact is above 30%. Use a smaller amount.');
            return;
        }
        if (impact != null && impact > 8 && !confirmImpact) {
            setConfirmImpact(true);
            return;
        }

        setSubmitting(true);
        try {
            const freshRoute = [];
            for (const hop of route) {
                const pool = await findPool(hop.pool.tokenPair);
                if (!pool) throw new Error(`Pool ${hop.pool.tokenPair} is unavailable`);
                freshRoute.push({ pool, from: hop.from, to: hop.to });
            }
            const fresh = buildSwap({
                route: freshRoute,
                amountIn,
                slippagePct: Number.isFinite(slipNum) ? slipNum : 1,
                feeMul,
                precisionOf,
            });
            if (!fresh) throw new Error('Could not price this swap. Try a different amount.');

            await swapTokens(fresh.ops);
            toast.success(`Swapped ${fresh.ops[0].tokenAmount} ${fromToken}`);
            setAmount('');
            notifyWalletRefresh();
            setTimeout(loadBalances, 4000);
        } catch (err) {
            const message = err?.message || 'Swap failed';
            if (/cancel/i.test(message)) toast.error('Swap cancelled');
            else toast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    let actionLabel = 'Swap';
    if (!user) actionLabel = 'Connect wallet to swap';
    else if (!fromToken || !toToken) actionLabel = 'Select tokens';
    else if (fromPrecision == null || route?.some((hop) => precisionOf(hop.from) == null || precisionOf(hop.to) == null)) actionLabel = 'Loading token info...';
    else if (!route) actionLabel = 'No liquidity route';
    else if (!amount) actionLabel = 'Enter an amount';
    else if (!amountIn || !quote) actionLabel = 'Amount too small';
    else if (insufficient) actionLabel = `Insufficient ${fromToken}`;
    else if (impact != null && impact > 30) actionLabel = 'Price impact too high';
    else if (confirmImpact) actionLabel = `Impact ${impact.toFixed(2)}% — swap anyway`;
    else if (submitting) actionLabel = 'Confirm in Keychain...';

    const blocked = !!(user && (
        fromPrecision == null || !amountIn || !route || !quote || insufficient || (impact != null && impact > 30)
    ));

    return (
        <div className="swap-container">
            <div className="card swap-card">
                <div className="card-header">
                    <h2 className="card-title">Swap</h2>
                    <div className="slippage-setting">
                        <span className="swap-input-label">Slippage</span>
                        {SLIPPAGE_PRESETS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                className={`btn btn-ghost btn-sm ${slippage === s ? 'active-slippage' : ''}`}
                                onClick={() => setSlippage(s)}
                                style={slippage === s ? { color: 'var(--accent)' } : {}}
                            >
                                {s}%
                            </button>
                        ))}
                        <input
                            className="input slippage-custom"
                            inputMode="decimal"
                            aria-label="Custom slippage percent"
                            value={slippage}
                            onChange={(e) => setSlippage(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
                        />
                    </div>
                </div>

                <div className="swap-input-box">
                    <div className="swap-input-header">
                        <span className="swap-input-label">From</span>
                        {fromBalance != null && (
                            <span className="swap-balance">
                                Balance:{' '}
                                <span onClick={() => setAmount(fromBalance)}>{fmtDisplay(fromBalance)}</span>
                            </span>
                        )}
                    </div>
                    <div className="swap-input-row">
                        <input
                            type="text"
                            inputMode="decimal"
                            className="swap-amount-input"
                            placeholder="0.0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                        />
                        <button type="button" className="swap-token-select" onClick={() => setPicking('from')}>
                            <TokenIcon symbol={fromToken} size={22} />
                            {fromToken || 'Select'}
                        </button>
                    </div>
                    <div className="swap-percents">
                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                            <button key={pct} type="button" onClick={() => setPercent(pct)} disabled={!fromBalance}>
                                {pct === 1 ? 'Max' : `${pct * 100}%`}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="swap-arrow-container">
                    <button type="button" className="swap-arrow-btn" onClick={handleFlip} title="Flip tokens">↕</button>
                </div>

                <div className="swap-input-box">
                    <div className="swap-input-header">
                        <span className="swap-input-label">To (estimated)</span>
                        {balances[toToken] != null && (
                            <span className="swap-balance">Balance: {fmtDisplay(balances[toToken])}</span>
                        )}
                    </div>
                    <div className="swap-input-row">
                        <input
                            type="text"
                            className="swap-amount-input"
                            placeholder="0.0"
                            value={quote ? fmtDisplay(quote.amountOut) : ''}
                            readOnly
                        />
                        <button type="button" className="swap-token-select" onClick={() => setPicking('to')}>
                            <TokenIcon symbol={toToken} size={22} />
                            {toToken || 'Select'}
                        </button>
                    </div>
                </div>

                {amount && !route && fromToken && toToken && (
                    <p className="swap-warning">No pool route between {fromToken} and {toToken}. Try SWAP.HIVE in the middle.</p>
                )}

                {quote && (
                    <div className="swap-details fade-in">
                        <div className="swap-detail-row">
                            <span className="label">Rate</span>
                            <span className="value">1 {fromToken} ≈ {fmtDisplay(quote.rate)} {toToken}</span>
                        </div>
                        <div className="swap-detail-row">
                            <span className="label">Route</span>
                            <span className="value">{quote.steps.map((s) => s.from).concat(toToken).join(' → ')}</span>
                        </div>
                        <div className="swap-detail-row">
                            <span className="label">Pool fee</span>
                            <span className="value">{quote.feePct.toFixed(2)}%</span>
                        </div>
                        <div className="swap-detail-row">
                            <span className="label">Price impact</span>
                            <span
                                className="value"
                                style={{ color: impact > 5 ? 'var(--red)' : impact > 1 ? 'var(--accent)' : 'var(--green)' }}
                            >
                                {impact.toFixed(2)}%
                            </span>
                        </div>
                        <div className="swap-detail-row">
                            <span className="label">Minimum received</span>
                            <span className="value">{fmtDisplay(quote.minReceived)} {toToken}</span>
                        </div>
                        {quote.steps.length > 1 && (
                            <p className="swap-note">
                                This route uses two pools in one transaction. A small amount of {quote.steps[0].to} can remain in your wallet.
                            </p>
                        )}
                    </div>
                )}

                <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', marginTop: 20 }}
                    onClick={handleSwap}
                    disabled={submitting || blocked}
                >
                    {actionLabel}
                </button>
            </div>

            <TokenSelectModal
                open={picking != null}
                onClose={() => setPicking(null)}
                tokens={tokens}
                balances={balances}
                disabledSymbol={picking === 'from' ? toToken : fromToken}
                onSelect={(symbol) => {
                    if (picking === 'from') onTokensChange(symbol, symbol === toToken ? fromToken : toToken);
                    else onTokensChange(symbol === fromToken ? toToken : fromToken, symbol);
                }}
            />
        </div>
    );
}
