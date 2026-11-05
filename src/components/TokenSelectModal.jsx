import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import TokenIcon from './TokenIcon.jsx';

const PINNED = ['SWAP.HIVE', 'BEE', 'LEO', 'DEC', 'SWAP.HBD', 'SPS'];

function balanceOf(balances, symbol) {
    const raw = balances?.[symbol];
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
}

export default function TokenSelectModal({ open, onClose, tokens, balances, disabledSymbol, onSelect }) {
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (open) setSearch('');
    }, [open]);

    const list = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = (tokens || []).filter((t) => {
            if (!q) return true;
            return t.symbol.toLowerCase().includes(q) || (t.name || '').toLowerCase().includes(q);
        });
        filtered.sort((a, b) => {
            const ba = balanceOf(balances, a.symbol) > 0 ? 0 : 1;
            const bb = balanceOf(balances, b.symbol) > 0 ? 0 : 1;
            if (ba !== bb) return ba - bb;
            if (ba === 0) {
                const diff = balanceOf(balances, b.symbol) - balanceOf(balances, a.symbol);
                if (diff !== 0) return diff;
            }
            const pa = PINNED.indexOf(a.symbol);
            const pb = PINNED.indexOf(b.symbol);
            if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
            return a.symbol.localeCompare(b.symbol);
        });
        return filtered.slice(0, 80);
    }, [tokens, balances, search]);

    return (
        <Modal isOpen={open} onClose={onClose} title="Select token" size="sm">
            <input
                className="input"
                placeholder="Search name or symbol"
                value={search}
                autoFocus
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
            />
            <div className="token-select-list">
                {list.length === 0 && (
                    <p className="token-select-empty">No tokens match that search.</p>
                )}
                {list.map((t) => {
                    const disabled = t.symbol === disabledSymbol;
                    const bal = balances?.[t.symbol];
                    return (
                        <button
                            key={t.symbol}
                            type="button"
                            className="token-select-row"
                            disabled={disabled}
                            onClick={() => { onSelect(t.symbol); onClose(); }}
                        >
                            <TokenIcon symbol={t.symbol} size={28} />
                            <span className="token-select-name">
                                <strong>{t.symbol}</strong>
                                <span>{t.name && t.name !== t.symbol ? t.name : 'Hive-Engine token'}</span>
                            </span>
                            <span className="token-select-bal">
                                {bal != null && balanceOf(balances, t.symbol) > 0
                                    ? Number(bal).toLocaleString('en-US', { maximumFractionDigits: 4 })
                                    : ''}
                            </span>
                        </button>
                    );
                })}
            </div>
        </Modal>
    );
}
