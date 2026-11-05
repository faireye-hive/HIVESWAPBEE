import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { findAllPages, getAllTokensMeta } from '../api/hiveEngine';
import DelegateModal from '../components/DelegateModal';
import TokenIcon from '../components/TokenIcon';
import './Tokens.css';

const PAGE_SIZE = 25;

function parseChange(raw, expiration) {
    if (expiration && Date.now() / 1000 > Number(expiration)) return null;
    if (raw == null || raw === '') return null;
    const n = parseFloat(String(raw).replace('%', ''));
    return Number.isFinite(n) ? n : null;
}

function liveVolume(raw, expiration) {
    if (expiration && Date.now() / 1000 > Number(expiration)) return 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
}

function fmtPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '—';
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4);
    if (n >= 0.0001) return n.toFixed(6);
    return n.toExponential(2);
}

function fmtVol(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(4);
}

export default function Tokens() {
    const navigate = useNavigate();
    const [metrics, setMetrics] = useState([]);
    const [names, setNames] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ key: 'volume', dir: 'desc' });
    const [page, setPage] = useState(0);
    const [selectedToken, setSelectedToken] = useState(null);

    const load = () => {
        let mounted = true;
        setLoading(true);
        setError(null);
        Promise.all([
            findAllPages('market', 'metrics'),
            getAllTokensMeta(1000, 0).catch(() => []),
            getAllTokensMeta(1000, 1000).catch(() => []),
        ]).then(([rows, meta1, meta2]) => {
            if (!mounted) return;
            const nameMap = {};
            for (const token of [...(meta1 || []), ...(meta2 || [])]) {
                if (token?.symbol) nameMap[token.symbol] = token.name || token.symbol;
            }
            setNames(nameMap);
            setMetrics(Array.isArray(rows) ? rows : []);
        }).catch((err) => {
            if (mounted) setError(err.message || 'Could not load tokens');
        }).finally(() => {
            if (mounted) setLoading(false);
        });
        return () => { mounted = false; };
    };

    useEffect(() => load(), []);

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = metrics
            .filter((m) => m?.symbol)
            .map((m) => ({
                symbol: m.symbol,
                name: names[m.symbol] || '',
                price: parseFloat(m.lastPrice) || 0,
                change: parseChange(m.priceChangePercent, m.lastDayPriceExpiration),
                volume: liveVolume(m.volume, m.volumeExpiration),
                bid: parseFloat(m.highestBid) || 0,
                ask: parseFloat(m.lowestAsk) || 0,
            }))
            .filter((m) => !q || m.symbol.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));

        const dir = sort.dir === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            const av = a[sort.key];
            const bv = b[sort.key];
            if (typeof av === 'string') return av.localeCompare(bv) * dir;
            return ((av ?? -Infinity) - (bv ?? -Infinity)) * dir;
        });
        return list;
    }, [metrics, names, search, sort]);

    useEffect(() => { setPage(0); }, [search, sort]);

    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const toggleSort = (key) => {
        setSort((prev) => (
            prev.key === key
                ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: key === 'symbol' ? 'asc' : 'desc' }
        ));
    };

    const header = (key, label) => (
        <th className="sortable" onClick={() => toggleSort(key)}>
            {label}{sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
        </th>
    );

    return (
        <div className="page">
            <div className="container tokens-page">
                <div className="page-header tokens-header">
                    <div>
                        <h1 className="page-title">Tokens</h1>
                        <p className="page-subtitle">
                            Hive-Engine order book markets, priced in SWAP.HIVE.
                            {rows.length > 0 && ` ${rows.length} tokens.`}
                        </p>
                    </div>
                    <input
                        type="text"
                        className="input"
                        placeholder="Search tokens..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="card" style={{ padding: 0 }}>
                    {loading ? (
                        <div style={{ padding: 28 }}>
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="skeleton" style={{ height: 36, marginBottom: 8 }} />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="empty-state">
                            <p>{error}</p>
                            <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
                        </div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table>
                                <thead>
                                    <tr>
                                        {header('symbol', 'Token')}
                                        {header('price', 'Price')}
                                        {header('change', '24h')}
                                        {header('volume', 'Volume')}
                                        {header('bid', 'Bid')}
                                        {header('ask', 'Ask')}
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((m) => (
                                        <tr key={m.symbol} className="token-row" onClick={() => navigate(`/trade/${m.symbol}`)}>
                                            <td>
                                                <div className="token-cell">
                                                    <TokenIcon symbol={m.symbol} size={28} />
                                                    <span>
                                                        <strong>{m.symbol}</strong>
                                                        {m.name && m.name !== m.symbol && <small>{m.name}</small>}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="number">{fmtPrice(m.price)}</td>
                                            <td className={m.change > 0 ? 'chg-up' : m.change < 0 ? 'chg-down' : ''}>
                                                {m.change == null ? '—' : `${m.change > 0 ? '+' : ''}${m.change.toFixed(2)}%`}
                                            </td>
                                            <td className="number">{fmtVol(m.volume)}</td>
                                            <td className="number">{fmtPrice(m.bid)}</td>
                                            <td className="number">{fmtPrice(m.ask)}</td>
                                            <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                                <div className="token-actions">
                                                    <Link to={`/trade/${m.symbol}`} className="btn btn-primary btn-sm">Trade</Link>
                                                    <Link to={`/swap?from=SWAP.HIVE&to=${encodeURIComponent(m.symbol)}`} className="btn btn-ghost btn-sm">Swap</Link>
                                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedToken(m.symbol)}>
                                                        Delegate
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {visible.length === 0 && (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                                                No tokens found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!loading && !error && rows.length > PAGE_SIZE && (
                        <div className="token-pager">
                            <button type="button" className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                                Previous
                            </button>
                            <span>{page + 1} / {pageCount}</span>
                            <button type="button" className="btn btn-ghost btn-sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {selectedToken && (
                <DelegateModal symbol={selectedToken} onClose={() => setSelectedToken(null)} />
            )}
        </div>
    );
}
