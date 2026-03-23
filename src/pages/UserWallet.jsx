import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useWallet } from '../hooks/useWallet.js';
import TokenIcon from '../components/TokenIcon.jsx';
import Modal from '../components/Modal.jsx';
import './UserWallet.css';

// ── Formatters ────────────────────────────────────────────────────────────

function fmt(num, dec = 4) {
    const n = parseFloat(num);
    if (isNaN(n) || n === 0) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    return n.toFixed(dec);
}
function fmtUsd(num) {
    const n = parseFloat(num);
    if (!n || isNaN(n)) return null;
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
    if (n >= 0.01) return '$' + n.toFixed(2);
    return '$' + n.toFixed(5);
}
function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}
function fmtPrecision(num, precision) {
    return parseFloat(num).toFixed(Math.min(precision ?? 4, 8));
}

// ── Preferences storage ───────────────────────────────────────────────────

const PREF_FAV_KEY = 'hiveswapbee_wallet_favs';
const PREF_HIDDEN_KEY = 'hiveswapbee_wallet_hidden';
const PREF_FILTER_KEY = 'hiveswapbee_wallet_filter';

function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { return new Set(); }
}
function saveSet(key, set) {
    localStorage.setItem(key, JSON.stringify([...set]));
}
function loadFilter() {
    try { return JSON.parse(localStorage.getItem(PREF_FILTER_KEY) || 'null') ?? { hideZeroValue: false, hideZeroBalance: false }; }
    catch { return { hideZeroValue: false, hideZeroBalance: false }; }
}
function saveFilter(f) {
    localStorage.setItem(PREF_FILTER_KEY, JSON.stringify(f));
}

// ── Keychain helper ───────────────────────────────────────────────────────

function keychainJson(user, payload, label) {
    return new Promise((resolve) => {
        window.hive_keychain.requestCustomJson(user, 'ssc-mainnet-hive', 'Active',
            JSON.stringify(payload), label, (r) => resolve(r));
    });
}

// ── Manage visibility modal ───────────────────────────────────────────────

