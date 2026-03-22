import React from 'react';
import { usePools } from '../hooks/usePools.js';
import PoolTable from '../components/PoolTable.jsx';
import './Pools.css';

export default function Pools() {
    const {
        pools,
        tokenMap,
        volumeMap,
        volumeDays,
        setVolumeDays,
        volumeSource,
        loading,
        error,
        refetch,
    } = usePools();

    return (
        <div className="page">
            <div className="container">
                {/* Hero section */}
                <div className="hero-section">
                    <div className="hero-content">
                        <h1 className="hero-title">
                            <span className="hero-icon">🐝</span>
                            Hive-Engine Liquidity Pools
                        </h1>
                        <p className="hero-subtitle">
                            Explore all liquidity pools, swap tokens, and provide liquidity on the Hive-Engine DEX.
                        </p>
                    </div>

                    {/* Stats overview */}
                    {!loading && pools.length > 0 && (
                        <div className="stats-grid hero-stats">
                            <div className="stat-card glass">
                                <div className="stat-label">Total Pools</div>
                                <div className="stat-value accent">{pools.length}</div>
                            </div>
                            <div className="stat-card glass">
                                <div className="stat-label">Unique Tokens</div>
                                <div className="stat-value accent">{Object.keys(tokenMap).length}</div>
                            </div>
                            <div className="stat-card glass">
                                <div className="stat-label">Top Pool</div>
                                <div className="stat-value" style={{ fontSize: '0.9rem' }}>
                                    {pools.length > 0
                                        ? pools.reduce((top, p) =>
                                            parseFloat(p.baseVolume) > parseFloat(top.baseVolume) ? p : top
                                        ).tokenPair.replace(':', ' / ')
                                        : '-'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(255,107,107,0.3)' }}>
                        <p style={{ color: 'var(--red)' }}>⚠ Failed to load pools: {error}</p>
                        <button className="btn btn-secondary btn-sm" onClick={refetch} style={{ marginTop: 10 }}>
                            Retry
                        </button>
                    </div>
                )}

                {/* Loading */}
                {loading ? (
                    <div>
                        <div className="skeleton" style={{ height: 60, marginBottom: 16 }} />
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 52, marginBottom: 4 }} />
                        ))}
                    </div>
                ) : (
                    <PoolTable
                        pools={pools}
                        tokenMap={tokenMap}
                        volumeMap={volumeMap}
                        volumeDays={volumeDays}
                        setVolumeDays={setVolumeDays}
                        volumeSource={volumeSource}
                    />
                )}
            </div>
        </div>
    );
}