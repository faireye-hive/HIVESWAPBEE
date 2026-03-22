import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import TokenIcon from './TokenIcon.jsx';
import Modal from './Modal.jsx';
import PoolDetailModal from './PoolDetailModal.jsx';
import { calcDistroStats, fetchUserPositionsCached } from '../hooks/usePools.js';
import './PoolTable.css';

// ── Formatters ────────────────────────────────────────────────────────────

function fmtN(num, dec = 2) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toFixed(dec);
}

function fmtUsd(num) {
    const n = parseFloat(num);
    if (isNaN(n) || n === 0) return '—';
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(4);
}

function fmtPrice(num) {
    const n = parseFloat(num);
    if (isNaN(n) || n === 0) return '—';
    if (n >= 1000) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    if (n >= 0.001) return n.toFixed(6);
    return n.toPrecision(4);
}

function fmtApr(apr) {
    if (!apr || apr <= 0) return '—';
    if (apr > 9999) return '>9999%';
    return apr.toFixed(1) + '%';
}

function aprColor(apr) {
    if (!apr || apr <= 0 || apr > 9999) return 'var(--text-muted)';
    if (apr >= 100) return '#22c55e';
    if (apr >= 30) return '#84cc16';
    if (apr >= 10) return '#eab308';
    return 'var(--text-secondary)';
}

function getVolumeInHive(pool) {
    const baseVolume = parseFloat(pool.baseVolume) || 0;
    const price = parseFloat(pool.basePrice) || 0;
    const [base] = pool.tokenPair.split(':');
    if (base === 'SWAP.HIVE') return baseVolume;
    return baseVolume * price;
}

// ── Favorites ─────────────────────────────────────────────────────────────

const FAV_KEY = 'hiveswapbee_fav_pools';
function loadFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
    catch { return new Set(); }
}
function saveFavorites(set) {
    localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
}

const PERIODS = [
    { label: '1D', days: 1 },
    { label: '3D', days: 3 },
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
];

// ── Expanded row panel ────────────────────────────────────────────────────

