import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TokenIcon from './TokenIcon.jsx';

function balanceOf(balances, symbol) {
    const n = parseFloat(balances?.[symbol]);
    return Number.isFinite(n) ? n : 0;
}

function fmtBal(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function symbolMatches(symbol, term) {
    const name = symbol.toLowerCase();
    if (name === term) return true;
    const parts = name.split(/[^a-z0-9]+/).filter(Boolean);
    if (parts.some((part) => part === term)) return true;
    // "sw" can match SWAP while the word is still being typed.
    // "bee" stays exact, so it does not also open BEER.
    if (term.length < 3) return parts.some((part) => part.startsWith(term));
    return false;
}

export default function PairBrowser({ pools, balances, fromToken, toToken, onPick }) {
    const [search, setSearch] = useState('');

    const { mine, rest } = useMemo(() => {
        const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const rows = [];
        for (const pool of pools || []) {
            const [base, quote] = String(pool.tokenPair || '').split(':');
            if (!base || !quote) continue;
            const matches = terms.every((term) => {
                const pairText = `${base}/${quote} ${base}:${quote}`.toLowerCase();
                if ((term.includes('/') || term.includes(':')) && pairText.includes(term)) return true;
                return symbolMatches(base, term) || symbolMatches(quote, term);
            });
            if (terms.length && !matches) continue;
            const baseBal = balanceOf(balances, base);
            const quoteBal = balanceOf(balances, quote);
            rows.push({
                pair: pool.tokenPair,
                base,
                quote,
                baseBal,
                quoteBal,
                held: (baseBal > 0 ? 1 : 0) + (quoteBal > 0 ? 1 : 0),
            });
        }
        rows.sort((a, b) => {
            if (a.held !== b.held) return b.held - a.held;
            return a.pair.localeCompare(b.pair);
        });
        return {
            mine: rows.filter((row) => row.held > 0),
            rest: rows.filter((row) => row.held === 0),
        };
    }, [pools, balances, search]);

    const pick = (row) => {
        if (row.quoteBal > 0 && row.baseBal <= 0) onPick(row.quote, row.base);
        else onPick(row.base, row.quote);
    };

    const renderRow = (row) => {
        const active = (fromToken === row.base && toToken === row.quote)
            || (fromToken === row.quote && toToken === row.base);
        const held = [];
        if (row.baseBal > 0) held.push(`${fmtBal(row.baseBal)} ${row.base}`);
        if (row.quoteBal > 0) held.push(`${fmtBal(row.quoteBal)} ${row.quote}`);
        return (
            <button
                key={row.pair}
                type="button"
                className={`pair-row ${active ? 'active' : ''}`}
                onClick={() => pick(row)}
            >
                <span className="pair-icons">
                    <TokenIcon symbol={row.base} size={22} />
                    <TokenIcon symbol={row.quote} size={22} />
                </span>
                <span className="pair-names">
                    <strong>{row.base} / {row.quote}</strong>
                    <span>{held.length ? held.join(' · ') : 'Pool'}</span>
                </span>
            </button>
        );
    };

    return (
        <div className="card pair-browser">
            <div className="card-header">
                <h2 className="card-title">Pools</h2>
                <span className="pair-count">{mine.length + rest.length}</span>
            </div>
            <input
                className="input"
                placeholder="Search a pair, for example BEE"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
            />
            <div className="pair-list">
                {mine.length + rest.length === 0 && (
                    <p className="token-select-empty">No pools match that search.</p>
                )}
                {mine.length > 0 && (
                    <>
                        <p className="pair-section">You hold</p>
                        {mine.map(renderRow)}
                    </>
                )}
                {rest.length > 0 && (
                    <>
                        <p className="pair-section">{mine.length ? 'Other pools' : 'All pools'}</p>
                        {rest.map(renderRow)}
                    </>
                )}
            </div>
            <p className="swap-note">
                HIVE is not a pool token.{' '}
                <Link to="/wallet">Deposit or withdraw it on the Wallet page.</Link>
            </p>
        </div>
    );
}