function ManageModal({ allTokens, hidden, onHide, onShow, onClose }) {
    const [search, setSearch] = useState('');
    const list = useMemo(() => {
        const q = search.toLowerCase();
        return allTokens.filter((t) =>
            !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
        );
    }, [allTokens, search]);

    return (
        <Modal isOpen onClose={onClose} title="Manage Token Visibility" size="md">
            <div className="uw-manage-modal">
                <p className="uw-manage-hint">
                    Uncheck tokens to hide them from your wallet view. Settings are saved locally.
                </p>
                <div className="search-bar" style={{ marginBottom: 12 }}>
                    <span className="search-icon">⌕</span>
                    <input className="input" placeholder="Search tokens..." value={search}
                        onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="uw-manage-list">
                    {list.map((t) => {
                        const isHidden = hidden.has(t.symbol);
                        return (
                            <div key={t.symbol} className="uw-manage-row">
                                <label className="uw-manage-label">
                                    <input
                                        type="checkbox"
                                        checked={!isHidden}
                                        onChange={() => isHidden ? onShow(t.symbol) : onHide(t.symbol)}
                                        className="uw-manage-check"
                                    />
                                    <TokenIcon symbol={t.symbol} size={20} />
                                    <span className="uw-manage-sym">{t.symbol}</span>
                                    <span className="uw-manage-name">{t.name}</span>
                                </label>
                                <span className="uw-manage-val">
                                    {t.totalValue > 0 ? fmtUsd(t.totalValue) : '—'}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { list.forEach((t) => onHide(t.symbol)); }}>Hide All</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { list.forEach((t) => onShow(t.symbol)); }}>Show All</button>
                    <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
                </div>
            </div>
        </Modal>
    );
}

// ── Main component ────────────────────────────────────────────────────────

export default function UserWallet() {
    const { user } = useKeychainContext();
    const toast = useToast();
    const navigate = useNavigate();

    // ── Account switcher ──────────────────────────────────────────────
    const [viewAccount, setViewAccount] = useState(user || '');
    const [inputVal, setInputVal] = useState(user || '');
    const debounceRef = useRef(null);

    useEffect(() => {
        if (user && !viewAccount) { setViewAccount(user); setInputVal(user); }
    }, [user]);

    const handleInputChange = (val) => {
        setInputVal(val);
        clearTimeout(debounceRef.current);
        if (!val.trim()) { setViewAccount(user || ''); return; }
        debounceRef.current = setTimeout(() =>
            setViewAccount(val.trim().replace(/^@/, '').toLowerCase()), 500);
    };
    const clearInput = () => { setInputVal(user || ''); setViewAccount(user || ''); };
    const isOwnWallet = !!(viewAccount && user && viewAccount === user);

    // ── Wallet data ────────────────────────────────────────────────────
    const { data, loading, error, lastUpdated, refetch } = useWallet(viewAccount);

    // ── Prefs (localStorage) ───────────────────────────────────────────
    const [favorites, setFavorites] = useState(() => loadSet(PREF_FAV_KEY));
    const [hidden, setHidden] = useState(() => loadSet(PREF_HIDDEN_KEY));
    const [filter, setFilter] = useState(loadFilter);
    const [showManage, setShowManage] = useState(false);

    const toggleFav = (symbol) => {
        setFavorites((prev) => {
            const next = new Set(prev);
            next.has(symbol) ? next.delete(symbol) : next.add(symbol);
            saveSet(PREF_FAV_KEY, next);
            return next;
        });
    };
    const hideToken = (symbol) => {
        setHidden((prev) => { const n = new Set(prev); n.add(symbol); saveSet(PREF_HIDDEN_KEY, n); return n; });
    };
    const showToken = (symbol) => {
        setHidden((prev) => { const n = new Set(prev); n.delete(symbol); saveSet(PREF_HIDDEN_KEY, n); return n; });
    };
    const updateFilter = (patch) => {
        setFilter((prev) => { const n = { ...prev, ...patch }; saveFilter(n); return n; });
    };

    // ── Search & filtering ─────────────────────────────────────────────
    const [search, setSearch] = useState('');

    const allTokens = data?.tokens || [];

    const visibleTokens = useMemo(() => {
        let list = allTokens;

        // Apply search
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((t) =>
                t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
        }

        // Apply filters
        if (filter.hideZeroValue) list = list.filter((t) => t.totalValue > 0);
        if (filter.hideZeroBalance) list = list.filter((t) => t.liquid > 0);

        // Apply hidden (skip if searching — show everything while searching)
        if (!search.trim()) list = list.filter((t) => !hidden.has(t.symbol));

        // Sort: favorites first, then by USD value
        const favs = list.filter((t) => favorites.has(t.symbol));
        const rest = list.filter((t) => !favorites.has(t.symbol));
        return [...favs, ...rest];
    }, [allTokens, search, filter, hidden, favorites]);

    const hiddenCount = allTokens.filter((t) => hidden.has(t.symbol)).length;

    // ── Action modal ───────────────────────────────────────────────────
    const [action, setAction] = useState(null);
    const [actionAmt, setActionAmt] = useState('');
    const [actionTo, setActionTo] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const openAction = (token, type) => { setAction({ token, type }); setActionAmt(''); setActionTo(''); };
    const closeAction = () => { setAction(null); };

    const submitAction = async () => {
        if (!window.hive_keychain) { toast.error('Hive Keychain not found'); return; }
        if (!user) { toast.error('Wallet not connected'); return; }
        const { token, type } = action;
        const qty = parseFloat(actionAmt);
        if (!actionAmt || isNaN(qty) || qty <= 0) { toast.error('Enter a valid amount'); return; }
        if (type === 'delegate' && !actionTo.trim()) { toast.error('Enter recipient username'); return; }
        const qtyStr = fmtPrecision(actionAmt, token.precision);
        const payloads = {
            stake: { contractName: 'tokens', contractAction: 'stake', contractPayload: { symbol: token.symbol, to: user, quantity: qtyStr } },
            unstake: { contractName: 'tokens', contractAction: 'unstake', contractPayload: { symbol: token.symbol, quantity: qtyStr } },
            delegate: { contractName: 'tokens', contractAction: 'delegate', contractPayload: { symbol: token.symbol, to: actionTo.trim(), quantity: qtyStr } },
            undelegate: { contractName: 'tokens', contractAction: 'undelegate', contractPayload: { symbol: token.symbol, quantity: qtyStr } },
        };
        const labels = {
            stake: `Stake ${qtyStr} ${token.symbol}`,
            unstake: `Unstake ${qtyStr} ${token.symbol}`,
            delegate: `Delegate ${qtyStr} ${token.symbol} to @${actionTo}`,
            undelegate: `Undelegate ${qtyStr} ${token.symbol}`,
        };
        setSubmitting(true);
        try {
            const res = await keychainJson(user, payloads[type], labels[type]);
            if (res.success) {
                toast.success(labels[type] + ' — submitted!');
                closeAction();
                setTimeout(() => refetch(), 3000);
            } else {
                toast.error(res.message || 'Transaction failed');
            }
        } catch (err) {
            toast.error(err.message || 'Unknown error');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Not logged in ──────────────────────────────────────────────────
    if (!user && !viewAccount) return (
        <div className="page"><div className="container">
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: 16 }}>🔑</span>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                    Connect your wallet to view your tokens and positions.
                </p>
            </div>
        </div></div>
    );

    return (
        <div className="page">
            <div className="container">

                {/* ── Header ── */}
                <div className="uw-header">
                    <div className="uw-title-row">
                        <h1 className="page-title">Wallet</h1>
                        {lastUpdated && <span className="uw-updated">Updated {timeAgo(lastUpdated)}</span>}
                        <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={loading}>
                            {loading ? '⟳' : '↺'} Refresh
                        </button>
                    </div>
                    <div className="uw-account-row">
                        <div className="uw-account-input-wrap">
                            <span className="uw-at">@</span>
                            <input className="input uw-account-input" value={inputVal}
                                onChange={(e) => handleInputChange(e.target.value)}
                                placeholder="Enter username..." />
                            {user && inputVal !== user && (
                                <button className="uw-account-clear" onClick={clearInput}>✕ My wallet</button>
                            )}
                        </div>
                        {!isOwnWallet && viewAccount && (
                            <span className="uw-readonly-badge">👁 Viewing only</span>
                        )}
                        {data && <span className="uw-total-value">Total: <strong>{fmtUsd(data.totalValueUsd) ?? '—'}</strong></span>}
                    </div>
                </div>

                {error && (
                    <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(255,107,107,0.3)' }}>
                        <p style={{ color: 'var(--red)' }}>⚠ {error}</p>
                    </div>
                )}

                {loading && !data ? (
                    <div>{[...Array(6)].map((_, i) => (
                        <div key={i} className="skeleton" style={{ height: 52, marginBottom: 4 }} />
                    ))}</div>
                ) : data ? (<>

                    {/* ── Toolbar ── */}
                    <div className="uw-toolbar">
                        <div className="search-bar" style={{ maxWidth: 240 }}>
                            <span className="search-icon">⌕</span>
                            <input type="text" className="input" placeholder="Search tokens..."
                                value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>

                        {/* Quick filters */}
                        <button
                            className={`uw-filter-chip${filter.hideZeroValue ? ' active' : ''}`}
                            onClick={() => updateFilter({ hideZeroValue: !filter.hideZeroValue })}
                            title="Only show tokens with USD value"
                        >💰 Has value</button>

                        <button
                            className={`uw-filter-chip${filter.hideZeroBalance ? ' active' : ''}`}
                            onClick={() => updateFilter({ hideZeroBalance: !filter.hideZeroBalance })}
                            title="Only show tokens with liquid balance"
                        >💧 Liquid only</button>

                        {/* Manage visibility */}
                        <button
                            className="uw-filter-chip"
                            onClick={() => setShowManage(true)}
                            title="Choose which tokens to show"
                        >
                            ⚙ Visibility
                            {hiddenCount > 0 && <span className="uw-hidden-count">{hiddenCount} hidden</span>}
                        </button>

                        <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>
                            {visibleTokens.length} tokens
                            {favorites.size > 0 && ` · ★ ${favorites.size}`}
                        </span>
                    </div>

                    {/* ── Token table ── */}
                    <div className="table-container glass uw-table-wrap">
                        <table className="uw-table">
                            <thead>
                                <tr>
                                    <th className="uw-col-star">★</th>
                                    <th className="uw-col-token">Token</th>
                                    <th className="uw-col-num" title="Liquid balance">Liquid</th>
                                    <th className="uw-col-num" title="Staked">Staked</th>
                                    <th className="uw-col-num" title="Delegated out">Del. Out</th>
                                    <th className="uw-col-num" title="Delegated to you">Del. In</th>
                                    <th className="uw-col-num" title="Pending unstake">Unstaking</th>
                                    <th className="uw-col-num" title="Pending undelegation">Undel.</th>
                                    <th className="uw-col-usd" title="Estimated USD value">Value</th>
                                    {isOwnWallet && <th className="uw-col-actions">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {visibleTokens.length === 0 ? (
                                    <tr><td colSpan={isOwnWallet ? 10 : 9}>
                                        <div className="empty-state"><span className="icon">🔍</span><p>No tokens match your filters</p></div>
                                    </td></tr>
                                ) : visibleTokens.map((token) => {
                                    const isFav = favorites.has(token.symbol);
                                    return (
                                        <tr key={token.symbol} className={`uw-row${isFav ? ' uw-row--fav' : ''}`}>

                                            {/* Star */}
                                            <td className="uw-col-star">
                                                <button
                                                    className={`uw-star-btn${isFav ? ' active' : ''}`}
                                                    onClick={() => toggleFav(token.symbol)}
                                                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                                >{isFav ? '★' : '☆'}</button>
                                            </td>

                                            {/* Token identity */}
                                            <td className="uw-col-token">
                                                <div className="uw-token-cell">
                                                    <TokenIcon symbol={token.symbol} size={28} />
                                                    <div className="uw-token-info">
                                                        <div className="uw-token-name-row">
                                                            <span className="uw-symbol">{token.symbol}</span>
                                                            {token.hasPool && <span className="uw-pool-badge" title={`Pools: ${token.poolPairs.join(', ')}`}>◈</span>}
                                                        </div>
                                                        <span className="uw-token-full-name">{token.name}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Balances */}
                                            <td className="uw-col-num">
                                                {token.liquid > 0
                                                    ? <span className="number">{fmt(token.liquid)}</span>
                                                    : <span className="uw-zero">—</span>}
                                            </td>
                                            <td className="uw-col-num">
                                                {token.staked > 0
                                                    ? <span className="number uw-staked">{fmt(token.staked)}</span>
                                                    : <span className="uw-zero">—</span>}
                                            </td>
                                            <td className="uw-col-num">
                                                {token.delegatedOut > 0
                                                    ? <span className="number uw-del-out">{fmt(token.delegatedOut)}</span>
                                                    : <span className="uw-zero">—</span>}
                                            </td>
                                            <td className="uw-col-num">
                                                {token.delegatedIn > 0
                                                    ? <span className="number uw-del-in">{fmt(token.delegatedIn)}</span>
                                                    : <span className="uw-zero">—</span>}
                                            </td>
                                            <td className="uw-col-num">
                                                {token.pendingUnstake > 0
                                                    ? <span className="number uw-unstaking">{fmt(token.pendingUnstake)}</span>
                                                    : <span className="uw-zero">—</span>}
                                            </td>
                                            <td className="uw-col-num">
                                                {token.pendingUndel > 0
                                                    ? <span className="number uw-undel">{fmt(token.pendingUndel)}</span>
                                                    : <span className="uw-zero">—</span>}
                                            </td>

                                            {/* USD value */}
                                            <td className="uw-col-usd">
                                                {token.price > 0 ? (
                                                    <div className="uw-usd-cell">
                                                        <span className="uw-usd-val">{fmtUsd(token.totalValue) ?? '—'}</span>
                                                        <span className="uw-price-tiny">${token.price < 0.001 ? token.price.toFixed(6) : token.price.toFixed(4)}/ea</span>
                                                    </div>
                                                ) : <span className="uw-zero">—</span>}
                                            </td>

                                            {/* Actions */}
                                            {isOwnWallet && (
                                                <td className="uw-col-actions">
                                                    <div className="uw-actions">
                                                        {token.hasPool && (
                                                            <button className="uw-action-btn uw-action-trade"
                                                                title={`Trade ${token.symbol}`}
                                                                onClick={() => navigate(`/swap?pair=${encodeURIComponent(token.poolPairs[0])}`)}>⇄</button>
                                                        )}
                                                        {token.stakingEnabled && token.liquid > 0 && (
                                                            <button className="uw-action-btn uw-action-stake"
                                                                title="Stake" onClick={() => openAction(token, 'stake')}>▲</button>
                                                        )}
                                                        {token.stakingEnabled && token.staked > 0 && (
                                                            <button className="uw-action-btn uw-action-unstake"
                                                                title="Unstake" onClick={() => openAction(token, 'unstake')}>▼</button>
                                                        )}
                                                        {token.delegationEnabled && token.staked > 0 && (
                                                            <button className="uw-action-btn uw-action-delegate"
                                                                title="Delegate" onClick={() => openAction(token, 'delegate')}>→</button>
                                                        )}
                                                        {token.delegationEnabled && token.delegatedOut > 0 && (
                                                            <button className="uw-action-btn uw-action-undelegate"
                                                                title="Undelegate" onClick={() => openAction(token, 'undelegate')}>←</button>
                                                        )}
                                                        {/* Hide token */}
                                                        <button className="uw-action-btn uw-action-hide"
                                                            title="Hide this token" onClick={() => hideToken(token.symbol)}>✕</button>
                                                        {/* History */}
                                                        <a className="uw-action-btn uw-action-history"
                                                            href={`https://he.dtools.dev/tx/${viewAccount}?token=${token.symbol}`}
                                                            target="_blank" rel="noopener noreferrer"
                                                            title="Transaction history">📜</a>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Show hidden tokens hint */}
                    {hiddenCount > 0 && !search.trim() && (
                        <div className="uw-hidden-hint">
                            {hiddenCount} token{hiddenCount > 1 ? 's' : ''} hidden.{' '}
                            <button className="uw-hint-link" onClick={() => setShowManage(true)}>
                                Manage visibility
                            </button>
                        </div>
                    )}

                    {/* ── LP Positions ── */}
                    {data.lpPositions.length > 0 && (
                        <div className="uw-lp-section">
                            <h2 className="uw-section-title">
                                Liquidity Positions
                                <span className="uw-lp-count">{data.lpPositions.length}</span>
                            </h2>
                            <div className="uw-lp-grid">
                                {data.lpPositions.map((pos) => {
                                    const [base, quote] = pos.tokenPair.split(':');
                                    return (
                                        <div key={pos.tokenPair} className="uw-lp-card card"
                                            onClick={() => navigate(`/pool/${encodeURIComponent(pos.tokenPair)}`)}
                                            style={{ cursor: 'pointer' }}>
                                            <div className="uw-lp-card-inner">
                                                <div className="token-icon-stack">
                                                    <TokenIcon symbol={base} size={30} />
                                                    <TokenIcon symbol={quote} size={30} />
                                                </div>
                                                <div>
                                                    <div className="uw-lp-pair">{base} / {quote}</div>
                                                    <div className="uw-lp-shares">{fmt(pos.shares, 6)} shares</div>
                                                </div>
                                                <span className="uw-lp-arrow">↗</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                </>) : null}
            </div>

            {/* ── Manage Visibility Modal ── */}
            {showManage && (
                <ManageModal
                    allTokens={allTokens}
                    hidden={hidden}
                    onHide={hideToken}
                    onShow={showToken}
                    onClose={() => setShowManage(false)}
                />
            )}

            {/* ── Action Modal ── */}
            {action && (
                <Modal isOpen onClose={closeAction} size="sm"
                    title={`${{ stake: '▲ Stake', unstake: '▼ Unstake', delegate: '→ Delegate', undelegate: '← Undelegate' }[action.type]} ${action.token.symbol}`}>
                    <div className="uw-modal-body">
                        {action.type === 'delegate' && (
                            <div className="uw-modal-field">
                                <label className="uw-modal-label">Recipient username</label>
                                <input className="input" placeholder="@username"
                                    value={actionTo} onChange={(e) => setActionTo(e.target.value.replace(/^@/, ''))} />
                            </div>
                        )}
                        <div className="uw-modal-field">
                            <label className="uw-modal-label">
                                Amount
                                <span className="uw-modal-avail">
                                    {action.type === 'stake' && `Liquid: ${fmt(action.token.liquid, action.token.precision)}`}
                                    {action.type === 'unstake' && `Staked: ${fmt(action.token.staked, action.token.precision)}`}
                                    {action.type === 'delegate' && `Staked: ${fmt(action.token.staked, action.token.precision)}`}
                                    {action.type === 'undelegate' && `Delegated: ${fmt(action.token.delegatedOut, action.token.precision)}`}
                                </span>
                            </label>
                            <div className="uw-amount-row">
                                <input type="number" className="input" placeholder="0.0"
                                    value={actionAmt} onChange={(e) => setActionAmt(e.target.value)} min="0" step="any" />
                                <button className="btn btn-ghost btn-sm" onClick={() => {
                                    const max = action.type === 'stake' ? action.token.liquid
                                        : action.type === 'undelegate' ? action.token.delegatedOut
                                            : action.token.staked;
                                    setActionAmt(fmtPrecision(max, action.token.precision));
                                }}>Max</button>
                            </div>
                        </div>
                        <div className="uw-modal-actions">
                            <button className="btn btn-ghost" onClick={closeAction} disabled={submitting}>Cancel</button>
                            <button
                                className={`btn ${action.type === 'unstake' || action.type === 'undelegate' ? 'btn-danger' : 'btn-primary'}`}
                                onClick={submitAction} disabled={submitting}>
                                {submitting ? 'Confirming...' : action.type.charAt(0).toUpperCase() + action.type.slice(1)}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}