function ExpandedRow({ pool, stats, distroMap, tokenPriceMap, colSpan }) {
    const [base, quote] = pool.tokenPair.split(':');
    const basePrice = parseFloat(pool.basePrice) || 0;
    const quotePrice = basePrice > 0 ? 1 / basePrice : 0;

    const batches = distroMap?.[pool.tokenPair];
    const hasDistro = batches?.length > 0;
    const distro = hasDistro
        ? calcDistroStats(batches, tokenPriceMap, stats?.liquidityUSD)
        : null;

    // Collect unique reward tokens across all batches
    const rewardTokens = useMemo(() => {
        if (!batches) return [];
        const seen = new Set();
        const tokens = [];
        for (const b of batches) {
            for (const tb of b.tokenBalances || []) {
                if (!seen.has(tb.symbol)) {
                    seen.add(tb.symbol);
                    const price = tokenPriceMap?.[tb.symbol] ?? 0;
                    const ticksLeft = parseInt(b.numTicksLeft) || 1;
                    const dailyQty = parseFloat(tb.quantity) / ticksLeft;
                    tokens.push({ symbol: tb.symbol, dailyQty, dailyUsd: dailyQty * price });
                }
            }
        }
        return tokens;
    }, [batches, tokenPriceMap]);

    const baseUsd = tokenPriceMap?.[base] ?? 0;
    const quoteUsd = tokenPriceMap?.[quote] ?? 0;

    return (
        <tr className="pool-expand-row">
            <td colSpan={colSpan} className="pool-expand-cell">
                <div className="pool-expand-panel">

                    {/* ── Prices ── */}
                    <div className="pep-group">
                        <div className="pep-group-title">Exchange Rate</div>
                        <div className="pep-prices">
                            <div className="pep-price-item">
                                <TokenIcon symbol={base} size={18} />
                                <span className="pep-price-label">1 {base}</span>
                                <span className="pep-price-eq">=</span>
                                <span className="pep-price-value">{fmtPrice(basePrice)} {quote}</span>
                                {baseUsd > 0 && <span className="pep-price-usd">≈ {fmtUsd(baseUsd)}</span>}
                            </div>
                            <div className="pep-price-item">
                                <TokenIcon symbol={quote} size={18} />
                                <span className="pep-price-label">1 {quote}</span>
                                <span className="pep-price-eq">=</span>
                                <span className="pep-price-value">{fmtPrice(quotePrice)} {base}</span>
                                {quoteUsd > 0 && <span className="pep-price-usd">≈ {fmtUsd(quoteUsd)}</span>}
                            </div>
                        </div>
                    </div>

                    {/* ── Reserves ── */}
                    <div className="pep-group">
                        <div className="pep-group-title">Reserves</div>
                        <div className="pep-reserves">
                            <div className="pep-reserve-item">
                                <TokenIcon symbol={base} size={18} />
                                <span className="pep-reserve-qty">{fmtN(pool.baseQuantity, 4)}</span>
                                <span className="pep-reserve-sym">{base}</span>
                                {baseUsd > 0 && (
                                    <span className="pep-price-usd">≈ {fmtUsd(parseFloat(pool.baseQuantity) * baseUsd)}</span>
                                )}
                            </div>
                            <div className="pep-reserve-item">
                                <TokenIcon symbol={quote} size={18} />
                                <span className="pep-reserve-qty">{fmtN(pool.quoteQuantity, 4)}</span>
                                <span className="pep-reserve-sym">{quote}</span>
                                {quoteUsd > 0 && (
                                    <span className="pep-price-usd">≈ {fmtUsd(parseFloat(pool.quoteQuantity) * quoteUsd)}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Rewards ── */}
                    {hasDistro && rewardTokens.length > 0 && (
                        <div className="pep-group">
                            <div className="pep-group-title">🎁 Daily Rewards</div>
                            <div className="pep-rewards">
                                {rewardTokens.map((t) => (
                                    <div key={t.symbol} className="pep-reward-chip">
                                        <span className="pep-reward-sym">{t.symbol}</span>
                                        <span className="pep-reward-qty">{fmtN(t.dailyQty, 3)}/day</span>
                                        {t.dailyUsd > 0 && (
                                            <span className="pep-reward-usd">≈ {fmtUsd(t.dailyUsd)}</span>
                                        )}
                                    </div>
                                ))}
                                {distro?.dailyUSD > 0 && (
                                    <div className="pep-reward-total">
                                        Total: <strong>{fmtUsd(distro.dailyUSD)}/day</strong>
                                        {distro.apr > 0 && distro.apr <= 9999 && (
                                            <span style={{ color: '#22c55e', marginLeft: 6 }}>
                                                ({fmtApr(distro.apr)} APR)
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}

// ── Main component ────────────────────────────────────────────────────────

export default function PoolTable({
    pools, tokenMap,
    volumeMap, volumeDays, setVolumeDays, volumeSource,
    tokenPriceMap,
    distroMap,
}) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('volumeUSD');
    const [sortDir, setSortDir] = useState('desc');
    const [favorites, setFavorites] = useState(loadFavorites);
    const [selectedPool, setSelectedPool] = useState(null);  // modal
    const [expandedPool, setExpandedPool] = useState(null);  // inline expand

    // ── User filter ──────────────────────────────────────────────────────
    const [userFilter, setUserFilter] = useState('');
    // Map of tokenPair → { shares, account } for the filtered user
    const [userPositionMap, setUserPositionMap] = useState(null);
    const [userFilterState, setUserFilterState] = useState('idle'); // 'idle'|'loading'|'found'|'empty'|'error'
    const debounceRef = useRef(null);

    useEffect(() => {
        const name = userFilter.trim().replace(/^@/, '').toLowerCase();
        if (!name) {
            setUserPositionMap(null);
            setUserFilterState('idle');
            return;
        }
        setUserFilterState('loading');
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            try {
                // Uses module-level cache (3min TTL) — no repeated RPC calls
                const positions = await fetchUserPositionsCached(name);
                if (!positions || positions.length === 0) {
                    setUserPositionMap(new Map());
                    setUserFilterState('empty');
                } else {
                    const map = new Map();
                    for (const p of positions) {
                        map.set(p.tokenPair, p);
                    }
                    setUserPositionMap(map);
                    setUserFilterState('found');
                }
            } catch {
                setUserPositionMap(null);
                setUserFilterState('error');
            }
        }, 600);
        return () => clearTimeout(debounceRef.current);
    }, [userFilter]);

    const hasLiveData = volumeSource === 'tribaldex' && volumeMap;
    const colSpan = hasLiveData ? 7 : 6;

    const toggleFavorite = useCallback((e, tokenPair) => {
        e.stopPropagation();
        setFavorites((prev) => {
            const next = new Set(prev);
            next.has(tokenPair) ? next.delete(tokenPair) : next.add(tokenPair);
            saveFavorites(next);
            return next;
        });
    }, []);

    const toggleExpand = useCallback((tokenPair) => {
        setExpandedPool((prev) => (prev === tokenPair ? null : tokenPair));
    }, []);

    const handleSort = (key) => {
        setSortKey(key);
        setSortDir((d) => (sortKey === key ? (d === 'asc' ? 'desc' : 'asc') : 'desc'));
    };

    const si = (key) => sortKey !== key ? '' : sortDir === 'asc' ? ' ▲' : ' ▼';

    const filtered = useMemo(() => {
        let list = pools || [];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((p) => p.tokenPair.toLowerCase().includes(q));
        }
        // Filter by user positions if a username is active
        if (userPositionMap !== null) {
            list = list.filter((p) => userPositionMap.has(p.tokenPair));
        }
        list = [...list].sort((a, b) => {
            let av = 0, bv = 0;
            if (['volumeUSD', 'feeUSD', 'liquidityUSD', 'apr', 'totalApr'].includes(sortKey)) {
                if (sortKey === 'totalApr') {
                    const aS = volumeMap?.[a.tokenPair], bS = volumeMap?.[b.tokenPair];
                    const aD = calcDistroStats(distroMap?.[a.tokenPair], tokenPriceMap, aS?.liquidityUSD);
                    const bD = calcDistroStats(distroMap?.[b.tokenPair], tokenPriceMap, bS?.liquidityUSD);
                    av = (aS?.apr || 0) + (aD?.apr || 0);
                    bv = (bS?.apr || 0) + (bD?.apr || 0);
                } else {
                    av = volumeMap?.[a.tokenPair]?.[sortKey] ?? -1;
                    bv = volumeMap?.[b.tokenPair]?.[sortKey] ?? -1;
                }
            } else {
                av = parseFloat(a[sortKey]) || 0;
                bv = parseFloat(b[sortKey]) || 0;
            }
            return sortDir === 'asc' ? av - bv : bv - av;
        });
        const favs = list.filter((p) => favorites.has(p.tokenPair));
        const rest = list.filter((p) => !favorites.has(p.tokenPair));
        return [...favs, ...rest];
    }, [pools, search, sortKey, sortDir, volumeMap, favorites, distroMap, tokenPriceMap, userPositionMap]);

    const periodLabel = PERIODS.find((p) => p.days === volumeDays)?.label ?? '';

    return (
        <div>
            {/* Toolbar */}
            <div className="toolbar">
                <div className="search-bar">
                    <span className="search-icon">⌕</span>
                    <input
                        type="text"
                        className="input"
                        placeholder="Search pools..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* User filter */}
                <div className={`search-bar user-filter-bar${userFilterState === 'found' ? ' user-filter-bar--active' : ''}${userFilterState === 'empty' || userFilterState === 'error' ? ' user-filter-bar--warn' : ''}`}>
                    <span className="search-icon">
                        {userFilterState === 'loading' ? '⟳' : '👤'}
                    </span>
                    <input
                        type="text"
                        className="input"
                        placeholder="Filter by user..."
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                    />
                    {userFilter && (
                        <button
                            className="user-filter-clear"
                            onClick={() => setUserFilter('')}
                            title="Clear user filter"
                        >✕</button>
                    )}
                </div>
                {setVolumeDays && (
                    <div className="period-selector">
                        {PERIODS.map(({ label, days }) => (
                            <button
                                key={days}
                                className={`btn btn-sm ${volumeDays === days ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setVolumeDays(days)}
                                disabled={volumeSource === 'loading'}
                            >{label}</button>
                        ))}
                    </div>
                )}
                <div className="pool-count">
                    <span className="badge badge-accent">{filtered.length} pools</span>
                    {favorites.size > 0 && (
                        <span className="badge" style={{ marginLeft: 6, background: 'rgba(255,200,0,0.15)', color: '#ffc800' }}>
                            ★ {favorites.size}
                        </span>
                    )}
                    {userFilterState === 'found' && userPositionMap && (
                        <span className="badge" style={{ marginLeft: 6, background: 'rgba(99,179,237,0.15)', color: '#63b3ed' }}>
                            👤 @{userFilter.replace(/^@/, '')}
                        </span>
                    )}
                </div>
            </div>

            {/* User filter status messages */}
            {userFilterState === 'empty' && userFilter && (
                <div className="volume-fallback-notice">
                    👤 No pools found for <strong>@{userFilter.replace(/^@/, '')}</strong> — they may not have any active LP positions.
                </div>
            )}
            {userFilterState === 'error' && (
                <div className="volume-fallback-notice">
                    ⚠ Could not fetch positions for <strong>@{userFilter.replace(/^@/, '')}</strong>. Check the username and try again.
                </div>
            )}

            {volumeSource === 'fallback' && (
                <div className="volume-fallback-notice">
                    ⚠ Volume API unavailable — showing base volume from Hive-Engine.
                </div>
            )}

            <div className="table-container glass">
                <table className="pool-table-compact">
                    <thead>
                        <tr>
                            <th className="col-fav">★</th>
                            <th className="col-pool">Pool</th>
                            {hasLiveData ? (
                                <>
                                    <th className="sortable col-num" onClick={() => handleSort('liquidityUSD')}>Liq.{si('liquidityUSD')}</th>
                                    <th className="sortable col-num" onClick={() => handleSort('volumeUSD')}>Vol {periodLabel}{si('volumeUSD')}</th>
                                    <th className="sortable col-num" onClick={() => handleSort('feeUSD')}>Fees {periodLabel}{si('feeUSD')}</th>
                                    <th className="sortable col-apr" onClick={() => handleSort('totalApr')} title="Fee APR + Distribution APR">APR{si('totalApr')}</th>
                                </>
                            ) : (
                                <>
                                    <th className="sortable col-num" onClick={() => handleSort('baseQuantity')}>Base{si('baseQuantity')}</th>
                                    <th className="sortable col-num" onClick={() => handleSort('quoteQuantity')}>Quote{si('quoteQuantity')}</th>
                                    <th className="sortable col-num" onClick={() => handleSort('baseVolume')}>Volume{si('baseVolume')}</th>
                                </>
                            )}
                            <th className="col-actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={colSpan}>
                                <div className="empty-state"><span className="icon">🔍</span><p>No pools found</p></div>
                            </td></tr>
                        ) : filtered.map((pool) => {
                            const [base, quote] = pool.tokenPair.split(':');
                            const isFav = favorites.has(pool.tokenPair);
                            const isExpanded = expandedPool === pool.tokenPair;
                            const stats = volumeMap?.[pool.tokenPair];
                            const batches = distroMap?.[pool.tokenPair];
                            const hasDistro = batches?.length > 0;
                            const distro = hasDistro ? calcDistroStats(batches, tokenPriceMap, stats?.liquidityUSD) : null;
                            const feeApr = stats?.apr || 0;
                            const distApr = distro?.apr || 0;
                            const totalApr = feeApr + distApr;
                            const basePrice = parseFloat(pool.basePrice) || 0;
                            const quotePrice = basePrice > 0 ? 1 / basePrice : 0;

                            return (
                                <React.Fragment key={pool._id || pool.tokenPair}>
                                    <tr
                                        className={`pool-row${isFav ? ' pool-row--fav' : ''}${isExpanded ? ' pool-row--expanded' : ''}`}
                                        onClick={() => toggleExpand(pool.tokenPair)}
                                    >
                                        {/* Star */}
                                        <td className="col-fav" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className={`fav-btn${isFav ? ' fav-btn--active' : ''}`}
                                                onClick={(e) => toggleFavorite(e, pool.tokenPair)}
                                            >{isFav ? '★' : '☆'}</button>
                                        </td>

                                        {/* Pool name + inline prices */}
                                        <td className="col-pool">
                                            <div className="token-pair">
                                                <div className="token-icon-stack">
                                                    <TokenIcon symbol={base} size={26} />
                                                    <TokenIcon symbol={quote} size={26} />
                                                </div>
                                                <div className="pair-info">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <span className="pair-name">{base}/{quote}</span>
                                                        {hasDistro && (
                                                            <span className="distro-badge" title="Active incentive rewards">🎁</span>
                                                        )}
                                                        <span className="expand-caret">{isExpanded ? '▲' : '▼'}</span>
                                                    </div>
                                                    {/* Always-visible inline prices */}
                                                    <div className="pair-prices">
                                                        <span className="pair-price-item">
                                                            1 {base} = <strong>{fmtPrice(basePrice)}</strong> {quote}
                                                        </span>
                                                        <span className="pair-price-sep">·</span>
                                                        <span className="pair-price-item">
                                                            1 {quote} = <strong>{fmtPrice(quotePrice)}</strong> {base}
                                                        </span>
                                                    </div>
                                                    {/* User position — shown when filter active, uses only cached data */}
                                                    {userPositionMap && (() => {
                                                        const pos = userPositionMap.get(pool.tokenPair);
                                                        if (!pos) return null;
                                                        const shares = parseFloat(pos.shares) || 0;
                                                        const totalShares = parseFloat(pool.totalShares) || 1;
                                                        const pct = (shares / totalShares) * 100;
                                                        const estBase = (shares / totalShares) * parseFloat(pool.baseQuantity);
                                                        const estQuote = (shares / totalShares) * parseFloat(pool.quoteQuantity);
                                                        return (
                                                            <div className="user-pos-row">
                                                                <span className="user-pos-badge">👤 {pct.toFixed(3)}%</span>
                                                                <span className="user-pos-item">{fmtN(estBase, 4)} {base}</span>
                                                                <span className="user-pos-sep">+</span>
                                                                <span className="user-pos-item">{fmtN(estQuote, 4)} {quote}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Stats columns */}
                                        {hasLiveData ? (
                                            <>
                                                <td className="col-num"><span className="number">{fmtUsd(stats?.liquidityUSD)}</span></td>
                                                <td className="col-num"><span className="number">{fmtUsd(stats?.volumeUSD)}</span></td>
                                                <td className="col-num"><span className="number">{fmtUsd(stats?.feeUSD)}</span></td>
                                                <td className="col-apr">
                                                    {totalApr > 0 ? (
                                                        <div className="apr-stack">
                                                            <span className="apr-total" style={{ color: aprColor(totalApr) }}>{fmtApr(totalApr)}</span>
                                                            {feeApr > 0 && <span className="apr-breakdown">{fmtApr(feeApr)} fees</span>}
                                                            {distApr > 0 && <span className="apr-breakdown apr-distro">+{fmtApr(distApr)} 🎁</span>}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                    )}
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="col-num"><span className="number">{fmtN(pool.baseQuantity)}</span><span className="unit"> {base}</span></td>
                                                <td className="col-num"><span className="number">{fmtN(pool.quoteQuantity)}</span><span className="unit"> {quote}</span></td>
                                                <td className="col-num"><span className="number">{fmtN(getVolumeInHive(pool))}</span><span className="unit"> HIVE</span></td>
                                            </>
                                        )}

                                        {/* Actions */}
                                        <td className="col-actions">
                                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => navigate(`/swap?pair=${encodeURIComponent(pool.tokenPair)}`)}
                                                >Swap</button>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    title="Full details"
                                                    onClick={() => setSelectedPool(pool.tokenPair)}
                                                >↗</button>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Expanded panel row */}
                                    {isExpanded && (
                                        <ExpandedRow
                                            pool={pool}
                                            stats={stats}
                                            distroMap={distroMap}
                                            tokenPriceMap={tokenPriceMap}
                                            colSpan={colSpan}
                                        />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Full detail modal */}
            <Modal isOpen={!!selectedPool} onClose={() => setSelectedPool(null)} title="" size="full">
                {selectedPool && (
                    <PoolDetailModal
                        tokenPair={selectedPool}
                        onClose={() => setSelectedPool(null)}
                        stats={volumeMap?.[selectedPool] ?? null}
                        volumeDays={volumeDays}
                        distroMap={distroMap}
                        tokenPriceMap={tokenPriceMap}
                    />
                )}
            </Modal>
        </div>
    );
}