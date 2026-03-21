import { useState, useEffect, useCallback } from 'react';
import { getHiveBalance } from '../api/hive';
import { getTokenBalance } from '../api/hiveEngine';

export function useBalances(account) {
    const [hiveBalance, setHiveBalance] = useState('0.000 HIVE');
    const [swapHiveBalance, setSwapHiveBalance] = useState('0.00000000');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchBalances = useCallback(async () => {
        if (!account) {
            setHiveBalance('0.000 HIVE');
            setSwapHiveBalance('0.00000000');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const [hiveBase, swapHiveToken] = await Promise.all([
                getHiveBalance(account),
                getTokenBalance(account, 'SWAP.HIVE')
            ]);
            
            if (hiveBase) {
                setHiveBalance(hiveBase);
            }
            if (swapHiveToken && swapHiveToken.balance) {
                setSwapHiveBalance(swapHiveToken.balance);
            } else {
                setSwapHiveBalance('0.00000000');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [account]);

    useEffect(() => {
        fetchBalances();
    }, [fetchBalances]);

    return { hiveBalance, swapHiveBalance, loading, error, refetch: fetchBalances };
}
