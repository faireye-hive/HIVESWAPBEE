import { useCallback, useEffect, useRef, useState } from 'react';
import Big from 'big.js';
import { getHeadBlock } from '../api/hive.js';
import {
    findPool,
    getAccountOrders,
    getBuyBook,
    getSellBook,
    getTokenBalance,
} from '../api/hiveEngine.js';
import { gateReady, gateSnapshot } from '../lib/blockGate.js';
import { buildSwap, floorToPrecision } from '../lib/swapQuote.js';
import { hedgeStillPays, hivePerToken, hiveToBuyTokens, matchingBid, planMake, planTake } from '../lib/tradeBot.js';

const SETTINGS_KEY = 'hiveswapbee_bot_settings';
const TICK_MS = 8000;
const BOOK_LIMIT = 40;
const FEE_MUL = '0.9975';

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        return {
            minProfit: saved.minProfit || '0.8',
            maxHive: saved.maxHive || '5',
            spread: saved.spread || '1.5',
        };
    } catch {
        return { minProfit: '0.8', maxHive: '5', spread: '1.5' };
    }
}

function num(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function samePrice(a, b) {
    try {
        return new Big(a).eq(b);
    } catch {
        return a === b;
    }
}

function smallest(a, b, c) {
    let next = new Big(a);
    if (next.gt(b)) next = new Big(b);
    if (next.gt(c)) next = new Big(c);
    return next;
}

function isCancel(message) {
    return /cancel|declin|reject/i.test(message);
}

function isGateWait(message) {
    return /already waiting|next Hive block|extra fee/i.test(message);
}

function isNodeBlip(message) {
    return /Hive API error|Hive RPC|Hive-Engine RPC|timeout|fetch|network|unreachable|Load failed|HTTP /i.test(message);
}

/**
 * Optional pool bot. It starts off, never stores a key, and sends at most
 * one Hive-Engine transaction per Hive block. Each send still opens Keychain.
 */
export function usePoolBot({ symbol, precision, user, pool, marketAction, swapTokens, runTx, toast }) {
    const [enabled, setEnabled] = useState(false);
    const [paused, setPaused] = useState(false);
    const [mode, setModeState] = useState('take');
    const [settings, setSettings] = useState(loadSettings);
    const [status, setStatus] = useState('Off');
    const [live, setLive] = useState(null);
    const [log, setLog] = useState([]);
    const cycle = useRef(null);
    const botIds = useRef([]);
    const busy = useRef(false);
    const poolRef = useRef(pool);
    const toastRef = useRef(toast);
    const marketActionRef = useRef(marketAction);
    const swapTokensRef = useRef(swapTokens);
    const runTxRef = useRef(runTx);
    const settingsRef = useRef(settings);
    const modeRef = useRef(mode);

    useEffect(() => {
        poolRef.current = pool;
        toastRef.current = toast;
        marketActionRef.current = marketAction;
        swapTokensRef.current = swapTokens;
        runTxRef.current = runTx;
        settingsRef.current = settings;
        modeRef.current = mode;
    }, [pool, toast, marketAction, swapTokens, runTx, settings, mode]);

    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        cycle.current = null;
        botIds.current = [];
        setLive(null);
    }, [symbol]);

    const pushLog = useCallback((line) => {
        setLog((prev) => [line, ...prev].slice(0, 6));
    }, []);

    const pause = useCallback((line) => {
        cycle.current = null;
        setEnabled(false);
        setPaused(true);
        setStatus('Paused');
        if (line) pushLog(line);
    }, [pushLog]);

    useEffect(() => {
        if (!enabled || paused || !user || precision == null) return undefined;
        let stop = false;

        const prune = (orders) => {
            const rows = [...(orders?.buys || []), ...(orders?.sells || [])];
            botIds.current = botIds.current
                .filter((id) => rows.some((row) => row.txId === id))
                .slice(-8);
        };

        const tryAdopt = (orders) => {
            const intent = cycle.current;
            if (intent?.step !== 'adopt') return false;
            const list = intent.side === 'buy' ? orders.buys : orders.sells;
            const match = (list || []).find((row) => (
                row.txId
                && samePrice(row.price, intent.price)
                && !intent.known.has(row.txId)
            ));
            if (match) {
                if (!botIds.current.includes(match.txId)) botIds.current.push(match.txId);
                cycle.current = null;
                return true;
            }
            intent.tries = (intent.tries || 0) + 1;
            if (intent.tries >= 4) {
                cycle.current = null;
                pushLog('The new quote did not show up. It will be left alone.');
            }
            return false;
        };

        const send = async (action, book) => {
            if (action.kind === 'sell-pool' || action.kind === 'buy-pool' || action.kind === 'sell-book') {
                if (!hedgeStillPays({
                    pool: book.pool,
                    symbol,
                    kind: action.kind,
                    quantity: action.quantity,
                    price: action.price,
                    feeMul: FEE_MUL,
                    minProfitPct: num(settingsRef.current.minProfit, 0.8),
                })) {
                    cycle.current = null;
                    pushLog(action.kind === 'sell-pool'
                        ? 'The pool moved. The tokens stay in your balance.'
                        : 'The pool moved. The other side was skipped.');
                    setStatus('Watching');
                    return;
                }
            }
            setStatus('Confirm in Keychain');
            await runTxRef.current(async () => {
                if (action.kind === 'buy-book' || action.kind === 'place-bid') {
                    await marketActionRef.current('buy', {
                        symbol,
                        quantity: action.quantity,
                        price: action.price,
                    });
                } else if (action.kind === 'sell-book' || action.kind === 'place-ask') {
                    await marketActionRef.current('sell', {
                        symbol,
                        quantity: action.quantity,
                        price: action.price,
                    });
                } else if (action.kind === 'cancel-bid') {
                    await marketActionRef.current('cancel', { type: 'buy', id: action.id });
                } else if (action.kind === 'cancel-ask') {
                    await marketActionRef.current('cancel', { type: 'sell', id: action.id });
                } else if (action.kind === 'sell-pool' || action.kind === 'buy-pool') {
                    const from = action.kind === 'sell-pool' ? symbol : 'SWAP.HIVE';
                    const to = action.kind === 'sell-pool' ? 'SWAP.HIVE' : symbol;
                    const amountIn = action.kind === 'sell-pool'
                        ? action.quantity
                        : hiveToBuyTokens(book.pool, symbol, action.quantity, FEE_MUL)?.toFixed(8, 0);
                    const built = amountIn && buildSwap({
                        route: [{ pool: book.pool, from, to }],
                        amountIn,
                        slippagePct: 1,
                        feeMul: FEE_MUL,
                        precisionOf: (name) => (name === 'SWAP.HIVE' ? 8 : precision),
                    });
                    if (!built) throw new Error('The pool quote is no longer valid.');
                    await swapTokensRef.current(built.ops);
                } else {
                    throw new Error('Unknown bot action');
                }
            });
            pushLog(action.label || action.kind);
            if (action.kind === 'buy-book') {
                cycle.current = {
                    step: 'resting',
                    side: 'buy',
                    price: action.price,
                    quantity: action.quantity,
                    tokenBefore: book.token,
                    tries: 0,
                };
            } else if (action.kind === 'sell-book' && action.hedge === 'buy-pool') {
                cycle.current = {
                    step: 'resting',
                    side: 'sell',
                    price: action.price,
                    quantity: action.quantity,
                    tokenBefore: book.token,
                    tries: 0,
                };
            } else if (action.kind === 'buy-pool' && action.hedge === 'sell-book') {
                cycle.current = {
                    step: 'resting',
                    side: 'pool',
                    price: action.price,
                    quantity: action.quantity,
                    tokenBefore: book.token,
                    tries: 0,
                };
            } else if (action.kind === 'place-bid' || action.kind === 'place-ask') {
                const open = action.kind === 'place-bid' ? book.orders?.buys : book.orders?.sells;
                cycle.current = {
                    step: 'adopt',
                    side: action.kind === 'place-bid' ? 'buy' : 'sell',
                    price: action.price,
                    quantity: action.quantity,
                    known: new Set((open || []).map((row) => row.txId).filter(Boolean)),
                    tries: 0,
                };
            } else if (action.kind === 'cancel-bid' || action.kind === 'cancel-ask') {
                botIds.current = botIds.current.filter((id) => id !== action.id);
                cycle.current = null;
            } else {
                cycle.current = null;
            }
            setStatus('Sent. The next action waits for a new block.');
        };

        const reviewResting = (pending, book) => {
            const gained = new Big(book.token || 0).minus(pending.tokenBefore || 0);
            const spent = new Big(pending.tokenBefore || 0).minus(book.token || 0);
            if (pending.side === 'pool') {
                pending.tries = (pending.tries || 0) + 1;
                if (gained.gte(new Big(pending.quantity).times('0.5'))) {
                    const qty = gained.lt(pending.quantity) ? gained : new Big(pending.quantity);
                    const qtyStr = floorToPrecision(qty, precision);
                    if (qtyStr) {
                        cycle.current = {
                            step: 'hedge',
                            kind: 'sell-book',
                            quantity: qtyStr,
                            price: pending.price,
                        };
                        return 'Pool buy landed. The book sale waits for the next block.';
                    }
                }
                if (pending.tries >= 4) {
                    cycle.current = null;
                    pushLog('Pool buy did not show in the balance. Nothing else was sent.');
                    return 'Watching';
                }
                return 'Pool buy is settling. Not sending another transaction.';
            }

            const open = (pending.side === 'buy' ? book.orders.buys : book.orders.sells) || [];
            const still = open.find((row) => samePrice(row.price, pending.price));
            const remaining = still ? new Big(still.quantity || 0) : new Big(0);
            const moved = new Big(pending.quantity).minus(remaining);
            const filledEnough = moved.gte(new Big(pending.quantity).times('0.9'));
            if (pending.side === 'buy' && filledEnough && gained.gt(0)) {
                const qtyStr = floorToPrecision(smallest(moved, gained, pending.quantity), precision);
                if (qtyStr) {
                    cycle.current = { step: 'hedge', kind: 'sell-pool', quantity: qtyStr, price: pending.price };
                    return 'Buy filled. The pool sale waits for the next block.';
                }
            }
            if (pending.side === 'sell' && filledEnough && spent.gt(0)) {
                const qtyStr = floorToPrecision(smallest(moved, spent, pending.quantity), precision);
                if (qtyStr) {
                    cycle.current = { step: 'hedge', kind: 'buy-pool', quantity: qtyStr, price: pending.price };
                    return 'Sell filled. The pool buy waits for the next block.';
                }
            }
            if (!still) return { gone: true, gained, spent };
            return 'Order is resting. Not sending another transaction.';
        };

        const tick = async () => {
            if (stop || busy.current || document.visibilityState === 'hidden') return;
            if (gateSnapshot().inFlight) {
                setStatus('Confirm in Keychain');
                return;
            }
            busy.current = true;
            try {
                const minProfitPct = num(settingsRef.current.minProfit, 0.8);
                const [asks, bids, poolA, poolB, hiveRow, tokenRow] = await Promise.all([
                    getSellBook(symbol, BOOK_LIMIT),
                    getBuyBook(symbol, BOOK_LIMIT),
                    findPool(`SWAP.HIVE:${symbol}`),
                    findPool(`${symbol}:SWAP.HIVE`),
                    getTokenBalance(user, 'SWAP.HIVE'),
                    getTokenBalance(user, symbol),
                ]);
                if (stop) return;
                let orders = { buys: [], sells: [] };
                let ordersOk = true;
                try {
                    orders = await getAccountOrders(user, symbol);
                } catch {
                    ordersOk = false;
                }
                const nextPool = poolA || poolB || poolRef.current;
                if (!nextPool) {
                    setLive(null);
                    setStatus('This token has no SWAP.HIVE pool.');
                    return;
                }
                if (ordersOk) {
                    if (tryAdopt(orders)) pushLog('The new quote is live.');
                    prune(orders);
                }

                const book = {
                    asks: asks || [],
                    bids: bids || [],
                    pool: nextPool,
                    hive: hiveRow?.balance || '0',
                    token: tokenRow?.balance || '0',
                    orders,
                };
                const args = {
                    asks: book.asks,
                    bids: book.bids,
                    pool: book.pool,
                    symbol,
                    account: user,
                    tokenPrecision: precision,
                    hiveBalance: book.hive,
                    tokenBalance: book.token,
                    maxHive: settingsRef.current.maxHive || '5',
                    minProfitPct,
                    spreadPct: num(settingsRef.current.spread, 1.5),
                    orders: book.orders,
                    botIds: botIds.current,
                };

                let action = null;
                let reason = 'Watching';
                const pending = cycle.current;
                if (pending?.step === 'adopt') {
                    reason = ordersOk
                        ? 'Watching for the new quote. Not sending another transaction.'
                        : 'Order list did not load. Nothing was sent.';
                } else if (!ordersOk && (modeRef.current === 'make' || pending?.step === 'resting')) {
                    reason = 'Order list did not load. Nothing was sent.';
                } else if (pending?.step === 'hedge') {
                    action = {
                        kind: pending.kind,
                        quantity: pending.quantity,
                        price: pending.price,
                        hedge: true,
                        label: pending.kind === 'sell-pool'
                            ? `Sell ${pending.quantity} ${symbol} to the pool.`
                            : pending.kind === 'buy-pool'
                                ? `Buy ${pending.quantity} ${symbol} from the pool.`
                                : `Sell ${pending.quantity} ${symbol} at ${pending.price}.`,
                    };
                    reason = `${action.label} Waiting for the next block.`;
                } else if (pending?.step === 'resting') {
                    const reviewed = reviewResting(pending, book);
                    if (reviewed && typeof reviewed === 'object' && reviewed.gone) {
                        if (!gateReady(await getHeadBlock())) {
                            reason = 'Order is resting. Not sending another transaction.';
                        } else if (pending.side === 'buy' && reviewed.gained.times(pending.price).gte('0.05')) {
                            const qtyStr = floorToPrecision(reviewed.gained.lt(pending.quantity) ? reviewed.gained : pending.quantity, precision);
                            if (qtyStr) {
                                cycle.current = { step: 'hedge', kind: 'sell-pool', quantity: qtyStr, price: pending.price };
                                reason = 'Buy finished short. The pool sale waits for the next block.';
                            }
                        } else if (pending.side === 'sell' && reviewed.spent.times(pending.price).gte('0.05')) {
                            const qtyStr = floorToPrecision(reviewed.spent.lt(pending.quantity) ? reviewed.spent : pending.quantity, precision);
                            if (qtyStr) {
                                cycle.current = { step: 'hedge', kind: 'buy-pool', quantity: qtyStr, price: pending.price };
                                reason = 'Sell finished short. The pool buy waits for the next block.';
                            }
                        } else {
                            cycle.current = null;
                            reason = 'The order did not fill.';
                            pushLog(reason);
                        }
                    } else {
                        reason = reviewed || 'Order is resting. Not sending another transaction.';
                    }
                } else if (modeRef.current === 'make') {
                    const planned = planMake(args);
                    action = planned.action;
                    reason = planned.reason;
                    setLive(planned);
                } else {
                    const planned = planTake(args);
                    action = planned.action;
                    reason = planned.reason;
                    setLive(planned);
                }

                if (cycle.current && cycle.current.step !== 'adopt') {
                    setLive({
                        action,
                        spot: hivePerToken(nextPool, symbol),
                        reason,
                    });
                }
                setStatus(reason);
                if (!action || stop) return;

                const head = await getHeadBlock();
                if (!gateReady(head)) {
                    setStatus('Waiting for the next block');
                    return;
                }

                const [freshAsks, freshBids, freshA, freshB, freshHive, freshToken] = await Promise.all([
                    getSellBook(symbol, BOOK_LIMIT, true),
                    getBuyBook(symbol, BOOK_LIMIT, true),
                    findPool(`SWAP.HIVE:${symbol}`, true),
                    findPool(`${symbol}:SWAP.HIVE`, true),
                    getTokenBalance(user, 'SWAP.HIVE', true),
                    getTokenBalance(user, symbol, true),
                ]);
                const freshPool = freshA || freshB;
                if (!freshPool) {
                    setStatus('Pool read failed. Nothing was sent.');
                    return;
                }
                const freshBook = {
                    ...book,
                    asks: freshAsks || [],
                    bids: freshBids || [],
                    pool: freshPool,
                    hive: freshHive?.balance || '0',
                    token: freshToken?.balance || '0',
                };
                const freshArgs = {
                    ...args,
                    asks: freshBook.asks,
                    bids: freshBook.bids,
                    pool: freshPool,
                    hiveBalance: freshBook.hive,
                    tokenBalance: freshBook.token,
                };

                if (action.hedge === true) {
                    let next = { ...action };
                    if (next.kind === 'sell-book') {
                        const match = matchingBid({
                            bids: freshBook.bids,
                            account: user,
                            minPrice: next.price,
                            quantity: next.quantity,
                            tokenPrecision: precision,
                        });
                        if (!match) {
                            cycle.current = null;
                            pushLog('The bid is gone. Tokens stay in your balance.');
                            setStatus('Watching');
                            return;
                        }
                        let qty = new Big(match.quantity);
                        if (qty.gt(freshBook.token || 0)) qty = new Big(freshBook.token || 0);
                        const qtyStr = floorToPrecision(qty, precision);
                        if (!qtyStr) {
                            cycle.current = null;
                            pushLog('Not enough tokens left to sell. Nothing was sent.');
                            setStatus('Watching');
                            return;
                        }
                        next = {
                            ...next,
                            price: match.price,
                            quantity: qtyStr,
                            label: `Sell ${qtyStr} ${symbol} at ${match.price}.`,
                        };
                    }
                    if (!hedgeStillPays({
                        pool: freshPool,
                        symbol,
                        kind: next.kind,
                        quantity: next.quantity,
                        price: next.price,
                        feeMul: FEE_MUL,
                        minProfitPct,
                    })) {
                        cycle.current = null;
                        const line = next.kind === 'sell-pool'
                            ? 'The pool moved. The tokens stay in your balance.'
                            : 'The pool moved. The other side was skipped.';
                        pushLog(line);
                        setStatus('Watching');
                        return;
                    }
                    action = next;
                } else if (action.kind === 'buy-book' || action.kind === 'sell-book' || action.kind === 'buy-pool') {
                    const again = planTake(freshArgs);
                    if (!again.action || again.action.kind !== action.kind) {
                        setStatus('Skipped. The book moved.');
                        return;
                    }
                    action = again.action;
                } else {
                    const freshOrders = await getAccountOrders(user, symbol, true);
                    freshBook.orders = freshOrders;
                    const again = planMake({ ...freshArgs, orders: freshOrders });
                    if (!again.action || again.action.kind !== action.kind) {
                        setStatus('Skipped. The quotes moved.');
                        return;
                    }
                    action = again.action;
                }

                await send(action, freshBook);
            } catch (err) {
                const message = err?.message || 'Bot stopped';
                if (isCancel(message)) {
                    pause('Paused. The signature was cancelled.');
                } else if (isGateWait(message)) {
                    setStatus('Waiting for the next block');
                } else if (isNodeBlip(message)) {
                    pushLog('The node did not answer. Still watching.');
                    setStatus('Watching');
                } else {
                    pause(message);
                    toastRef.current?.error(message);
                }
            } finally {
                busy.current = false;
            }
        };

        const boot = setTimeout(tick, 600);
        const id = setInterval(tick, TICK_MS);
        return () => {
            stop = true;
            clearTimeout(boot);
            clearInterval(id);
        };
    }, [enabled, paused, user, precision, symbol, pause, pushLog]);

    return {
        enabled,
        paused,
        mode,
        settings,
        status,
        live,
        log,
        setMode(next) {
            if (next !== 'take' && next !== 'make') return;
            if (next === modeRef.current) return;
            modeRef.current = next;
            setModeState(next);
            cycle.current = null;
            if (enabled) pushLog('Mode changed. A resting order stays open until it fills or you cancel it.');
        },
        setSettings,
        arm() {
            if (!user) {
                toast.error('Connect your wallet first');
                return;
            }
            if (!pool) {
                toast.error('This token has no SWAP.HIVE pool to follow');
                return;
            }
            setPaused(false);
            setEnabled(true);
            setStatus('Watching');
        },
        stop() {
            setEnabled(false);
            setPaused(false);
            setStatus('Off');
            cycle.current = null;
        },
    };
}
