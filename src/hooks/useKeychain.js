import { useState, useCallback } from 'react';

/**
 * Hook for Hive Keychain interactions.
 * Provides login, broadcast custom JSON, and state management.
 */
export function useKeychain() {
    const [user, setUser] = useState(() => {
        try {
            return localStorage.getItem('hiveswapbee_user') || null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /** Check if Hive Keychain is available in the browser */
    const isKeychainInstalled = useCallback(() => {
        return typeof window !== 'undefined' && !!window.hive_keychain;
    }, []);

    /** Login via Keychain requestSignBuffer */
    const login = useCallback((username) => {
        return new Promise((resolve, reject) => {
            if (!isKeychainInstalled()) {
                const err = new Error('Hive Keychain is not installed. Please install it from hive-keychain.com');
                setError(err.message);
                reject(err);
                return;
            }

            setLoading(true);
            setError(null);

            const message = `Login to HiveSwapBee: ${Date.now()}`;

            window.hive_keychain.requestSignBuffer(
                username,
                message,
                'Posting',
                (response) => {
                    setLoading(false);
                    if (response.success) {
                        setUser(username);
                        try {
                            localStorage.setItem('hiveswapbee_user', username);
                        } catch { /* ignore */ }
                        resolve(response);
                    } else {
                        const errMsg = response.message || 'Login failed';
                        setError(errMsg);
                        reject(new Error(errMsg));
                    }
                }
            );
        });
    }, [isKeychainInstalled]);

    /** Logout */
    const logout = useCallback(() => {
        setUser(null);
        setError(null);
        try {
            localStorage.removeItem('hiveswapbee_user');
        } catch { /* ignore */ }
    }, []);

    /**
     * Broadcast a custom_json via Keychain for Hive-Engine sidechain operations.
     * @param {string} contractName - e.g. "marketpools"
     * @param {string} contractAction - e.g. "swapTokens", "addLiquidity", "removeLiquidity"
     * @param {object} contractPayload - action-specific payload
     */
    const broadcastCustomJson = useCallback((contractName, contractAction, contractPayload) => {
        return new Promise((resolve, reject) => {
            if (!isKeychainInstalled()) {
                reject(new Error('Hive Keychain is not installed'));
                return;
            }
            if (!user) {
                reject(new Error('Please login first'));
                return;
            }

            // Active-key sidechain ops are rejected unless this flag is set.
            const json = JSON.stringify({
                contractName,
                contractAction,
                contractPayload: {
                    ...contractPayload,
                    isSignedWithActiveKey: true,
                },
            });

            window.hive_keychain.requestCustomJson(
                user,
                'ssc-mainnet-hive',
                'Active',
                json,
                `HiveSwapBee: ${contractAction}`,
                (response) => {
                    if (response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response.message || `${contractAction} failed`));
                    }
                }
            );
        });
    }, [user, isKeychainInstalled]);

    /** Several Hive-Engine ops in one Hive transaction (multi-hop swaps). */
    const broadcastOperations = useCallback((operations) => {
        return new Promise((resolve, reject) => {
            if (!isKeychainInstalled() || typeof window.hive_keychain.requestBroadcast !== 'function') {
                reject(new Error('Hive Keychain is not installed'));
                return;
            }
            if (!user) {
                reject(new Error('Please login first'));
                return;
            }
            window.hive_keychain.requestBroadcast(
                user,
                operations,
                'Active',
                (response) => {
                    if (response.success) resolve(response);
                    else reject(new Error(response.message || 'Broadcast failed'));
                }
            );
        });
    }, [user, isKeychainInstalled]);

    /* ---- Convenience methods ---- */

    /** One pool swap, or several hops in a single transaction. */
    const swapTokens = useCallback((payloadOrList) => {
        const steps = Array.isArray(payloadOrList) ? payloadOrList : [payloadOrList];
        if (steps.length === 1) {
            return broadcastCustomJson('marketpools', 'swapTokens', steps[0]);
        }
        const operations = steps.map((payload) => ['custom_json', {
            required_auths: [user],
            required_posting_auths: [],
            id: 'ssc-mainnet-hive',
            json: JSON.stringify({
                contractName: 'marketpools',
                contractAction: 'swapTokens',
                contractPayload: { ...payload, isSignedWithActiveKey: true },
            }),
        }]);
        return broadcastOperations(operations);
    }, [broadcastCustomJson, broadcastOperations, user]);

    /** Add liquidity to a pool */
    const addLiquidity = useCallback((payload) => {
        return broadcastCustomJson('marketpools', 'addLiquidity', {
            ...payload,
            isSignedWithActiveKey: true,
        });
    }, [broadcastCustomJson]);

    /** Remove liquidity from a pool */
    const removeLiquidity = useCallback((payload) => {
        return broadcastCustomJson('marketpools', 'removeLiquidity', {
            ...payload,
            isSignedWithActiveKey: true,
        });
    }, [broadcastCustomJson]);

    /** Limit or market order on the Hive-Engine order book. */
    const marketAction = useCallback((action, payload) => {
        return broadcastCustomJson('market', action, payload);
    }, [broadcastCustomJson]);

    /**
     * Turn HIVE into SWAP.HIVE. The sidechain credits the sender when HIVE
     * arrives at @honey-swap. Deposit fee is 1% (minimum 0.001 HIVE).
     */
    const depositHive = useCallback((amount) => {
        return new Promise((resolve, reject) => {
            if (!isKeychainInstalled()) {
                reject(new Error('Hive Keychain is not installed'));
                return;
            }
            if (!user) {
                reject(new Error('Please login first'));
                return;
            }
            window.hive_keychain.requestTransfer(
                user,
                'honey-swap',
                amount,
                '',
                'HIVE',
                (response) => {
                    if (response.success) resolve(response);
                    else reject(new Error(response.message || 'Deposit failed'));
                }
            );
        });
    }, [user, isKeychainInstalled]);

    /** Turn SWAP.HIVE back into HIVE. Quantity must have at most 3 decimals. */
    const withdrawHive = useCallback((quantity) => {
        return broadcastCustomJson('hivepegged', 'withdraw', { quantity });
    }, [broadcastCustomJson]);

    return {
        user,
        loading,
        error,
        isKeychainInstalled,
        login,
        logout,
        broadcastCustomJson,
        broadcastOperations,
        swapTokens,
        addLiquidity,
        removeLiquidity,
        marketAction,
        depositHive,
        withdrawHive,
    };
}
