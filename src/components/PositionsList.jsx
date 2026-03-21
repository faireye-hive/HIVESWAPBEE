import React from 'react';
import TokenIcon from './TokenIcon.jsx';

function formatNumber(num, decimals = 4) {
    const n = parseFloat(num);
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    return n.toFixed(decimals);
}

export default function PositionsList({ positions, pool }) {
    if (!positions || positions.length === 0) {
        return (
            <div className="empty-state">
                <span className="icon">👥</span>
                <p>No liquidity providers found for this pool.</p>
            </div>
        );
    }

    const totalShares = parseFloat(pool?.totalShares || 1);

    return (
        <div className="table-container glass">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Account</th>
                        <th>Shares</th>
                        <th>Pool %</th>
                        {pool && <th>Est. Base</th>}
                        {pool && <th>Est. Quote</th>}
                    </tr>
                </thead>
                <tbody>
                    {positions
                        .sort((a, b) => parseFloat(b.shares) - parseFloat(a.shares))
                        .map((pos, i) => {
                            const share = parseFloat(pos.shares);
                            const pct = ((share / totalShares) * 100);
                            const [base, quote] = (pool?.tokenPair || ':').split(':');
                            const estBase = pool ? (share / totalShares) * parseFloat(pool.baseQuantity) : 0;
                            const estQuote = pool ? (share / totalShares) * parseFloat(pool.quoteQuantity) : 0;

                            return (
                                <tr key={pos._id || pos.account}>
                                    <td style={{ color: 'var(--text-muted)', width: 40 }}>{i + 1}</td>
                                    <td>
                                        <a
                                            href={`https://peakd.com/@${pos.account}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ fontWeight: 600 }}
                                        >
                                            @{pos.account}
                                        </a>
                                    </td>
                                    <td>
                                        <span className="number">{formatNumber(pos.shares)}</span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div
                                                style={{
                                                    width: 40,
                                                    height: 6,
                                                    background: 'var(--bg-input)',
                                                    borderRadius: 3,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: `${Math.min(pct, 100)}%`,
                                                        height: '100%',
                                                        background: 'var(--accent-gradient)',
                                                        borderRadius: 3,
                                                    }}
                                                />
                                            </div>
                                            <span className="number" style={{ fontSize: '0.82rem' }}>
                                                {pct.toFixed(2)}%
                                            </span>
                                        </div>
                                    </td>
                                    {pool && (
                                        <td>
                                            <span className="number">{formatNumber(estBase)}</span>
                                            <span className="unit"> {base}</span>
                                        </td>
                                    )}
                                    {pool && (
                                        <td>
                                            <span className="number">{formatNumber(estQuote)}</span>
                                            <span className="unit"> {quote}</span>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                </tbody>
            </table>
        </div>
    );
}
