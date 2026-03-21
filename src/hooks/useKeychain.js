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

            const json = JSON.stringify({
                contractName,
                contractAction,
                contractPayload,
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

    /* ---- Convenience methods ---- */

    /** Swap tokens */
    const swapTokens = useCallback((payload) => {
        return broadcastCustomJson('marketpools', 'swapTokens', {
            ...payload,
            isSignedWithActiveKey: true,
        });
    }, [broadcastCustomJson]);

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

    return {
        user,
        loading,
        error,
        isKeychainInstalled,
        login,
        logout,
        broadcastCustomJson,
        swapTokens,
        addLiquidity,
        removeLiquidity,
    };
}
