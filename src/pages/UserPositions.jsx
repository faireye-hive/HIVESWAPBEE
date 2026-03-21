import React, { useEffect, useState } from 'react';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { findUserPositions, findPools } from '../api/hiveEngine.js';
import TokenIcon from '../components/TokenIcon.jsx';
import { useNavigate } from 'react-router-dom';

function formatNumber(num, decimals = 4) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    return n.toFixed(decimals);
}

export default function UserPositions() {
    const { user } = useKeychainContext();
    const navigate = useNavigate();
    const [positions, setPositions] = useState([]);
    const [pools, setPools] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setPositions([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        Promise.all([findUserPositions(user), findPools(1000, 0)])
            .then(([pos, allPools]) => {
                setPositions(pos || []);
                const pMap = {};
                (allPools || []).forEach((p) => (pMap[p.tokenPair] = p));
                setPools(pMap);
            })
            .finally(() => setLoading(false));
    }, [user]);

    if (!user) {
        return (
            <div className="page">
                <div className="container">
                    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                        <span style={{ fontSize: '3rem', display: 'block', marginBottom: 16 }}>🔑</span>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                            Connect your wallet to view your liquidity positions.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="container">
                <div className="page-header">
                    <h1 className="page-title">My Positions</h1>
                    <p className="page-subtitle">Your active liquidity positions across all Hive-Engine pools</p>
                </div>

                {loading ? (
                    <div>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12 }} />
                        ))}
                    </div>
                ) : positions.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                        <span style={{ fontSize: '3rem', display: 'block', marginBottom: 16 }}>💧</span>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            You don't have any active liquidity positions.
                        </p>
                        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
                            Explore Pools
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                        {positions.map((pos) => {
                            const pool = pools[pos.tokenPair];
                            const [base, quote] = pos.tokenPair.split(':');
                            const pct = pool ? ((parseFloat(pos.shares) / parseFloat(pool.totalShares)) * 100) : 0;
                            const estBase = pool ? (parseFloat(pos.shares) / parseFloat(pool.totalShares)) * parseFloat(pool.baseQuantity) : 0;
                            const estQuote = pool ? (parseFloat(pos.shares) / parseFloat(pool.totalShares)) * parseFloat(pool.quoteQuantity) : 0;

                            return (
                                <div
                                    key={pos._id || pos.tokenPair}
                                    className="card"
                                    style={{ cursor: 'pointer', transition: 'border-color var(--transition)' }}
                                    onClick={() => navigate(`/pool/${encodeURIComponent(pos.tokenPair)}`)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div className="token-icon-stack">
                                                <TokenIcon symbol={base} size={36} />
                                                <TokenIcon symbol={quote} size={36} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{base} / {quote}</div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                    {formatNumber(pos.shares)} shares · {pct.toFixed(2)}% of pool
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                            <div>
                                                <div className="stat-label">Est. {base}</div>
                                                <div style={{ fontWeight: 600 }}>{formatNumber(estBase)}</div>
                                            </div>
                                            <div>
                                                <div className="stat-label">Est. {quote}</div>
                                                <div style={{ fontWeight: 600 }}>{formatNumber(estQuote)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
