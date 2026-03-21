import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { useBalances } from '../hooks/useBalances.js';
import RpcSettingsModal from './RpcSettingsModal.jsx';
import './Navbar.css';

export default function Navbar() {
    const { user, loading, login, logout, isKeychainInstalled } = useKeychainContext();
    const [username, setUsername] = useState('');
    const [showLogin, setShowLogin] = useState(false);
    const [showRpcSettings, setShowRpcSettings] = useState(false);
    const location = useLocation();
    
    const { hiveBalance, swapHiveBalance, loading: balancesLoading } = useBalances(user);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!username.trim()) return;
        try {
            await login(username.trim().toLowerCase());
            setShowLogin(false);
            setUsername('');
        } catch {
            // error is in context
        }
    };

    const navLinks = [
        { path: '/', label: 'Pools', icon: '◈' },
        { path: '/swap', label: 'Swap', icon: '⇄' },
        { path: '/tokens', label: 'Tokens', icon: '🪙' },
        { path: '/tribes', label: 'Tribes', icon: '🔥' },
    ];

    return (
        <>
            <nav className="navbar">
            <div className="container navbar-inner">
                {/* Logo */}
                <Link to="/" className="navbar-logo">
                    <span className="logo-icon">🐝</span>
                    <span className="logo-text">
                        Hive<span className="logo-accent">Swap</span>Bee
                    </span>
                </Link>

                {/* Nav links */}
                <div className="navbar-links">
                    {navLinks.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`nav-link ${location.pathname === link.path ? 'active' : ''}`}
                        >
                            <span className="nav-icon">{link.icon}</span>
                            {link.label}
                        </Link>
                    ))}
                </div>

                {/* Auth & Settings section */}
                <div className="navbar-auth">
                    {user ? (
                        <div className="user-menu">
                            <div className="user-balances">
                                <span className="balance-item" title="HIVE Balance">
                                    <span className="balance-icon">HIVE</span>
                                    {balancesLoading ? '...' : (hiveBalance ? hiveBalance.split(' ')[0] : '0.000')}
                                </span>
                                <span className="balance-item" title="SWAP.HIVE Balance">
                                    <span className="balance-icon">SWAP.HIVE</span>
                                    {balancesLoading ? '...' : (swapHiveBalance ? Number(swapHiveBalance).toFixed(3) : '0.000')}
                                </span>
                            </div>
                            <Link to={`/positions`} className="user-badge">
                                <span className="user-avatar">
                                    {user.charAt(0).toUpperCase()}
                                </span>
                                <span className="user-name">@{user}</span>
                            </Link>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowRpcSettings(true)} title="RPC Settings">
                                ⚙️
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={logout}>
                                Logout
                            </button>
                        </div>
                    ) : showLogin ? (
                        <form className="login-form" onSubmit={handleLogin}>
                            <input
                                type="text"
                                className="input login-input"
                                placeholder="Hive username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                            />
                            <button
                                type="submit"
                                className="btn btn-primary btn-sm"
                                disabled={loading || !username.trim()}
                            >
                                {loading ? '...' : 'Login'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowLogin(false)}
                            >
                                ✕
                            </button>
                        </form>
                    ) : (
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                if (!isKeychainInstalled()) {
                                    window.open('https://hive-keychain.com', '_blank');
                                    return;
                                }
                                setShowLogin(true);
                            }}
                        >
                            <span className="btn-icon">🔑</span>
                            Connect Wallet
                        </button>
                    )}
                    
                    {!user && (
                        <button className="btn btn-ghost btn-sm rpc-btn" onClick={() => setShowRpcSettings(true)} title="RPC Settings">
                            ⚙️
                        </button>
                    )}
                </div>
            </div>

            </nav>
            {showRpcSettings && (
                <RpcSettingsModal onClose={() => setShowRpcSettings(false)} />
            )}
        </>
    );
}
