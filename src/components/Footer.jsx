import React from 'react';
import './Footer.css';

export default function Footer() {
    return (
        <footer className="footer">
            <div className="container footer-inner">
                <div className="footer-brand">
                    <span className="footer-logo">🐝 HiveSwapBee</span>
                    <p className="footer-desc">
                        A decentralized exchange for Hive-Engine liquidity pools.
                        Powered by the Hive blockchain.
                    </p>
                </div>
                <div className="footer-links">
                    <div className="footer-col">
                        <h4>Resources</h4>
                        <a href="https://hive-engine.com" target="_blank" rel="noopener noreferrer">Hive-Engine</a>
                        <a href="https://hive.io" target="_blank" rel="noopener noreferrer">Hive Blockchain</a>
                        <a href="https://hive-keychain.com" target="_blank" rel="noopener noreferrer">Hive Keychain</a>
                    </div>
                    <div className="footer-col">
                        <h4>Community</h4>
                        <a href="https://discord.gg/hive" target="_blank" rel="noopener noreferrer">Discord</a>
                        <a href="https://twitter.com/haborandoboteco" target="_blank" rel="noopener noreferrer">Twitter</a>
                        <a href="https://github.com/hive-engine" target="_blank" rel="noopener noreferrer">GitHub</a>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>Built with ♥ on the Hive Blockchain · {new Date().getFullYear()}</p>
                </div>
            </div>
        </footer>
    );
}
