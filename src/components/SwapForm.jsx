import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Big from 'big.js';
import TokenIcon from './TokenIcon.jsx';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getTokenBalance } from '../api/hiveEngine.js';

export default function SwapForm({ pool, onSuccess }) {
    const { user, swapTokens } = useKeychainContext();
    const toast = useToast();

    const [base, quote] = useMemo(() => (pool?.tokenPair || ':').split(':'), [pool]);

    const [fromToken, setFromToken] = useState(base);
    const [toToken, setToToken] = useState(quote);
    const [amount, setAmount] = useState('');
    const [estimatedOut, setEstimatedOut] = useState('');
    const [slippage, setSlippage] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [fromBalance, setFromBalance] = useState(null);

    // Update tokens when pool changes
    useEffect(() => {
        if (base && quote) {
            setFromToken(base);
            setToToken(quote);
        }
    }, [base, quote]);

    // Fetch balance
    useEffect(() => {
        if (!user || !fromToken) {
            setFromBalance(null);
            return;
        }
        getTokenBalance(user, fromToken).then((b) => {
            setFromBalance(b ? b.balance : '0');
        });
    }, [user, fromToken]);

    // Calculate estimated output (constant product: x * y = k)
    useEffect(() => {
        if (!pool || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            setEstimatedOut('');
            return;
        }
        try {
            const isFromBase = fromToken === base;
            const liquidityIn = isFromBase
                ? new Big(pool.baseQuantity)
                : new Big(pool.quoteQuantity);
            const liquidityOut = isFromBase
                ? new Big(pool.quoteQuantity)
                : new Big(pool.baseQuantity);
            const amtIn = new Big(amount);

            // exactInput formula: amountOut = (amountIn * liquidityOut) / (liquidityIn + amountIn)
            const numerator = amtIn.times(liquidityOut);
            const denominator = liquidityIn.plus(amtIn);
            const out = numerator.div(denominator);

            setEstimatedOut(out.toFixed(pool.precision || 8));
        } catch {
            setEstimatedOut('');
        }
    }, [amount, pool, fromToken, base]);

    const priceImpact = useMemo(() => {
        if (!pool || !amount || !estimatedOut || parseFloat(amount) === 0) return null;
        try {
            const isFromBase = fromToken === base;
            const spotPrice = isFromBase
                ? new Big(pool.quoteQuantity).div(pool.baseQuantity)
                : new Big(pool.baseQuantity).div(pool.quoteQuantity);
            const executionPrice = new Big(estimatedOut).div(amount);
            const impact = Big(1).minus(executionPrice.div(spotPrice)).times(100);
            return Math.abs(impact.toNumber());
        } catch {
            return null;
        }
    }, [pool, amount, estimatedOut, fromToken, base]);

    const handleFlip = useCallback(() => {
        setFromToken(toToken);
        setToToken(fromToken);
        setAmount('');
        setEstimatedOut('');
    }, [fromToken, toToken]);

    const handleSwap = async () => {
        if (!user) {
            toast.error('Please connect your wallet first');
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Enter an amount');
            return;
        }

        setSubmitting(true);
        try {
            const minOut = estimatedOut
                ? new Big(estimatedOut).times(1 - slippage / 100).toFixed(pool.precision || 8)
                : '0';

            await swapTokens({
                tokenPair: pool.tokenPair,
                tokenSymbol: fromToken,
                tokenAmount: amount,
                tradeType: 'exactInput',
                minAmountOut: minOut,
            });

            toast.success(`Swapped ${amount} ${fromToken} successfully!`);
            setAmount('');
            setEstimatedOut('');
            onSuccess?.();
        } catch (err) {
            toast.error(err.message || 'Swap failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (!pool) return null;

    return (
        <div className="swap-container">
            <div className="card swap-card">
                <div className="card-header">
                    <h2 className="card-title">Swap</h2>
                    <div className="slippage-setting">
                        <span className="swap-input-label">Slippage: </span>
                        {[0.5, 1, 2, 5].map((s) => (
                            <button
                                key={s}
                                className={`btn btn-ghost btn-sm ${slippage === s ? 'active-slippage' : ''}`}
                                onClick={() => setSlippage(s)}
                                style={slippage === s ? { color: 'var(--accent)' } : {}}
                            >
                                {s}%
                            </button>
                        ))}
                    </div>
                </div>

                {/* From */}
                <div className="swap-input-box">
                    <div className="swap-input-header">
                        <span className="swap-input-label">From</span>
                        {fromBalance !== null && (
                            <span className="swap-balance">
                                Balance: <span onClick={() => setAmount(fromBalance)}>{parseFloat(fromBalance).toFixed(4)}</span>
                            </span>
                        )}
                    </div>
                    <div className="swap-input-row">
                        <input
                            type="number"
                            className="swap-amount-input"
                            placeholder="0.0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            min="0"
                            step="any"
                        />
                        <div className="swap-token-select">
                            <TokenIcon symbol={fromToken} size={22} />
                            {fromToken}
                        </div>
                    </div>
                </div>

                {/* Arrow */}
                <div className="swap-arrow-container">
                    <button className="swap-arrow-btn" onClick={handleFlip} title="Flip tokens">
                        ↕
                    </button>
                </div>

                {/* To */}
                <div className="swap-input-box">
                    <div className="swap-input-header">
                        <span className="swap-input-label">To (estimated)</span>
                    </div>
                    <div className="swap-input-row">
                        <input
                            type="text"
                            className="swap-amount-input"
                            placeholder="0.0"
                            value={estimatedOut}
                            readOnly
                        />
                        <div className="swap-token-select">
                            <TokenIcon symbol={toToken} size={22} />
                            {toToken}
                        </div>
                    </div>
                </div>

                {/* Details */}
                {amount && estimatedOut && (
                    <div className="swap-details fade-in">
                        <div className="swap-detail-row">
                            <span className="label">Rate</span>
                            <span className="value">
                                1 {fromToken} ≈ {(parseFloat(estimatedOut) / parseFloat(amount)).toFixed(6)} {toToken}
                            </span>
                        </div>
                        <div className="swap-detail-row">
                            <span className="label">Price Impact</span>
                            <span
                                className="value"
                                style={{ color: priceImpact > 5 ? 'var(--red)' : priceImpact > 1 ? 'var(--accent)' : 'var(--green)' }}
                            >
                                {priceImpact !== null ? priceImpact.toFixed(2) + '%' : '-'}
                            </span>
                        </div>
                        <div className="swap-detail-row">
                            <span className="label">Min. Received</span>
                            <span className="value">
                                {new Big(estimatedOut).times(1 - slippage / 100).toFixed(pool.precision || 4)} {toToken}
                            </span>
                        </div>
                        <div className="swap-detail-row">
                            <span className="label">Slippage Tolerance</span>
                            <span className="value">{slippage}%</span>
                        </div>
                    </div>
                )}

                <button
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', marginTop: 20 }}
                    onClick={handleSwap}
                    disabled={submitting || !amount || parseFloat(amount) <= 0}
                >
                    {submitting ? 'Confirming...' : !user ? 'Connect Wallet' : 'Swap'}
                </button>
            </div>
        </div>
    );
}
