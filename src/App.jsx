import React from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { KeychainProvider } from './context/KeychainContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Pools from './pages/Pools.jsx';
import PoolDetail from './pages/PoolDetail.jsx';
import Swap from './pages/Swap.jsx';
import UserPositions from './pages/UserPositions.jsx';
import Tokens from './pages/Tokens.jsx';
import Trade from './pages/Trade.jsx';
import Tribes from './pages/Tribes.jsx';
import TribePosts from './pages/TribePosts.jsx';
import UserWallet from './pages/UserWallet.jsx';

export default function App() {
    return (
        <BrowserRouter>
            <KeychainProvider>
                <ToastProvider>
                    <Navbar />
                    <Routes>
                        <Route path="/" element={<Pools />} />
                        <Route path="/pool/:tokenPair" element={<PoolDetail />} />
                        <Route path="/swap" element={<Swap />} />
                        <Route path="/positions" element={<UserPositions />} />
                        <Route path="/tokens" element={<Tokens />} />
                        <Route path="/trade" element={<Navigate to="/trade/BEE" replace />} />
                        <Route path="/trade/:symbol" element={<Trade />} />
                        <Route path="/tribes" element={<Tribes />} />
                        <Route path="/tribes/:tag" element={<TribePosts />} />
                        <Route path="/wallet" element={<UserWallet />} />
                    </Routes>
                    <Footer />
                </ToastProvider>
            </KeychainProvider>
        </BrowserRouter>
    );
}
