import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { KeychainProvider } from './context/KeychainContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Pools from './pages/Pools.jsx';
import PoolDetail from './pages/PoolDetail.jsx';
import Swap from './pages/Swap.jsx';
import UserPositions from './pages/UserPositions.jsx';
import Tokens from './pages/Tokens.jsx';
import Tribes from './pages/Tribes.jsx';
import TribePosts from './pages/TribePosts.jsx';

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
                        <Route path="/tribes" element={<Tribes />} />
                        <Route path="/tribes/:tag" element={<TribePosts />} />
                    </Routes>
                    <Footer />
                </ToastProvider>
            </KeychainProvider>
        </BrowserRouter>
    );
}
