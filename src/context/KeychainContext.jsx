import React, { createContext, useContext } from 'react';
import { useKeychain } from '../hooks/useKeychain';

const KeychainContext = createContext(null);

export function KeychainProvider({ children }) {
    const keychain = useKeychain();
    return (
        <KeychainContext.Provider value={keychain}>
            {children}
        </KeychainContext.Provider>
    );
}

export function useKeychainContext() {
    const ctx = useContext(KeychainContext);
    if (!ctx) throw new Error('useKeychainContext must be used within KeychainProvider');
    return ctx;
}
