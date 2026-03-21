import React from 'react';

const COLORS = [
    'linear-gradient(135deg, #f5a623, #e8890c)',
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #00d68f, #00b074)',
    'linear-gradient(135deg, #3b82f6, #2563eb)',
    'linear-gradient(135deg, #ec4899, #db2777)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #14b8a6, #0d9488)',
    'linear-gradient(135deg, #ef4444, #dc2626)',
];

function getColor(symbol) {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
        hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    }
    return COLORS[Math.abs(hash) % COLORS.length];
}

export default function TokenIcon({ symbol, size = 28 }) {
    const label = symbol?.slice(0, 3) || '?';

    return (
        <div
            className="token-icon"
            style={{
                width: size,
                height: size,
                background: getColor(symbol || ''),
                fontSize: size * 0.26,
                lineHeight: 1,
            }}
            title={symbol}
        >
            {label}
        </div>
    );
}
