import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Big from 'big.js';
import { usePools } from '../hooks/usePools.js';
import { useBalances, notifyWalletRefresh } from '../hooks/useBalances.js';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getMarketPoolsParams } from '../api/hiveEngine.js';
import { floorToPrecision } from '../lib/swapQuote.js';
import SwapForm from '../components/SwapForm.jsx';

const POPULAR = [
    ['SWAP.HIVE', 'BEE'],
    ['SWAP.HIVE', 'LEO'],
    ['SWAP.HIVE', 'DEC'],
    ['SWAP.HIVE', 'SPS'],
];

function pegFee(amount) {
    try {
        const n = new Big(amount);
        let fee = n.times('0.01');
        if (fee.lt('0.001')) fee = new Big('0.001');
        const out = n.minus(fee);
        if (!out.gt(0)) return null;
        return { fee: fee.toFixed(3), out: out.toFixed(3) };
    } catch {
        return null;
    }
}

function ConvertCard() {
    const { user, depositHive, withdrawHive } = useKeychainContext();
    const { hiveBalance, swapHiveBalance } = useBalances(user);
    const toast = useToast();
    const [mode, setMode] = useState('deposit');
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState(false);

    const hiveLiquid = (hiveBalance || '0').split(' ')[0];
    const sized = floorToPrecision(amount, 3);
    const preview = sized ? pegFee(sized) : null;
    const balance = mode === 'deposit' ? hiveLiquid : swapHiveBalance;
    const tooSmall = amount && !sized;
    const insufficient = sized && balance && new Big(sized).gt(balance);

    const submit = async () => {
        if (!user) {
            toast.error('Connect your wallet first');
            return;
        }
        if (!sized) {
            toast.error('Enter at least 0.001');
            return;
        }
        if (new Big(sized).lt('0.002') && mode === 'withdraw') {
            toast.error('Minimum withdrawal is 0.002 SWAP.HIVE');
            return;
        }
        if (insufficient) {
            toast.error('Amount is above your balance');
            return;
        }
        setBusy(true);
        try {
            if (mode === 'deposit') await depositHive(sized);
            else await withdrawHive(sized);
            toast.success(mode === 'deposit'
                ? 'Deposit sent. SWAP.HIVE arrives in the next blocks.'
                : 'Withdrawal sent. HIVE arrives in the next blocks.');
            setAmount('');
            notifyWalletRefresh();
            setTimeout(notifyWalletRefresh, 8000);
        } catch (err) {
            toast.error(err.message || 'Convert failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="card convert-card">
            <div className="card-header">
                <h2 className="card-title">HIVE ↔ SWAP.HIVE</h2>
            </div>
            <div className="tabs">
                <button type="button" className={`tab ${mode === 'deposit' ? 'active' : ''}`} onClick={() => { setMode('deposit'); setAmount(''); }}>
                    Deposit
                </button>
                <button type="button" className={`tab ${mode === 'withdraw' ? 'active' : ''}`} onClick={() => { setMode('withdraw'); setAmount(''); }}>
                    Withdraw
                </button>
            </div>
            <p className="swap-note">
                {mode === 'deposit'
                    ? 'Sends HIVE to @honey-swap and credits SWAP.HIVE.'
                    : 'Burns SWAP.HIVE and sends HIVE back to your account.'}
                {' '}The peg fee is 1%, with a minimum of 0.001 HIVE.
            </p>
            <div className="swap-input-box">
                <div className="swap-input-header">
                    <span className="swap-input-label">{mode === 'deposit' ? 'HIVE' : 'SWAP.HIVE'}</span>
                    <span className="swap-balance">
                        Balance:{' '}
                        <span onClick={() => balance && setAmount(mode === 'deposit' ? hiveLiquid : floorToPrecision(swapHiveBalance, 3) || '')}>
                            {mode === 'deposit' ? hiveLiquid : Number(swapHiveBalance || 0).toFixed(3)}
                        </span>
                    </span>
                </div>
                <input
                    className="swap-amount-input"
                    inputMode="decimal"
                    placeholder="0.000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                />
            </div>
            {preview && (
                <div className="swap-details">
                    <div className="swap-detail-row">
                        <span className="label">Fee</span>
                        <span className="value">{preview.fee} HIVE</span>
                    </div>
                    <div className="swap-detail-row">
                        <span className="label">You receive</span>
                        <span className="value">{preview.out} {mode === 'deposit' ? 'SWAP.HIVE' : 'HIVE'}</span>
                    </div>
                </div>
            )}
            <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: 14 }}
                disabled={busy || !preview || insufficient || tooSmall}
                onClick={submit}
            >
                {busy ? 'Confirm in Keychain...' : mode === 'deposit' ? 'Deposit HIVE' : 'Withdraw to HIVE'}
            </button>
        </div>
    );
}

export default function Swap() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { pools, tokenMap, loading, error, refetch } = usePools();
    const [feeMul, setFeeMul] = useState('0.9975');

    const initial = useMemo(() => {
        const pair = searchParams.get('pair');
        if (pair && pair.includes(':')) {
            const [a, b] = decodeURIComponent(pair).split(':');
            if (a && b) return { from: a, to: b };
        }
        return {
            from: searchParams.get('from') || 'SWAP.HIVE',
            to: searchParams.get('to') || 'BEE',
        };
        // Read the URL once. Later edits go through setSearchParams.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [fromToken, setFromToken] = useState(initial.from);
    const [toToken, setToToken] = useState(initial.to);

    useEffect(() => {
        const next = new URLSearchParams();
        next.set('from', fromToken);
        next.set('to', toToken);
        setSearchParams(next, { replace: true });
    }, [fromToken, toToken, setSearchParams]);

    useEffect(() => {
        getMarketPoolsParams()
            .then((params) => {
                if (params?.tradeFeeMul) setFeeMul(String(params.tradeFeeMul));
            })
            .catch(() => {});
    }, []);

    return (
        <div className="page">
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <h1 className="page-title">Swap Tokens</h1>
                    <p className="page-subtitle">
                        Trade Hive-Engine tokens through liquidity pools. Quotes include the pool fee and each token's precision.
                    </p>
                </div>

                <div className="popular-pairs">
                    {POPULAR.map(([a, b]) => (
                        <button
                            key={`${a}:${b}`}
                            type="button"
                            className={`popular-pair ${fromToken === a && toToken === b ? 'active' : ''}`}
                            onClick={() => { setFromToken(a); setToToken(b); }}
                        >
                            {a} / {b}
                        </button>
                    ))}
                </div>

                {error && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <p style={{ color: 'var(--red)' }}>Could not load pools: {error}</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={refetch}>Retry</button>
                    </div>
                )}

                <div className="swap-layout">
                    {loading && pools.length === 0 ? (
                        <div className="card swap-card" style={{ textAlign: 'center', padding: 60 }}>
                            <p style={{ color: 'var(--text-secondary)' }}>Loading pools...</p>
                        </div>
                    ) : (
                        <SwapForm
                            pools={pools}
                            tokenMap={tokenMap}
                            feeMul={feeMul}
                            fromToken={fromToken}
                            toToken={toToken}
                            onTokensChange={(from, to) => { setFromToken(from); setToToken(to); }}
                        />
                    )}
                    <ConvertCard />
                </div>
            </div>
        </div>
    );
}
