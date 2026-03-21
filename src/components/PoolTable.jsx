import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import TokenIcon from './TokenIcon.jsx';
import './PoolTable.css';

function formatNumber(num, decimals = 2) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(decimals) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(decimals) + 'K';
    return n.toFixed(decimals);
}

function getVolumeInHive(pool) {
    const [base, quote] = pool.tokenPair.split(':');

    const baseVolume = parseFloat(pool.baseVolume) || 0;
    const price = parseFloat(pool.basePrice) || 0;

    if (base === 'SWAP.HIVE') {
        return baseVolume;
    }

    if (quote === 'SWAP.HIVE') {
        return baseVolume * price;
    }

    return 0;
}

export default function PoolTable({ pools, tokenMap }) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('baseVolume');
    const [sortDir, setSortDir] = useState('desc');

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const sortIndicator = (key) => {
        if (sortKey !== key) return '';
        return sortDir === 'asc' ? ' ▲' : ' ▼';
    };

    const filtered = useMemo(() => {
        let list = pools || [];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((p) => p.tokenPair.toLowerCase().includes(q));
        }
        list = [...list].sort((a, b) => {
            const av = parseFloat(a[sortKey]) || 0;
            const bv = parseFloat(b[sortKey]) || 0;
            return sortDir === 'asc' ? av - bv : bv - av;
        });
        return list;
    }, [pools, search, sortKey, sortDir]);

    return (
        <div>
            <div className="toolbar">
                <div className="search-bar">
                    <span className="search-icon">⌕</span>
                    <input
                        type="text"
                        className="input"
                        placeholder="Search pools... (e.g. SWAP.HIVE, BEE)"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="pool-count">
                    <span className="badge badge-accent">{filtered.length} pools</span>
                </div>
            </div>

            <div className="table-container glass">
                <table>
                    <thead>
                        <tr>
                            <th>Pool</th>
                            <th className="sortable" onClick={() => handleSort('basePrice')}>
                                Price{sortIndicator('basePrice')}
                            </th>
                            <th className="sortable" onClick={() => handleSort('baseQuantity')}>
                                Base Reserve{sortIndicator('baseQuantity')}
                            </th>
                            <th className="sortable" onClick={() => handleSort('quoteQuantity')}>
                                Quote Reserve{sortIndicator('quoteQuantity')}
                            </th>
                            <th className="sortable" onClick={() => handleSort('baseVolume')}>
                                Volume (Base){sortIndicator('baseVolume')}
                            </th>
                            <th className="sortable" onClick={() => handleSort('totalShares')}>
                                Total Shares{sortIndicator('totalShares')}
                            </th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan="7">
                                    <div className="empty-state">
                                        <span className="icon">🔍</span>
                                        <p>No pools found</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filtered.map((pool) => {
                                const [base, quote] = pool.tokenPair.split(':');
                                return (
                                    <tr
                                        key={pool._id || pool.tokenPair}
                                        className="pool-row"
                                        onClick={() => navigate(`/pool/${encodeURIComponent(pool.tokenPair)}`)}
                                    >
                                        <td>
                                            <div className="token-pair">
                                                <div className="token-icon-stack">
                                                    <TokenIcon symbol={base} size={32} />
                                                    <TokenIcon symbol={quote} size={32} />
                                                </div>
                                                <div className="pair-info">
                                                    <span className="pair-name">{base} / {quote}</span>
                                                    <span className="pair-creator">by {pool.creator}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="number">{parseFloat(pool.basePrice).toFixed(6)}</span>
                                        </td>
                                        <td>
                                            <span className="number">{formatNumber(pool.baseQuantity)}</span>
                                            <span className="unit"> {base}</span>
                                        </td>
                                        <td>
                                            <span className="number">{formatNumber(pool.quoteQuantity)}</span>
                                            <span className="unit"> {quote}</span>
                                        </td>
                                        <td>
                                            <span className="number">{formatNumber(getVolumeInHive(pool))}</span>
                                        </td>
                                        <td>
                                            <span className="number">{formatNumber(pool.totalShares)}</span>
                                        </td>
                                        <td>
                                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => navigate(`/swap?pair=${encodeURIComponent(pool.tokenPair)}`)}
                                                >
                                                    Swap
                                                </button>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => navigate(`/pool/${encodeURIComponent(pool.tokenPair)}`)}
                                                >
                                                    Details
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
        </div>
    );
}
