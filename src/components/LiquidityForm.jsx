import React, { useState, useEffect, useMemo } from 'react';
import Big from 'big.js';
import TokenIcon from './TokenIcon.jsx';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getTokenBalance } from '../api/hiveEngine.js';

export default function LiquidityForm({ pool, userPosition, onSuccess }) {
    const { user, addLiquidity, removeLiquidity } = useKeychainContext();
    const toast = useToast();

    const [tab, setTab] = useState('add');
    const [baseAmount, setBaseAmount] = useState('');
    const [quoteAmount, setQuoteAmount] = useState('');
    const [removePercent, setRemovePercent] = useState(50);
    const [submitting, setSubmitting] = useState(false);
    const [balances, setBalances] = useState({ base: null, quote: null });

    const [base, quote] = useMemo(() => (pool?.tokenPair || ':').split(':'), [pool]);

    // Price from pool
    const price = useMemo(() => {
        if (!pool) return null;
        try {
            return new Big(pool.quoteQuantity).div(pool.baseQuantity);
        } catch {
            return null;
        }
    }, [pool]);

    // Fetch balances
    useEffect(() => {
        if (!user || !base || !quote) return;
        Promise.all([
            getTokenBalance(user, base),
            getTokenBalance(user, quote),
        ]).then(([bBase, bQuote]) => {
            setBalances({
                base: bBase ? bBase.balance : '0',
                quote: bQuote ? bQuote.balance : '0',
            });
        });
    }, [user, base, quote]);

    // Auto-calculate quote when base changes
    const handleBaseChange = (val) => {
        setBaseAmount(val);
        if (price && val && !isNaN(parseFloat(val))) {
            try {
                const q = new Big(val).times(price).toFixed(pool.precision || 8);
                setQuoteAmount(q);
            } catch {
                setQuoteAmount('');
            }
        } else {
            setQuoteAmount('');
        }
    };

    // Auto-calculate base when quote changes
    const handleQuoteChange = (val) => {
        setQuoteAmount(val);
        if (price && val && !isNaN(parseFloat(val))) {
            try {
                const b = new Big(val).div(price).toFixed(pool.precision || 8);
                setBaseAmount(b);
            } catch {
                setBaseAmount('');
            }
        } else {
            setBaseAmount('');
        }
    };

    // Estimated returns on removal
    const removeEstimate = useMemo(() => {
        if (!pool || !userPosition || !removePercent) return null;
        try {
            const sharesDelta = new Big(userPosition.shares).times(removePercent).div(100);
            const baseOut = sharesDelta.times(pool.baseQuantity).div(pool.totalShares);
            const quoteOut = sharesDelta.times(pool.quoteQuantity).div(pool.totalShares);
            return {
                base: baseOut.toFixed(pool.precision || 4),
                quote: quoteOut.toFixed(pool.precision || 4),
                shares: sharesDelta.toFixed(pool.precision || 4),
            };
        } catch {
            return null;
        }
    }, [pool, userPosition, removePercent]);

    const handleAddLiquidity = async () => {
        if (!user) {
            toast.error('Please connect your wallet first');
            return;
        }
        if (!baseAmount || !quoteAmount || parseFloat(baseAmount) <= 0) {
            toast.error('Enter both token amounts');
            return;
        }

        setSubmitting(true);
        try {
            await addLiquidity({
                tokenPair: pool.tokenPair,
                baseQuantity: baseAmount,
                quoteQuantity: quoteAmount,
            });
            toast.success('Liquidity added successfully!');
            setBaseAmount('');
            setQuoteAmount('');
            onSuccess?.();
        } catch (err) {
            toast.error(err.message || 'Add liquidity failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveLiquidity = async () => {
        if (!user) {
            toast.error('Please connect your wallet first');
            return;
        }
        if (!removePercent || removePercent <= 0) {
            toast.error('Select amount to remove');
            return;
        }

        setSubmitting(true);
        try {
            await removeLiquidity({
                tokenPair: pool.tokenPair,
                sharesOut: String(removePercent),
            });
            toast.success(`Removed ${removePercent}% liquidity successfully!`);
            setRemovePercent(50);
            onSuccess?.();
        } catch (err) {
            toast.error(err.message || 'Remove liquidity failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (!pool) return null;

    return (
        <div>
            {/* Tabs */}
            <div className="tabs">
                <button className={`tab ${tab === 'add' ? 'active' : ''}`} onClick={() => setTab('add')}>
                    Add Liquidity
                </button>
                <button className={`tab ${tab === 'remove' ? 'active' : ''}`} onClick={() => setTab('remove')}>
                    Remove Liquidity
                </button>
            </div>

            {tab === 'add' ? (
                <div>
                    {/* Base token input */}
                    <div className="swap-input-box" style={{ marginBottom: 12 }}>
                        <div className="swap-input-header">
                            <span className="swap-input-label">{base}</span>
                            {balances.base !== null && (
                                <span className="swap-balance">
                                    Balance: <span onClick={() => handleBaseChange(balances.base)}>
                                        {parseFloat(balances.base).toFixed(4)}
                                    </span>
                                </span>
                            )}
                        </div>
                        <div className="swap-input-row">
                            <input
                                type="number"
                                className="swap-amount-input"
                                placeholder="0.0"
                                value={baseAmount}
                                onChange={(e) => handleBaseChange(e.target.value)}
                                min="0"
                                step="any"
                            />
                            <div className="swap-token-select">
                                <TokenIcon symbol={base} size={22} />
                                {base}
                            </div>
                        </div>
                    </div>

                    {/* Plus sign */}
                    <div style={{ textAlign: 'center', padding: '4px 0', color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                        +
                    </div>

                    {/* Quote token input */}
                    <div className="swap-input-box">
                        <div className="swap-input-header">
                            <span className="swap-input-label">{quote}</span>
                            {balances.quote !== null && (
                                <span className="swap-balance">
                                    Balance: <span onClick={() => handleQuoteChange(balances.quote)}>
                                        {parseFloat(balances.quote).toFixed(4)}
                                    </span>
                                </span>
                            )}
                        </div>
                        <div className="swap-input-row">
                            <input
                                type="number"
                                className="swap-amount-input"
                                placeholder="0.0"
                                value={quoteAmount}
                                onChange={(e) => handleQuoteChange(e.target.value)}
                                min="0"
                                step="any"
                            />
                            <div className="swap-token-select">
                                <TokenIcon symbol={quote} size={22} />
                                {quote}
                            </div>
                        </div>
                    </div>

                    {/* Pool rate info */}
                    {price && (
                        <div className="swap-details" style={{ marginTop: 16 }}>
                            <div className="swap-detail-row">
                                <span className="label">Pool Rate</span>
                                <span className="value">
                                    1 {base} = {price.toFixed(6)} {quote}
                                </span>
                            </div>
                            <div className="swap-detail-row">
                                <span className="label">Your share</span>
                                <span className="value">
                                    {userPosition
                                        ? new Big(userPosition.shares).div(pool.totalShares).times(100).toFixed(4) + '%'
                                        : '0%'}
                                </span>
                            </div>
                        </div>
                    )}

                    <button
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%', marginTop: 20 }}
                        onClick={handleAddLiquidity}
                        disabled={submitting || !baseAmount || parseFloat(baseAmount) <= 0}
                    >
                        {submitting ? 'Confirming...' : !user ? 'Connect Wallet' : 'Add Liquidity'}
                    </button>
                </div>
            ) : (
                <div>
                    {!userPosition ? (
                        <div className="empty-state">
                            <span className="icon">💧</span>
                            <p>You don't have any liquidity in this pool.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                <div className="stat-label">Your Shares</div>
                                <div className="stat-value">
                                    {parseFloat(userPosition.shares).toFixed(4)}
                                </div>
                                <div className="stat-label" style={{ marginTop: 4 }}>
                                    ({new Big(userPosition.shares).div(pool.totalShares).times(100).toFixed(4)}% of pool)
                                </div>
                            </div>

                            {/* Slider */}
                            <div className="slider-container">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span className="swap-input-label">Amount to remove</span>
                                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1.1rem' }}>
                                        {removePercent}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="100"
                                    value={removePercent}
                                    onChange={(e) => setRemovePercent(Number(e.target.value))}
                                />
                                <div className="slider-labels">
                                    {[25, 50, 75, 100].map((v) => (
                                        <button
                                            key={v}
                                            className={removePercent === v ? 'active' : ''}
                                            onClick={() => setRemovePercent(v)}
                                        >
                                            {v}%
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Estimated return */}
                            {removeEstimate && (
                                <div className="swap-details" style={{ marginTop: 16 }}>
                                    <div className="swap-detail-row">
                                        <span className="label">{base} received</span>
                                        <span className="value">≈ {removeEstimate.base}</span>
                                    </div>
                                    <div className="swap-detail-row">
                                        <span className="label">{quote} received</span>
                                        <span className="value">≈ {removeEstimate.quote}</span>
                                    </div>
                                </div>
                            )}

                            <button
                                className="btn btn-danger btn-lg"
                                style={{ width: '100%', marginTop: 20 }}
                                onClick={handleRemoveLiquidity}
                                disabled={submitting}
                            >
                                {submitting ? 'Confirming...' : `Remove ${removePercent}% Liquidity`}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
