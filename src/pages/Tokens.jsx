import React, { useState, useEffect } from 'react';
import { findMetrics } from '../api/hiveEngine';
import DelegateModal from '../components/DelegateModal';
import './Tokens.css';

export default function Tokens() {
    const [metrics, setMetrics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedToken, setSelectedToken] = useState(null);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        findMetrics(1000, 0)
            .then((data) => {
                if (!mounted) return;
                // sort by volume descending
                const sorted = (data || []).sort((a, b) => Number(b.volume) - Number(a.volume));
                setMetrics(sorted);
            })
            .catch(err => console.error(err))
            .finally(() => {
                if (mounted) setLoading(false);
            });
            
        return () => { mounted = false; };
    }, []);

    const filtered = metrics.filter(m => m.symbol.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="container page-content tokens-page">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <span className="page-icon">🪙</span>
                    <h1 className="page-title">Token Market</h1>
                </div>
                <div className="search-container">
                    <input
                        type="text"
                        className="input"
                        placeholder="Search tokens..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '250px' }}
                    />
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                        Loading token metrics...
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Token</th>
                                    <th>Last Price</th>
                                    <th>24h Change</th>
                                    <th>24h Volume (HIVE)</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((m) => {
                                    const change = parseFloat(m.priceChangePercent) || 0;
                                    const isPositive = change > 0;
                                    const isNegative = change < 0;
                                    
                                    return (
                                        <tr key={m.symbol}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontWeight: 600 }}>{m.symbol}</span>
                                                </div>
                                            </td>
                                            <td>{Number(m.lastPrice).toFixed(5)}</td>
                                            <td style={{ color: isPositive ? 'var(--success-color)' : isNegative ? 'var(--danger-color)' : 'inherit' }}>
                                                {isPositive ? '+' : ''}{change.toFixed(2)}%
                                            </td>
                                            <td>{Number(m.volume).toFixed(2)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <a href={`https://tribaldex.com/trade/${m.symbol}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                                                        Trade
                                                    </a>
                                                    <button className="btn btn-primary btn-sm" onClick={() => setSelectedToken(m.symbol)}>
                                                        Delegate
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>
                                            No tokens found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedToken && (
                <DelegateModal 
                    symbol={selectedToken} 
                    onClose={() => setSelectedToken(null)} 
                />
            )}
        </div>
    );
}
