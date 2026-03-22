import React, { useState, useMemo } from 'react';
import { usePoolDetail } from '../hooks/usePools.js';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { findUserPositions } from '../api/hiveEngine.js';
import TokenIcon from './TokenIcon.jsx';
import PositionsList from './PositionsList.jsx';
import LiquidityForm from './LiquidityForm.jsx';
import SwapForm from './SwapForm.jsx';
import Modal from './Modal.jsx';

function fmt(num, dec = 4) {
    const n = parseFloat(num);
    if (isNaN(n)) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    return n.toFixed(dec);
}
function fmtUsd(num) {
    const n = parseFloat(num);
    if (!n || isNaN(n)) return '—';
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
    return '$' + n.toFixed(2);
}
function fmtApr(apr) {
    if (!apr || apr <= 0) return '—';
    if (apr > 9999) return '>9999%';
    return apr.toFixed(2) + '%';
}
function aprStyle(apr) {
    if (!apr || apr <= 0 || apr > 9999) return { color: 'var(--text-muted)' };
    if (apr >= 100) return { color: '#22c55e', fontWeight: 700 };
    if (apr >= 30) return { color: '#84cc16', fontWeight: 700 };
    if (apr >= 10) return { color: '#eab308', fontWeight: 600 };
    return {};
}

export default function PoolDetailModal({ tokenPair, onClose, stats, volumeDays }) {
    const { user } = useKeychainContext();
    const { pool, positions, loading, error, refetch } = usePoolDetail(tokenPair);
    const [showLiquidity, setShowLiquidity] = useState(false);
    const [showSwap, setShowSwap] = useState(false);
    const [userPosition, setUserPosition] = useState(null);

    const [base, quote] = useMemo(() => (tokenPair || ':').split(':'), [tokenPair]);

    React.useEffect(() => {
        if (user && tokenPair) {
            findUserPositions(user).then((pos) => {
                setUserPosition(pos?.find((p) => p.tokenPair === tokenPair) || null);
            });
        } else {
            setUserPosition(null);
        }
    }, [user, tokenPair, showLiquidity]);

    const pl = volumeDays
        ? ({ 1: '1D', 3: '3D', 7: '7D', 30: '30D' }[volumeDays] ?? `${volumeDays}D`)
        : '';

    if (loading) return (
        <div style={{ padding: '32px 0' }}>
            {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 14, marginBottom: 10, borderRadius: 6, width: `${70 + i * 6}%` }} />
            ))}
        </div>
    );

    if (error || !pool) return (
        <div style={{ color: 'var(--red)', padding: 32, textAlign: 'center' }}>{error || 'Pool not found'}</div>
    );

    const userSharePct = userPosition
        ? (parseFloat(userPosition.shares) / parseFloat(pool.totalShares)) * 100
        : 0;

    return (
        <div className="pdm">

            {/* ── Header: identity + action buttons ─────────────────────── */}
            <div className="pdm-header">
                <div className="pdm-identity">
                    <div className="token-icon-stack">
                        <TokenIcon symbol={base} size={30} />
                        <TokenIcon symbol={quote} size={30} />
                    </div>
                    <span className="pdm-pair">{base} / {quote}</span>
                    <span className="pdm-creator">by @{pool.creator}</span>
                </div>
                <div className="pdm-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => setShowSwap(true)}>⇄ Swap</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowLiquidity(true)}>💧 Liquidity</button>
                </div>
            </div>

            {/* ── Stat pills: one compact row ───────────────────────────── */}
            <div className="pdm-pills">
                <div className="pdm-pill">
                    <span className="pdm-pill-label">Price</span>
                    <span className="pdm-pill-value">{parseFloat(pool.basePrice).toFixed(6)} {quote}</span>
                </div>
                <div className="pdm-pill">
                    <span className="pdm-pill-label">{base} Reserve</span>
                    <span className="pdm-pill-value">{fmt(pool.baseQuantity)}</span>
                </div>
                <div className="pdm-pill">
                    <span className="pdm-pill-label">{quote} Reserve</span>
                    <span className="pdm-pill-value">{fmt(pool.quoteQuantity)}</span>
                </div>
                <div className="pdm-pill">
                    <span className="pdm-pill-label">Shares</span>
                    <span className="pdm-pill-value">{fmt(pool.totalShares)}</span>
                </div>
                {stats && <>
                    <div className="pdm-pill">
                        <span className="pdm-pill-label">Liquidity</span>
                        <span className="pdm-pill-value">{fmtUsd(stats.liquidityUSD)}</span>
                    </div>
                    <div className="pdm-pill">
                        <span className="pdm-pill-label">Vol {pl}</span>
                        <span className="pdm-pill-value">{fmtUsd(stats.volumeUSD)}</span>
                    </div>
                    <div className="pdm-pill">
                        <span className="pdm-pill-label">Fees {pl}</span>
                        <span className="pdm-pill-value">{fmtUsd(stats.feeUSD)}</span>
                    </div>
                    <div className="pdm-pill">
                        <span className="pdm-pill-label">APR est.</span>
                        <span className="pdm-pill-value" style={aprStyle(stats.apr)}>{fmtApr(stats.apr)}</span>
                    </div>
                </>}
                {userPosition && <>
                    <div className="pdm-pill pdm-pill--accent">
                        <span className="pdm-pill-label">Your shares</span>
                        <span className="pdm-pill-value">{fmt(userPosition.shares, 6)}</span>
                    </div>
                    <div className="pdm-pill pdm-pill--accent">
                        <span className="pdm-pill-label">Your %</span>
                        <span className="pdm-pill-value" style={{ color: 'var(--accent)' }}>{userSharePct.toFixed(4)}%</span>
                    </div>
                </>}
            </div>

            {/* ── LP Providers — takes all remaining space ──────────────── */}
            <div className="pdm-lp-section">
                <div className="pdm-lp-title">
                    Liquidity Providers
                    <span className="pdm-lp-count">{positions.length}</span>
                </div>
                <div className="pdm-lp-body">
                    <PositionsList positions={positions} pool={pool} />
                </div>
            </div>

            {/* Nested modals */}
            <Modal isOpen={showSwap} onClose={() => setShowSwap(false)} title="Swap Tokens" size="md">
                <SwapForm pool={pool} onSuccess={() => { setShowSwap(false); refetch(); }} />
            </Modal>
            <Modal isOpen={showLiquidity} onClose={() => setShowLiquidity(false)} title="Manage Liquidity" size="md">
                <LiquidityForm pool={pool} userPosition={userPosition}
                    onSuccess={() => { setShowLiquidity(false); refetch(); }} />
            </Modal>
        </div>
    );
}