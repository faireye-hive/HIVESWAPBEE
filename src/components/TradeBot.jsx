import React, { useMemo } from 'react';
import { hivePerToken, planMake, planTake } from '../lib/tradeBot.js';

function fmtPx(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '—';
    if (n >= 1) return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function deltaPct(price, spot) {
    const p = Number(price);
    const s = Number(spot);
    if (!Number.isFinite(p) || !Number.isFinite(s) || s === 0) return null;
    return ((p - s) / s) * 100;
}

function badgeFor(bot) {
    if (bot.status === 'Paused') return { text: 'Paused', tone: 'paused' };
    if (!bot.enabled) return { text: 'Off', tone: 'off' };
    if (bot.status === 'Confirm in Keychain') return { text: 'Keychain', tone: 'wait' };
    if (bot.status === 'Waiting for the next block' || bot.status.startsWith('Sent.')) {
        return { text: 'Next block', tone: 'wait' };
    }
    if (
        bot.status === 'Watching'
        || bot.status.startsWith('No book')
        || bot.status.startsWith('Quotes are')
        || bot.status.startsWith('This token')
    ) {
        return { text: 'Watching', tone: 'live' };
    }
    return { text: 'Working', tone: 'live' };
}

export default function TradeBot({
    symbol,
    precision,
    user,
    pool,
    asks,
    bids,
    orders,
    balances,
    bestBid,
    bestAsk,
    bot,
}) {
    const preview = useMemo(() => {
        if (precision == null) return null;
        const args = {
            asks,
            bids,
            pool,
            symbol,
            account: user,
            tokenPrecision: precision,
            hiveBalance: balances?.hive || '0',
            tokenBalance: balances?.token || '0',
            maxHive: bot.settings.maxHive || '5',
            minProfitPct: parseFloat(bot.settings.minProfit) || 0.8,
            spreadPct: parseFloat(bot.settings.spread) || 1.5,
            orders: orders || { buys: [], sells: [] },
            botIds: [],
        };
        return bot.mode === 'make' ? planMake(args) : planTake(args);
    }, [
        asks,
        bids,
        pool,
        symbol,
        user,
        precision,
        balances?.hive,
        balances?.token,
        bot.settings,
        bot.mode,
        orders,
    ]);

    const spot = (bot.enabled && bot.live?.spot) || preview?.spot || hivePerToken(pool, symbol);
    const badge = badgeFor(bot);
    const active = bot.enabled || bot.status === 'Paused';
    const detail = active
        ? bot.status
        : (preview?.reason || (precision == null ? 'Waiting for the token.' : 'Waiting for the book.'));
    const bidEdge = deltaPct(bestBid, spot);
    const askEdge = deltaPct(bestAsk, spot);
    const profit = !bot.enabled ? preview?.action?.profitPct : bot.live?.action?.profitPct;

    const setField = (key) => (event) => {
        bot.setSettings({
            ...bot.settings,
            [key]: event.target.value.replace(/[^\d.]/g, ''),
        });
    };

    return (
        <section className="card trade-bot">
            <div className="trade-bot-head">
                <h2 className="card-title">Pool bot</h2>
                <span className={`bot-status ${badge.tone}`}>{badge.text}</span>
            </div>

            <div className="tabs" role="tablist" aria-label="Bot mode">
                <button
                    type="button"
                    className={`tab ${bot.mode === 'take' ? 'active' : ''}`}
                    onClick={() => bot.setMode('take')}
                >
                    Take
                </button>
                <button
                    type="button"
                    className={`tab ${bot.mode === 'make' ? 'active' : ''}`}
                    onClick={() => bot.setMode('make')}
                >
                    Make
                </button>
            </div>

            <p className="bot-plan">{detail}</p>
            {!active && (
                <p className="swap-note">Nothing is sent until you press Start. This line is only the plan for the book you see now.</p>
            )}

            <div className="bot-edge">
                <span>Pool <b>{spot ? fmtPx(spot.toString()) : '—'}</b></span>
                <span>Bid <b className={bidEdge > 0 ? 'bot-good' : ''}>{bidEdge == null ? '—' : `${bidEdge > 0 ? '+' : ''}${bidEdge.toFixed(2)}%`}</b></span>
                <span>Ask <b className={askEdge < 0 ? 'bot-good' : ''}>{askEdge == null ? '—' : `${askEdge > 0 ? '+' : ''}${askEdge.toFixed(2)}%`}</b></span>
                {Number.isFinite(profit) && <span>Plan <b className="bot-good">{profit.toFixed(2)}%</b></span>}
            </div>

            <div className="bot-settings">
                {bot.mode === 'take' ? (
                    <label>
                        Min profit %
                        <input className="input" inputMode="decimal" value={bot.settings.minProfit} onChange={setField('minProfit')} />
                    </label>
                ) : (
                    <label>
                        Spread %
                        <input className="input" inputMode="decimal" value={bot.settings.spread} onChange={setField('spread')} />
                    </label>
                )}
                <label>
                    Max SWAP.HIVE
                    <input className="input" inputMode="decimal" value={bot.settings.maxHive} onChange={setField('maxHive')} />
                </label>
            </div>

            <p className="swap-note">
                {bot.mode === 'take'
                    ? 'Take buys the best ask when the pool pays more, or sells the best bid when the pool is cheaper. The other side waits for a later block and is skipped if the pool moves. You can be left holding the token.'
                    : 'Make quotes one side at a time around the pool, wider than the 0.25% pool fee. A replace is a cancel now and a new order on a later block. Orders you placed yourself are left alone.'}
            </p>
            <p className="swap-note">
                One Hive-Engine transaction per block. Every send opens Keychain. Cancelling the signature pauses the bot.
                {bot.mode === 'make' ? ' Turning the bot off leaves its quotes open until you cancel them below.' : ''}
            </p>

            {bot.enabled ? (
                <button type="button" className="btn btn-ghost" onClick={bot.stop}>Stop bot</button>
            ) : (
                <button type="button" className="btn btn-primary" onClick={bot.arm}>Start bot</button>
            )}

            {bot.log.length > 0 && (
                <ul className="bot-log">
                    {bot.log.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                </ul>
            )}
        </section>
    );
}
