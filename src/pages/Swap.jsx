import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePools } from '../hooks/usePools.js';
import SwapForm from '../components/SwapForm.jsx';

export default function Swap() {
    const [searchParams] = useSearchParams();
    const initialPair = searchParams.get('pair') || '';
    const { pools, loading } = usePools();
    const [selectedPair, setSelectedPair] = useState(initialPair);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (initialPair) setSelectedPair(initialPair);
    }, [initialPair]);

    // Auto-select first pool if nothing selected
    useEffect(() => {
        if (!selectedPair && pools.length > 0) {
            setSelectedPair(pools[0].tokenPair);
        }
    }, [pools, selectedPair]);

    const selectedPool = useMemo(
        () => pools.find((p) => p.tokenPair === selectedPair) || null,
        [pools, selectedPair]
    );

    const filteredPools = useMemo(() => {
        if (!search.trim()) return pools;
        return pools.filter((p) => p.tokenPair.toLowerCase().includes(search.toLowerCase()));
    }, [pools, search]);

    return (
        <div className="page">
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <h1 className="page-title">Swap Tokens</h1>
                    <p className="page-subtitle">
                        Instantly swap Hive-Engine tokens using liquidity pools
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {/* Pool selector */}
                    <div className="card" style={{ width: 280, flexShrink: 0, alignSelf: 'flex-start' }}>
                        <h3 className="card-title" style={{ marginBottom: 12, fontSize: '0.9rem' }}>
                            Select Pool
                        </h3>
                        <input
                            type="text"
                            className="input"
                            placeholder="Search pools..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: '100%', marginBottom: 12, fontSize: '0.85rem' }}
                        />
                        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                            {loading ? (
                                <>
                                    {[...Array(6)].map((_, i) => (
                                        <div key={i} className="skeleton" style={{ height: 36, marginBottom: 4 }} />
                                    ))}
                                </>
                            ) : (
                                filteredPools.map((p) => (
                                    <button
                                        key={p.tokenPair}
                                        className={`pool-selector-item ${selectedPair === p.tokenPair ? 'selected' : ''}`}
                                        onClick={() => setSelectedPair(p.tokenPair)}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            padding: '10px 12px',
                                            background: selectedPair === p.tokenPair ? 'rgba(245,166,35,0.1)' : 'transparent',
                                            border: selectedPair === p.tokenPair ? '1px solid var(--border-accent)' : '1px solid transparent',
                                            borderRadius: 'var(--radius-sm)',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            color: selectedPair === p.tokenPair ? 'var(--accent)' : 'var(--text-primary)',
                                            fontWeight: selectedPair === p.tokenPair ? 600 : 400,
                                            fontSize: '0.85rem',
                                            fontFamily: 'inherit',
                                            transition: 'all var(--transition)',
                                            marginBottom: 2,
                                        }}
                                    >
                                        {p.tokenPair.replace(':', ' / ')}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Swap form */}
                    <div style={{ flex: 1, maxWidth: 480 }}>
                        {selectedPool ? (
                            <SwapForm pool={selectedPool} />
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                <p style={{ color: 'var(--text-secondary)' }}>
                                    {loading ? 'Loading pools...' : 'Select a pool to start swapping'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
