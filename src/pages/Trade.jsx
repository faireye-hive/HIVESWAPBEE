import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Big from 'big.js';
import TokenIcon from '../components/TokenIcon.jsx';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { notifyWalletRefresh } from '../hooks/useBalances.js';
import { floorToPrecision } from '../lib/swapQuote.js';
import {
    findMetrics,
    findPool,
    getMarketMetric,
    getAccountOrders,
    getBuyBook,
    getSellBook,
    getTokenBalance,
    getTokenInfo,
    getTradesHistory,
} from '../api/hiveEngine.js';
import './Trade.css';

const SYMBOL_RE = /^[A-Z0-9.]{2,20}$/;

function fmtPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '—';
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function fmtQty(value, precision = 4) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return n.toFixed(Math.min(precision, 6));
}

function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

function aggregate(orders) {
    const map = new Map();
    for (const order of orders || []) {
        const price = order.price;
        const qty = parseFloat(order.quantity) || 0;
        const prev = map.get(price) || { price, quantity: 0, hive: 0 };
        prev.quantity += qty;
        prev.hive += qty * (parseFloat(price) || 0);
        map.set(price, prev);
    }
    return [...map.values()];
}

function walkBuy(hiveAmount, asks) {
    let left = new Big(hiveAmount);
    let tokens = new Big(0);
    let worst = null;
    for (const ask of asks) {
        const price = new Big(ask.price);
        const qty = new Big(ask.quantity);
        if (!price.gt(0) || !qty.gt(0)) continue;
        const cost = price.times(qty);
        if (left.gte(cost)) {
            tokens = tokens.plus(qty);
            left = left.minus(cost);
            worst = ask.price;
        } else if (left.gt(0)) {
            tokens = tokens.plus(left.div(price));
            worst = ask.price;
            left = new Big(0);
            break;
        }
    }
    return { tokens: tokens.toString(), worst, unfilled: left.toString() };
}

function walkSell(tokenAmount, bids) {
    let left = new Big(tokenAmount);
    let hive = new Big(0);
    let worst = null;
    for (const bid of bids) {
        const price = new Big(bid.price);
        const qty = new Big(bid.quantity);
        if (!price.gt(0) || !qty.gt(0)) continue;
        if (left.gte(qty)) {
            hive = hive.plus(qty.times(price));
            left = left.minus(qty);
            worst = bid.price;
        } else if (left.gt(0)) {
            hive = hive.plus(left.times(price));
            worst = bid.price;
            left = new Big(0);
            break;
        }
    }
    return { hive: hive.toString(), worst, unfilled: left.toString() };
}

