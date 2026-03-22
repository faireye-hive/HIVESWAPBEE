import React, { useState, useMemo } from 'react';
import { usePoolDetail } from '../hooks/usePools.js';
import { calcDistroStats } from '../hooks/usePools.js';
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
function fmtUsd(num, forceSign = false) {
    const n = parseFloat(num);
    if (!n || isNaN(n) || n === 0) return '—';
    const prefix = forceSign && n > 0 ? '+' : '';
    if (n >= 1_000_000) return prefix + '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return prefix + '$' + (n / 1_000).toFixed(1) + 'K';
    if (n >= 0.01) return prefix + '$' + n.toFixed(2);
    return prefix + '$' + n.toFixed(6);
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

export default function PoolDetailModal({ tokenPair, onClose, stats, volumeDays, distroMap, tokenPriceMap }) {
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

    const pl = volumeDays ? ({ 1: '1D', 3: '3D', 7: '7D', 30: '30D' }[volumeDays] ?? `${volumeDays}D`) : '';

    // Distribution data for this pool
    const batches = distroMap?.[tokenPair];
    const hasDistro = batches && batches.length > 0;
    const distro = hasDistro
        ? calcDistroStats(batches, tokenPriceMap, stats?.liquidityUSD)
        : null;

    const feeApr = stats?.apr || 0;
    const distApr = distro?.apr || 0;
    const totalApr = feeApr + distApr;

    const userSharePct = userPosition && pool
        ? (parseFloat(userPosition.shares) / parseFloat(pool.totalShares)) * 100
        : 0;

    // Per-user daily earnings from distributions
    const userDailyDistroUsd = userPosition && distro
        ? (userSharePct / 100) * distro.dailyUSD
        : 0;

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

    return (
        <div className="pdm">
            {/* ── Header ── */}
            <div className="pdm-header">
                <div className="pdm-identity">
                    <div className="token-icon-stack">
                        <TokenIcon symbol={base} size={30} />
                        <TokenIcon symbol={quote} size={30} />
                    </div>
                    <span className="pdm-pair">{base} / {quote}</span>
                    <span className="pdm-creator">by @{pool.creator}</span>
                    {hasDistro && <span className="distro-badge distro-badge--lg">🎁 Active Incentives</span>}
                </div>
                <div className="pdm-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => setShowSwap(true)}>⇄ Swap</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowLiquidity(true)}>💧 Liquidity</button>
                </div>
            </div>

            {/* ── Stat pills ── */}
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
                        <span className="pdm-pill-label">Fees APR</span>
                        <span className="pdm-pill-value" style={aprStyle(feeApr)}>{fmtApr(feeApr)}</span>
                    </div>
                </>}
                {distro && distApr > 0 && (
                    <div className="pdm-pill pdm-pill--distro">
                        <span className="pdm-pill-label">Dist. APR 🎁</span>
                        <span className="pdm-pill-value" style={{ color: '#22c55e' }}>{fmtApr(distApr)}</span>
                    </div>
                )}
                {totalApr > 0 && (
                    <div className="pdm-pill pdm-pill--accent">
                        <span className="pdm-pill-label">Total APR est.</span>
                        <span className="pdm-pill-value" style={aprStyle(totalApr)}>{fmtApr(totalApr)}</span>
                    </div>
                )}
                {userPosition && <>
                    <div className="pdm-pill pdm-pill--user">
                        <span className="pdm-pill-label">Your shares</span>
                        <span className="pdm-pill-value">{fmt(userPosition.shares, 6)}</span>
                    </div>
                    <div className="pdm-pill pdm-pill--user">
                        <span className="pdm-pill-label">Your %</span>
                        <span className="pdm-pill-value" style={{ color: 'var(--accent)' }}>{userSharePct.toFixed(4)}%</span>
                    </div>
                    {userDailyDistroUsd > 0 && (
                        <div className="pdm-pill pdm-pill--user">
                            <span className="pdm-pill-label">Your daily 🎁</span>
                            <span className="pdm-pill-value" style={{ color: '#22c55e' }}>~{fmtUsd(userDailyDistroUsd)}</span>
                        </div>
                    )}
                </>}
            </div>

            {/* ── Distribution detail section ── */}
            {hasDistro && (
                <div className="pdm-distro-section">
                    <div className="pdm-lp-title">
                        Active Incentives
                        <span className="pdm-lp-count">{batches.length} batch{batches.length > 1 ? 'es' : ''}</span>
                        {distro?.dailyUSD > 0 && (
                            <span className="pdm-distro-daily">~{fmtUsd(distro.dailyUSD)}/day total</span>
                        )}
                    </div>
                    <div className="pdm-distro-grid">
                        {batches.map((batch) => {
                            const batchDistro = calcDistroStats([batch], tokenPriceMap, stats?.liquidityUSD);
                            return (
                                <div key={batch._id} className="pdm-distro-card">
                                    <div className="pdm-distro-card-header">
                                        <span className="pdm-distro-creator">@{batch.creator}</span>
                                        <span className="pdm-distro-ticks">{parseInt(batch.numTicksLeft).toLocaleString()} ticks left</span>
                                        {batchDistro.dailyUSD > 0 && (
                                            <span className="pdm-distro-usd">~{fmtUsd(batchDistro.dailyUSD)}/day</span>
                                        )}
                                    </div>
                                    <div className="pdm-distro-tokens">
                                        {batch.tokenBalances?.map((tb) => {
                                            const price = tokenPriceMap?.[tb.symbol];
                                            const qty = parseFloat(tb.quantity) || 0;
                                            const ticksLeft = parseInt(batch.numTicksLeft) || 1;
                                            const perDay = qty / ticksLeft;
                                            return (
                                                <div key={tb.symbol} className="pdm-distro-token">
                                                    <span className="pdm-distro-symbol">{tb.symbol}</span>
                                                    <span className="pdm-distro-qty">{fmt(perDay, 4)}/day</span>
                                                    {price && price > 0 && (
                                                        <span className="pdm-distro-usd-small">≈{fmtUsd(perDay * price)}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── LP Providers ── */}
            <div className="pdm-lp-section">
                <div className="pdm-lp-title">
                    Liquidity Providers
                    <span className="pdm-lp-count">{positions.length}</span>
                    {distro?.dailyUSD > 0 && (
                        <span className="pdm-distro-daily">💡 daily 🎁 column = est. per-user earnings</span>
                    )}
                </div>
                <div className="pdm-lp-body">
                    <PositionsList
                        positions={positions}
                        pool={pool}
                        distroDaily={distro?.dailyUSD || 0}
                        tokenPriceMap={tokenPriceMap}
                    />
                </div>
            </div>

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