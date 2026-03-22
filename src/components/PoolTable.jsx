import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import TokenIcon from './TokenIcon.jsx';
import Modal from './Modal.jsx';
import PoolDetailModal from './PoolDetailModal.jsx';
import './PoolTable.css';

// ── Formatters ────────────────────────────────────────────────────────────

function formatNumber(num, decimals = 2) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toFixed(decimals);
}

function formatUsd(num) {
    const n = parseFloat(num);
    if (isNaN(n) || n === 0) return '—';
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(4);
}

function formatApr(apr) {
    if (!apr || apr <= 0) return '—';
    // Cap display — absurdly high APRs usually mean near-zero liquidity pools
    if (apr > 9999) return '>9999%';
    return apr.toFixed(1) + '%';
}

function aprColor(apr) {
    if (!apr || apr <= 0) return 'var(--text-muted)';
    if (apr > 9999) return 'var(--text-muted)'; // unreliable, dim it
    if (apr >= 100) return '#22c55e';
    if (apr >= 30) return '#84cc16';
    if (apr >= 10) return '#eab308';
    return 'var(--text-secondary)';
}

function getVolumeInHive(pool) {
    const baseVolume = parseFloat(pool.baseVolume) || 0;
    const price = parseFloat(pool.basePrice) || 0;
    const [base, quote] = pool.tokenPair.split(':');
    if (base === 'SWAP.HIVE') return baseVolume;
    if (quote === 'SWAP.HIVE') return baseVolume * price;
    return 0;
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

// ── Component ─────────────────────────────────────────────────────────────

export default function PoolTable({
    pools,
    tokenMap,
    volumeMap,
    volumeDays,
    setVolumeDays,
    volumeSource,
}) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('volumeUSD');
    const [sortDir, setSortDir] = useState('desc');
    const [favorites, setFavorites] = useState(loadFavorites);
    const [selectedPool, setSelectedPool] = useState(null); // tokenPair for detail modal

    const hasLiveData = volumeSource === 'tribaldex' && volumeMap;

    const toggleFavorite = useCallback((e, tokenPair) => {
        e.stopPropagation();
        setFavorites((prev) => {
            const next = new Set(prev);
            next.has(tokenPair) ? next.delete(tokenPair) : next.add(tokenPair);
            saveFavorites(next);
            return next;
        });
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
        list = [...list].sort((a, b) => {
            let av = 0, bv = 0;
            if (['volumeUSD', 'feeUSD', 'liquidityUSD', 'apr'].includes(sortKey)) {
                av = volumeMap?.[a.tokenPair]?.[sortKey] ?? -1;
                bv = volumeMap?.[b.tokenPair]?.[sortKey] ?? -1;
            } else {
                av = parseFloat(a[sortKey]) || 0;
                bv = parseFloat(b[sortKey]) || 0;
            }
            return sortDir === 'asc' ? av - bv : bv - av;
        });
        const favs = list.filter((p) => favorites.has(p.tokenPair));
        const rest = list.filter((p) => !favorites.has(p.tokenPair));
        return [...favs, ...rest];
    }, [pools, search, sortKey, sortDir, volumeMap, favorites]);

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

                {setVolumeDays && (
                    <div className="period-selector">
                        {PERIODS.map(({ label, days }) => (
                            <button
                                key={days}
                                className={`btn btn-sm ${volumeDays === days ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setVolumeDays(days)}
                                disabled={volumeSource === 'loading'}
                            >
                                {label}
                            </button>
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
                </div>
            </div>

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
                                    <th className="sortable col-num" onClick={() => handleSort('liquidityUSD')}
                                        title="Total liquidity in USD">
                                        Liq.{si('liquidityUSD')}
                                    </th>
                                    <th className="sortable col-num" onClick={() => handleSort('volumeUSD')}
                                        title={`Total volume USD – ${volumeDays}d`}>
                                        Vol {periodLabel}{si('volumeUSD')}
                                    </th>
                                    <th className="sortable col-num" onClick={() => handleSort('feeUSD')}
                                        title={`Fees collected USD – ${volumeDays}d`}>
                                        Fees {periodLabel}{si('feeUSD')}
                                    </th>
                                    <th className="sortable col-apr" onClick={() => handleSort('apr')}
                                        title={`Estimated annualised APR from fees over ${volumeDays}d. Very high values (&gt;9999%) indicate low-liquidity pools.`}>
                                        APR{si('apr')}
                                    </th>
                                </>
                            ) : (
                                <>
                                    <th className="sortable col-num" onClick={() => handleSort('baseQuantity')}>
                                        Base{si('baseQuantity')}
                                    </th>
                                    <th className="sortable col-num" onClick={() => handleSort('quoteQuantity')}>
                                        Quote{si('quoteQuantity')}
                                    </th>
                                    <th className="sortable col-num" onClick={() => handleSort('baseVolume')}>
                                        Volume{si('baseVolume')}
                                    </th>
                                </>
                            )}

                            <th className="col-actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={hasLiveData ? 7 : 6}>
                                    <div className="empty-state">
                                        <span className="icon">🔍</span>
                                        <p>No pools found</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filtered.map((pool) => {
                                const [base, quote] = pool.tokenPair.split(':');
                                const isFav = favorites.has(pool.tokenPair);
                                const stats = volumeMap?.[pool.tokenPair];
                                const apr = stats?.apr ?? 0;
                                const aprReliable = apr > 0 && apr <= 9999;

                                return (
                                    <tr
                                        key={pool._id || pool.tokenPair}
                                        className={`pool-row${isFav ? ' pool-row--fav' : ''}`}
                                        onClick={() => navigate(`/pool/${encodeURIComponent(pool.tokenPair)}`)}
                                    >
                                        {/* Star */}
                                        <td className="col-fav" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className={`fav-btn${isFav ? ' fav-btn--active' : ''}`}
                                                onClick={(e) => toggleFavorite(e, pool.tokenPair)}
                                                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                            >
                                                {isFav ? '★' : '☆'}
                                            </button>
                                        </td>

                                        {/* Pool — icons + name stacked compactly */}
                                        <td className="col-pool">
                                            <div className="token-pair">
                                                <div className="token-icon-stack">
                                                    <TokenIcon symbol={base} size={26} />
                                                    <TokenIcon symbol={quote} size={26} />
                                                </div>
                                                <div className="pair-info">
                                                    <span className="pair-name">{base}/{quote}</span>
                                                    <span className="pair-meta">
                                                        {parseFloat(pool.basePrice).toPrecision(4)}
                                                        {hasLiveData && stats
                                                            ? <> · {formatNumber(pool.totalShares)} shares</>
                                                            : null}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {hasLiveData ? (
                                            <>
                                                <td className="col-num">
                                                    <span className="number">{formatUsd(stats?.liquidityUSD)}</span>
                                                </td>
                                                <td className="col-num">
                                                    <span className="number">{formatUsd(stats?.volumeUSD)}</span>
                                                </td>
                                                <td className="col-num">
                                                    <span className="number">{formatUsd(stats?.feeUSD)}</span>
                                                </td>
                                                <td className="col-apr">
                                                    <span
                                                        className="apr-badge"
                                                        style={{ color: aprColor(apr) }}
                                                        title={apr > 9999 ? 'Very low liquidity — APR unreliable' : `${apr.toFixed(2)}% annualised`}
                                                    >
                                                        {formatApr(apr)}
                                                        {apr > 9999 && <span style={{ fontSize: '0.7em', marginLeft: 2 }}>⚠</span>}
                                                    </span>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="col-num">
                                                    <span className="number">{formatNumber(pool.baseQuantity)}</span>
                                                    <span className="unit"> {base}</span>
                                                </td>
                                                <td className="col-num">
                                                    <span className="number">{formatNumber(pool.quoteQuantity)}</span>
                                                    <span className="unit"> {quote}</span>
                                                </td>
                                                <td className="col-num">
                                                    <span className="number">{formatNumber(getVolumeInHive(pool))}</span>
                                                    <span className="unit"> HIVE</span>
                                                </td>
                                            </>
                                        )}

                                        <td className="col-actions">
                                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => navigate(`/swap?pair=${encodeURIComponent(pool.tokenPair)}`)}
                                                >
                                                    Swap
                                                </button>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    title="Quick details"
                                                    onClick={() => setSelectedPool(pool.tokenPair)}
                                                >
                                                    ↗
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pool detail modal */}
            <Modal
                isOpen={!!selectedPool}
                onClose={() => setSelectedPool(null)}
                title=""
                size="full"
            >
                {selectedPool && (
                    <PoolDetailModal
                        tokenPair={selectedPool}
                        onClose={() => setSelectedPool(null)}
                        stats={volumeMap?.[selectedPool] ?? null}
                        volumeDays={volumeDays}
                    />
                )}
            </Modal>
        </div>
    );
}