export default function Trade() {
    const { symbol: rawSymbol = '' } = useParams();
    const symbol = rawSymbol.toUpperCase();
    const valid = SYMBOL_RE.test(symbol) && symbol !== 'SWAP.HIVE';
    const navigate = useNavigate();
    const { user, marketAction } = useKeychainContext();
    const toast = useToast();

    const [info, setInfo] = useState(null);
    const [metric, setMetric] = useState(null);
    const [asks, setAsks] = useState([]);
    const [bids, setBids] = useState([]);
    const [trades, setTrades] = useState([]);
    const [orders, setOrders] = useState({ buys: [], sells: [] });
    const [balances, setBalances] = useState({ token: null, hive: null });
    const [poolPair, setPoolPair] = useState(null);
    const [picker, setPicker] = useState([]);
    const [query, setQuery] = useState(symbol);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [side, setSide] = useState('buy');
    const [mode, setMode] = useState('limit');
    const [price, setPrice] = useState('');
    const [quantity, setQuantity] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const precision = info?.precision ?? null;

    const refresh = useCallback(async (silent = false) => {
        if (!valid) {
            setLoading(false);
            return;
        }
        if (!silent) setLoading(true);
        setError(null);
        try {
            const [sellBook, buyBook, history, token, hiveBal, tokenBal, poolA, poolB, metricRow] = await Promise.all([
                getSellBook(symbol, 40).catch(() => []),
                getBuyBook(symbol, 40).catch(() => []),
                getTradesHistory(symbol, 30).catch(() => []),
                getTokenInfo(symbol).catch(() => null),
                user ? getTokenBalance(user, 'SWAP.HIVE').catch(() => null) : Promise.resolve(null),
                user ? getTokenBalance(user, symbol).catch(() => null) : Promise.resolve(null),
                findPool(`SWAP.HIVE:${symbol}`).catch(() => null),
                findPool(`${symbol}:SWAP.HIVE`).catch(() => null),
                getMarketMetric(symbol).catch(() => null),
            ]);
            if (!token) {
                setInfo(null);
                setError(`${symbol} is not a Hive-Engine token.`);
            } else {
                setInfo(token);
                setError(null);
            }
            setAsks(sellBook || []);
            setBids(buyBook || []);
            setTrades(history || []);
            setBalances({
                hive: hiveBal?.balance ?? (user ? '0' : null),
                token: tokenBal?.balance ?? (user ? '0' : null),
            });
            setPoolPair(poolA?.tokenPair || poolB?.tokenPair || null);
            setMetric(metricRow);
            if (user) {
                const mine = await getAccountOrders(user, symbol);
                setOrders(mine);
            } else {
                setOrders({ buys: [], sells: [] });
            }
        } catch (err) {
            if (!silent) setError(err.message || 'Could not load this market');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [symbol, user, valid]);

    useEffect(() => {
        setQuery(symbol);
        setPrice('');
        setQuantity('');
        refresh(false);
    }, [symbol, refresh]);

    useEffect(() => {
        if (!valid) return undefined;
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') refresh(true);
        }, 15000);
        return () => clearInterval(id);
    }, [refresh, valid]);

    useEffect(() => {
        let cancelled = false;
        findMetrics(1000, 0).then((rows) => {
            if (cancelled) return;
            const list = (rows || [])
                .filter((m) => m.symbol && m.symbol !== 'SWAP.HIVE')
                .sort((a, b) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0));
            setPicker(list);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const askLevels = useMemo(() => aggregate(asks).slice(0, 14), [asks]);
    const bidLevels = useMemo(() => aggregate(bids).slice(0, 14), [bids]);
    const maxAsk = Math.max(1, ...askLevels.map((l) => l.quantity));
    const maxBid = Math.max(1, ...bidLevels.map((l) => l.quantity));
    const bestAsk = askLevels[0]?.price;
    const bestBid = bidLevels[0]?.price;
    const spread = bestAsk && bestBid ? (parseFloat(bestAsk) - parseFloat(bestBid)) : null;
    const mid = bestAsk && bestBid ? (parseFloat(bestAsk) + parseFloat(bestBid)) / 2 : null;

    const change = metric ? parseFloat(String(metric.priceChangePercent || '').replace('%', '')) : null;
    const suggestions = picker
        .filter((m) => {
            const q = query.trim().toLowerCase();
            if (!q || q === symbol.toLowerCase()) return true;
            return m.symbol.toLowerCase().includes(q);
        })
        .slice(0, 8);

    const priceStr = floorToPrecision(price, 8);
    const qtyStr = precision == null ? null : floorToPrecision(quantity, precision);
    const hiveStr = floorToPrecision(quantity, 8);

    let estimate = null;
    if (mode === 'market' && side === 'buy' && hiveStr) estimate = walkBuy(hiveStr, asks);
    if (mode === 'market' && side === 'sell' && qtyStr) estimate = walkSell(qtyStr, bids);

    let total = null;
    if (mode === 'limit' && priceStr && qtyStr) {
        try { total = new Big(priceStr).times(qtyStr).toFixed(8, Big.roundDown); } catch { total = null; }
    }

    const spend = side === 'buy'
        ? (mode === 'limit' ? total : hiveStr)
        : qtyStr;
    const spendSymbol = side === 'buy' ? 'SWAP.HIVE' : symbol;
    const spendBalance = side === 'buy' ? balances.hive : balances.token;
    const insufficient = !!(user && spend && spendBalance != null && new Big(spend).gt(spendBalance));

    const fillPercent = (pct) => {
        if (!user) return;
        if (side === 'sell') {
            const next = floorToPrecision(new Big(balances.token || 0).times(pct), precision ?? 8);
            if (next) setQuantity(next);
            return;
        }
        if (mode === 'market') {
            const next = floorToPrecision(new Big(balances.hive || 0).times(pct), 8);
            if (next) setQuantity(next);
            return;
        }
        if (!priceStr) return;
        const hive = new Big(balances.hive || 0).times(pct);
        const qty = floorToPrecision(hive.div(priceStr), precision ?? 8);
        if (qty) setQuantity(qty);
    };

    const place = async () => {
        if (!user) {
            toast.error('Connect your wallet first');
            return;
        }
        if (precision == null) {
            toast.error('Token precision is still loading');
            return;
        }
        if (insufficient) {
            toast.error(`Not enough ${spendSymbol}`);
            return;
        }
        setSubmitting(true);
        try {
            if (mode === 'limit') {
                if (!priceStr || !qtyStr) throw new Error('Enter a price and a quantity');
                await marketAction(side === 'buy' ? 'buy' : 'sell', {
                    symbol,
                    quantity: qtyStr,
                    price: priceStr,
                });
            } else if (side === 'buy') {
                if (!hiveStr) throw new Error('Enter how much SWAP.HIVE to spend');
                await marketAction('marketBuy', { symbol, quantity: hiveStr });
            } else {
                if (!qtyStr) throw new Error('Enter how much to sell');
                await marketAction('marketSell', { symbol, quantity: qtyStr });
            }
            toast.success('Order sent. It will show up after the next block.');
            setQuantity('');
            notifyWalletRefresh();
            setTimeout(() => refresh(true), 4000);
        } catch (err) {
            toast.error(err.message || 'Order failed');
        } finally {
            setSubmitting(false);
        }
    };

    const cancel = async (type, id) => {
        try {
            await marketAction('cancel', { type, id });
            toast.success('Cancel sent');
            setTimeout(() => refresh(true), 4000);
        } catch (err) {
            toast.error(err.message || 'Cancel failed');
        }
    };

    const myOrders = [
        ...(orders.buys || []).map((o) => ({ ...o, type: 'buy' })),
        ...(orders.sells || []).map((o) => ({ ...o, type: 'sell' })),
    ];

    if (!valid) {
        return (
            <div className="page">
                <div className="container">
                    <div className="card empty-state">
                        <p>{symbol === 'SWAP.HIVE'
                            ? 'SWAP.HIVE is the quote currency of the order book. Pick another token to trade.'
                            : 'That token symbol is not valid.'}</p>
                        <Link to="/trade/BEE" className="btn btn-primary">Trade BEE</Link>
                    </div>
                </div>
            </div>
        );
    }

    let actionLabel = side === 'buy' ? `Buy ${symbol}` : `Sell ${symbol}`;
    if (!user) actionLabel = 'Connect wallet to trade';
    else if (submitting) actionLabel = 'Confirm in Keychain...';
    else if (insufficient) actionLabel = `Insufficient ${spendSymbol}`;

    return (
        <div className="page">
            <div className="container trade-page">
                <div className="trade-top card">
                    <div className="trade-symbol">
                        <TokenIcon symbol={symbol} size={36} />
                        <div className="trade-symbol-search">
                            <input
                                className="input"
                                value={query}
                                aria-label="Search market"
                                onFocus={() => setPickerOpen(true)}
                                onChange={(e) => { setQuery(e.target.value.toUpperCase()); setPickerOpen(true); }}
                                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && SYMBOL_RE.test(query) && query !== 'SWAP.HIVE') {
                                        navigate(`/trade/${query}`);
                                        setPickerOpen(false);
                                    }
                                }}
                            />
                            {pickerOpen && suggestions.length > 0 && (
                                <div className="trade-suggest">
                                    {suggestions.map((m) => (
                                        <button
                                            type="button"
                                            key={m.symbol}
                                            onMouseDown={() => navigate(`/trade/${m.symbol}`)}
                                        >
                                            <TokenIcon symbol={m.symbol} size={18} />
                                            <span>{m.symbol}</span>
                                            <small>{fmtPrice(m.lastPrice)}</small>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="trade-stats">
                        <div>
                            <span>Last</span>
                            <strong>{fmtPrice(metric?.lastPrice)}</strong>
                        </div>
                        <div>
                            <span>24h</span>
                            <strong className={change > 0 ? 'chg-up' : change < 0 ? 'chg-down' : ''}>
                                {Number.isFinite(change) ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}
                            </strong>
                        </div>
                        <div>
                            <span>Volume</span>
                            <strong>{fmtQty(metric?.volume, 2)} SWAP.HIVE</strong>
                        </div>
                        <div>
                            <span>Bid / Ask</span>
                            <strong>{fmtPrice(bestBid)} / {fmtPrice(bestAsk)}</strong>
                        </div>
                    </div>
                    <div className="trade-links">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh(false)}>Refresh</button>
                        {poolPair && (
                            <Link className="btn btn-ghost btn-sm" to={`/swap?from=SWAP.HIVE&to=${encodeURIComponent(symbol)}`}>
                                Pool swap
                            </Link>
                        )}
                    </div>
                </div>

                {error && <div className="card trade-error">{error}</div>}

                <div className="trade-grid">
                    <section className="card trade-form">
                        <div className="trade-side">
                            <button type="button" className={side === 'buy' ? 'buy active' : 'buy'} onClick={() => setSide('buy')}>Buy</button>
                            <button type="button" className={side === 'sell' ? 'sell active' : 'sell'} onClick={() => setSide('sell')}>Sell</button>
                        </div>
                        <div className="tabs">
                            <button type="button" className={`tab ${mode === 'limit' ? 'active' : ''}`} onClick={() => setMode('limit')}>Limit</button>
                            <button type="button" className={`tab ${mode === 'market' ? 'active' : ''}`} onClick={() => setMode('market')}>Market</button>
                        </div>

                        {mode === 'limit' && (
                            <label className="trade-field">
                                <span>Price (SWAP.HIVE)</span>
                                <input className="input" inputMode="decimal" value={price} placeholder="0.0" onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
                            </label>
                        )}
                        <label className="trade-field">
                            <span>
                                {mode === 'market' && side === 'buy' ? 'Spend SWAP.HIVE' : `Quantity (${symbol})`}
                                {spendBalance != null && <em>Bal {fmtQty(spendBalance, precision || 4)}</em>}
                            </span>
                            <input className="input" inputMode="decimal" value={quantity} placeholder="0.0" onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))} />
                        </label>
                        <div className="swap-percents">
                            {[0.25, 0.5, 0.75, 1].map((pct) => (
                                <button key={pct} type="button" onClick={() => fillPercent(pct)}>
                                    {pct === 1 ? 'Max' : `${pct * 100}%`}
                                </button>
                            ))}
                        </div>

                        {mode === 'limit' && total && (
                            <div className="swap-detail-row">
                                <span className="label">Total</span>
                                <span className="value">{fmtQty(total, 6)} SWAP.HIVE</span>
                            </div>
                        )}
                        {mode === 'market' && estimate && (
                            <div className="swap-details">
                                <div className="swap-detail-row">
                                    <span className="label">{side === 'buy' ? 'Est. tokens' : 'Est. SWAP.HIVE'}</span>
                                    <span className="value">
                                        {side === 'buy' ? fmtQty(estimate.tokens, precision || 4) : fmtQty(estimate.hive, 6)}
                                    </span>
                                </div>
                                <div className="swap-detail-row">
                                    <span className="label">Worst price</span>
                                    <span className="value">{estimate.worst ? fmtPrice(estimate.worst) : '—'}</span>
                                </div>
                                {new Big(estimate.unfilled).gt(0) && (
                                    <p className="swap-note">The book cannot fill this whole order. The rest stays in your balance.</p>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            className={`btn btn-lg ${side === 'sell' ? 'btn-danger' : 'btn-primary'}`}
                            style={{ width: '100%', marginTop: 16 }}
                            disabled={submitting || (user && (insufficient || precision == null))}
                            onClick={place}
                        >
                            {actionLabel}
                        </button>
                    </section>

                    <section className="card trade-book">
                        <h2 className="card-title">Order book</h2>
                        <div className="ob-head"><span>Price</span><span>Quantity</span><span>SWAP.HIVE</span></div>
                        {loading && asks.length === 0 ? (
                            <div className="skeleton" style={{ height: 180 }} />
                        ) : (
                            <>
                                <div className="ob-asks">
                                    {[...askLevels].reverse().map((level) => (
                                        <button
                                            type="button"
                                            key={`a-${level.price}`}
                                            className="ob-row ask"
                                            style={{ '--depth': `${(level.quantity / maxAsk) * 100}%` }}
                                            onClick={() => { setMode('limit'); setSide('buy'); setPrice(level.price); }}
                                        >
                                            <span>{fmtPrice(level.price)}</span>
                                            <span>{fmtQty(level.quantity, precision || 4)}</span>
                                            <span>{fmtQty(level.hive, 4)}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="ob-spread">
                                    Spread {spread == null || !mid ? '—' : `${fmtPrice(spread)} (${((spread / mid) * 100).toFixed(2)}%)`}
                                </div>
                                <div className="ob-bids">
                                    {bidLevels.map((level) => (
                                        <button
                                            type="button"
                                            key={`b-${level.price}`}
                                            className="ob-row bid"
                                            style={{ '--depth': `${(level.quantity / maxBid) * 100}%` }}
                                            onClick={() => { setMode('limit'); setSide('sell'); setPrice(level.price); }}
                                        >
                                            <span>{fmtPrice(level.price)}</span>
                                            <span>{fmtQty(level.quantity, precision || 4)}</span>
                                            <span>{fmtQty(level.hive, 4)}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>

                    <section className="card trade-tape">
                        <h2 className="card-title">Recent trades</h2>
                        <div className="ob-head"><span>Price</span><span>Qty</span><span>Time</span></div>
                        {trades.length === 0 && !loading && <p className="swap-note">No trades in the loaded history.</p>}
                        {trades.slice(0, 18).map((t, i) => (
                            <div key={`${t.timestamp}-${t.price}-${i}`} className={`tape-row ${t.type}`}>
                                <span>{fmtPrice(t.price)}</span>
                                <span>{fmtQty(t.quantity, precision || 4)}</span>
                                <span>{timeAgo(t.timestamp)}</span>
                            </div>
                        ))}
                    </section>
                </div>

                <section className="card trade-orders">
                    <h2 className="card-title">Your open orders</h2>
                    {!user && <p className="swap-note">Connect your wallet to see and cancel orders.</p>}
                    {user && myOrders.length === 0 && <p className="swap-note">No open orders for {symbol}.</p>}
                    {myOrders.length > 0 && (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Side</th>
                                        <th>Price</th>
                                        <th>Remaining</th>
                                        <th>Locked</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myOrders.map((o) => (
                                        <tr key={o.txId}>
                                            <td className={o.type === 'buy' ? 'chg-up' : 'chg-down'}>{o.type}</td>
                                            <td>{fmtPrice(o.price)}</td>
                                            <td>{fmtQty(o.quantity, precision || 4)} {symbol}</td>
                                            <td>{o.tokensLocked ? `${fmtQty(o.tokensLocked, 4)} SWAP.HIVE` : '—'}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancel(o.type, o.txId)}>
                                                    Cancel
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
