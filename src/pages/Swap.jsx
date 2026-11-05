import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePools } from '../hooks/usePools.js';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { getAccountBalances, getMarketPoolsParams } from '../api/hiveEngine.js';
import SwapForm from '../components/SwapForm.jsx';
import PairBrowser from '../components/PairBrowser.jsx';

export default function Swap() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { pools, tokenMap, loading, error, refetch } = usePools();
    const { user } = useKeychainContext();
    const [feeMul, setFeeMul] = useState('0.9975');
    const [balances, setBalances] = useState({});

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

    useEffect(() => {
        if (!user) {
            setBalances({});
            return undefined;
        }
        let cancelled = false;
        const load = () => {
            getAccountBalances(user).then((rows) => {
                if (cancelled) return;
                const map = {};
                for (const row of rows || []) map[row.symbol] = row.balance;
                setBalances(map);
            }).catch(() => {});
        };
        load();
        window.addEventListener('hiveswapbee:refresh', load);
        return () => {
            cancelled = true;
            window.removeEventListener('hiveswapbee:refresh', load);
        };
    }, [user]);

    return (
        <div className="page">
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <h1 className="page-title">Swap Tokens</h1>
                    <p className="page-subtitle">
                        Search a pool, then trade. Pairs you already hold are listed first.
                    </p>
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
                            balances={balances}
                            fromToken={fromToken}
                            toToken={toToken}
                            onTokensChange={(from, to) => { setFromToken(from); setToToken(to); }}
                        />
                    )}
                    {loading && pools.length === 0 ? (
                        <div className="card pair-browser" style={{ textAlign: 'center', padding: 40 }}>
                            <p style={{ color: 'var(--text-secondary)' }}>Loading pools...</p>
                        </div>
                    ) : (
                        <PairBrowser
                            pools={pools}
                            balances={balances}
                            fromToken={fromToken}
                            toToken={toToken}
                            onPick={(from, to) => { setFromToken(from); setToToken(to); }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
