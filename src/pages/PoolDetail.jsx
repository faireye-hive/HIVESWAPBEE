import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePoolDetail } from '../hooks/usePools.js';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { findUserPositions } from '../api/hiveEngine.js';
import TokenIcon from '../components/TokenIcon.jsx';
import PositionsList from '../components/PositionsList.jsx';
import LiquidityForm from '../components/LiquidityForm.jsx';
import SwapForm from '../components/SwapForm.jsx';
import Modal from '../components/Modal.jsx';

function formatNumber(num, decimals = 4) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    return n.toFixed(decimals);
}

export default function PoolDetail() {
    const { tokenPair: rawPair } = useParams();
    const tokenPair = decodeURIComponent(rawPair || '');
    const navigate = useNavigate();
    const { user } = useKeychainContext();

    const { pool, positions, loading, error, refetch } = usePoolDetail(tokenPair);
    const [showLiquidity, setShowLiquidity] = useState(false);
    const [showSwap, setShowSwap] = useState(false);
    const [userPosition, setUserPosition] = useState(null);

    const [base, quote] = useMemo(() => tokenPair.split(':'), [tokenPair]);

    // Fetch user position when modal opens
    React.useEffect(() => {
        if (user && tokenPair) {
            findUserPositions(user).then((pos) => {
                const match = pos?.find((p) => p.tokenPair === tokenPair);
                setUserPosition(match || null);
            });
        } else {
            setUserPosition(null);
        }
    }, [user, tokenPair, showLiquidity]);

    if (loading) {
        return (
            <div className="page">
                <div className="container">
                    <div className="skeleton" style={{ height: 40, width: 300, marginBottom: 24 }} />
                    <div className="stats-grid" style={{ marginBottom: 32 }}>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 100 }} />
                        ))}
                    </div>
                    <div className="skeleton" style={{ height: 400 }} />
                </div>
            </div>
        );
    }

    if (error || !pool) {
        return (
            <div className="page">
                <div className="container">
                    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                        <p style={{ color: 'var(--red)', marginBottom: 16 }}>
                            {error || 'Pool not found'}
                        </p>
                        <button className="btn btn-secondary" onClick={() => navigate('/')}>
                            Back to Pools
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="container">
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" onClick={() => navigate('/')}>
                        ← Back
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                        <div className="token-icon-stack">
                            <TokenIcon symbol={base} size={40} />
                            <TokenIcon symbol={quote} size={40} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>
                                {base} / {quote}
                            </h1>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                Created by @{pool.creator}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" onClick={() => setShowSwap(true)}>
                            ⇄ Swap
                        </button>
                        <button className="btn btn-secondary" onClick={() => setShowLiquidity(true)}>
                            💧 Liquidity
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="stats-grid" style={{ marginBottom: 32 }}>
                    <div className="stat-card glass">
                        <div className="stat-label">Base Price</div>
                        <div className="stat-value">{parseFloat(pool.basePrice).toFixed(6)}</div>
                        <div className="stat-label" style={{ marginTop: 4 }}>{base} per {quote}</div>
                    </div>
                    <div className="stat-card glass">
                        <div className="stat-label">Base Reserve</div>
                        <div className="stat-value accent">{formatNumber(pool.baseQuantity)}</div>
                        <div className="stat-label" style={{ marginTop: 4 }}>{base}</div>
                    </div>
                    <div className="stat-card glass">
                        <div className="stat-label">Quote Reserve</div>
                        <div className="stat-value accent">{formatNumber(pool.quoteQuantity)}</div>
                        <div className="stat-label" style={{ marginTop: 4 }}>{quote}</div>
                    </div>
                    <div className="stat-card glass">
                        <div className="stat-label">Total Shares</div>
                        <div className="stat-value">{formatNumber(pool.totalShares)}</div>
                    </div>
                    <div className="stat-card glass">
                        <div className="stat-label">Base Volume</div>
                        <div className="stat-value">{formatNumber(pool.baseVolume)}</div>
                    </div>
                    <div className="stat-card glass">
                        <div className="stat-label">Quote Volume</div>
                        <div className="stat-value">{formatNumber(pool.quoteVolume)}</div>
                    </div>
                </div>

                {/* User position */}
                {userPosition && (
                    <div className="card" style={{ marginBottom: 24, borderColor: 'var(--border-accent)' }}>
                        <div className="card-header">
                            <h3 className="card-title">Your Position</h3>
                            <span className="badge badge-green">Active LP</span>
                        </div>
                        <div className="stats-grid">
                            <div>
                                <div className="stat-label">Your Shares</div>
                                <div className="stat-value">{parseFloat(userPosition.shares).toFixed(4)}</div>
                            </div>
                            <div>
                                <div className="stat-label">Pool Share</div>
                                <div className="stat-value accent">
                                    {((parseFloat(userPosition.shares) / parseFloat(pool.totalShares)) * 100).toFixed(4)}%
                                </div>
                            </div>
                            <div>
                                <div className="stat-label">Est. {base}</div>
                                <div className="stat-value">
                                    {formatNumber(
                                        (parseFloat(userPosition.shares) / parseFloat(pool.totalShares)) * parseFloat(pool.baseQuantity)
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="stat-label">Est. {quote}</div>
                                <div className="stat-value">
                                    {formatNumber(
                                        (parseFloat(userPosition.shares) / parseFloat(pool.totalShares)) * parseFloat(pool.quoteQuantity)
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* LP positions */}
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 16 }}>
                        Liquidity Providers ({positions.length})
                    </h2>
                    <PositionsList positions={positions} pool={pool} />
                </div>

                {/* Swap Modal */}
                <Modal isOpen={showSwap} onClose={() => setShowSwap(false)} title="Swap Tokens">
                    <SwapForm
                        pool={pool}
                        onSuccess={() => {
                            setShowSwap(false);
                            refetch();
                        }}
                    />
                </Modal>

                {/* Liquidity Modal */}
                <Modal isOpen={showLiquidity} onClose={() => setShowLiquidity(false)} title="Manage Liquidity">
                    <LiquidityForm
                        pool={pool}
                        userPosition={userPosition}
                        onSuccess={() => {
                            setShowLiquidity(false);
                            refetch();
                        }}
                    />
                </Modal>
            </div>
        </div>
    );
}
