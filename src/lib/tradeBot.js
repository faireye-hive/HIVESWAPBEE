import Big from 'big.js';
import { floorToPrecision, quoteExactIn, DEFAULT_FEE_MUL } from './swapQuote.js';

const DUST_HIVE = '0.05';
const MAX_POOL_IMPACT = 0.08;

export function hivePerToken(pool, symbol) {
    if (!pool?.tokenPair || !symbol) return null;
    const [base, quote] = pool.tokenPair.split(':');
    try {
        const baseQty = new Big(pool.baseQuantity);
        const quoteQty = new Big(pool.quoteQuantity);
        if (!baseQty.gt(0) || !quoteQty.gt(0)) return null;
        if (base === 'SWAP.HIVE' && quote === symbol) return baseQty.div(quoteQty);
        if (quote === 'SWAP.HIVE' && base === symbol) return quoteQty.div(baseQty);
        return null;
    } catch {
        return null;
    }
}

function poolReserves(pool, symbol) {
    const [base, quote] = pool.tokenPair.split(':');
    if (base === 'SWAP.HIVE' && quote === symbol) {
        return { hive: pool.baseQuantity, token: pool.quoteQuantity };
    }
    if (quote === 'SWAP.HIVE' && base === symbol) {
        return { hive: pool.quoteQuantity, token: pool.baseQuantity };
    }
    return null;
}

function sellTokensToPool(pool, symbol, qty, feeMul) {
    const reserves = poolReserves(pool, symbol);
    if (!reserves) return null;
    return quoteExactIn(qty, reserves.token, reserves.hive, feeMul);
}

/** SWAP.HIVE required to buy `qty` tokens from the pool, including the fee. */
export function hiveToBuyTokens(pool, symbol, qty, feeMul = DEFAULT_FEE_MUL) {
    const reserves = poolReserves(pool, symbol);
    if (!reserves) return null;
    try {
        const out = new Big(qty);
        const tokenReserve = new Big(reserves.token);
        const hiveReserve = new Big(reserves.hive);
        const fee = new Big(feeMul);
        if (!out.gt(0) || !tokenReserve.gt(out) || !fee.gt(0)) return null;
        const hive = out.times(hiveReserve).div(fee.times(tokenReserve.minus(out)));
        if (!hive.gt(0) || !hive.lt(hiveReserve)) return null;
        return hive;
    } catch {
        return null;
    }
}

function impactTooHigh(fairHive, actualHive) {
    try {
        const fair = new Big(fairHive);
        const actual = new Big(actualHive);
        if (!fair.gt(0)) return true;
        const impact = fair.minus(actual).abs().div(fair);
        return impact.gt(MAX_POOL_IMPACT);
    } catch {
        return true;
    }
}

function sortBook(rows, side) {
    return (rows || [])
        .filter((row) => row && parseFloat(row.price) > 0 && parseFloat(row.quantity) > 0)
        .slice()
        .sort((a, b) => (side === 'ask'
            ? parseFloat(a.price) - parseFloat(b.price)
            : parseFloat(b.price) - parseFloat(a.price)));
}

function foreign(rows, account) {
    if (!account) return rows;
    return rows.filter((row) => row.account !== account);
}

function capQty(qty, maxHive, price, balanceHive, balanceToken, side) {
    let next = qty;
    const maxByHive = new Big(maxHive).div(price);
    if (next.gt(maxByHive)) next = maxByHive;
    if (side === 'buy') {
        const affordable = new Big(balanceHive || 0).div(price);
        if (next.gt(affordable)) next = affordable;
    } else {
        const held = new Big(balanceToken || 0);
        if (next.gt(held)) next = held;
    }
    return next;
}

/**
 * Take a resting order when the pool pays the other side of the round trip.
 * The returned action is only the first transaction. The hedge waits a block.
 */
export function planTake({
    asks,
    bids,
    pool,
    symbol,
    account,
    feeMul = DEFAULT_FEE_MUL,
    tokenPrecision = 8,
    hiveBalance = '0',
    tokenBalance = '0',
    maxHive = '5',
    minProfitPct = 0.8,
}) {
    const spot = hivePerToken(pool, symbol);
    if (!spot) return { action: null, spot: null, reason: 'This token has no SWAP.HIVE pool.' };

    const bestAsk = foreign(sortBook(asks, 'ask'), account)[0];
    const bestBid = foreign(sortBook(bids, 'bid'), account)[0];
    const ideas = [];

    if (bestAsk) {
        const price = new Big(bestAsk.price);
        let qty = capQty(new Big(bestAsk.quantity), maxHive, price, hiveBalance, tokenBalance, 'buy');
        const qtyStr = floorToPrecision(qty, tokenPrecision);
        if (qtyStr) {
            const spend = new Big(qtyStr).times(price);
            const hiveOut = sellTokensToPool(pool, symbol, qtyStr, feeMul);
            if (hiveOut && spend.gte(DUST_HIVE) && !impactTooHigh(new Big(qtyStr).times(spot), hiveOut)) {
                const profit = hiveOut.minus(spend);
                const pct = profit.div(spend).times(100);
                if (pct.gte(minProfitPct)) {
                    ideas.push({
                        kind: 'buy-book',
                        hedge: 'sell-pool',
                        price: floorToPrecision(price, 8),
                        quantity: qtyStr,
                        profitPct: pct.toNumber(),
                        label: `Buy ${qtyStr} ${symbol} at ${floorToPrecision(price, 8)}. The pool pays about ${pct.toFixed(2)}% more.`,
                    });
                }
            }
        }
    }

    if (bestBid) {
        const price = new Big(bestBid.price);
        const held = new Big(tokenBalance || 0);
        let qty = new Big(bestBid.quantity);
        const maxQty = new Big(maxHive).div(price);
        if (qty.gt(maxQty)) qty = maxQty;
        if (held.gt(0)) {
            if (qty.gt(held)) qty = held;
        } else {
            const budget = new Big(hiveBalance || 0).lt(maxHive) ? new Big(hiveBalance || 0) : new Big(maxHive);
            let guess = budget.div(price);
            qty = new Big(0);
            for (let attempt = 0; attempt < 6; attempt += 1) {
                const guessStr = floorToPrecision(guess, tokenPrecision);
                if (!guessStr) break;
                const costGuess = hiveToBuyTokens(pool, symbol, guessStr, feeMul);
                if (costGuess && costGuess.lte(budget)) {
                    qty = new Big(guessStr);
                    break;
                }
                guess = guess.times('0.8');
            }
        }
        const qtyStr = floorToPrecision(qty, tokenPrecision);
        if (qtyStr) {
            const revenue = new Big(qtyStr).times(price);
            const cost = hiveToBuyTokens(pool, symbol, qtyStr, feeMul);
            if (cost && revenue.gte(DUST_HIVE) && !impactTooHigh(new Big(qtyStr).times(spot), cost)) {
                const profit = revenue.minus(cost);
                const pct = profit.div(cost).times(100);
                if (pct.gte(minProfitPct)) {
                    const haveTokens = held.gte(qtyStr);
                    ideas.push({
                        kind: haveTokens ? 'sell-book' : 'buy-pool',
                        hedge: haveTokens ? 'buy-pool' : 'sell-book',
                        price: floorToPrecision(price, 8),
                        quantity: qtyStr,
                        profitPct: pct.toNumber(),
                        label: haveTokens
                            ? `Sell ${qtyStr} ${symbol} at ${floorToPrecision(price, 8)}. The pool is about ${pct.toFixed(2)}% cheaper.`
                            : `Buy ${qtyStr} ${symbol} from the pool, then sell the bid. About ${pct.toFixed(2)}% after the fee.`,
                    });
                }
            }
        }
    }

    ideas.sort((a, b) => b.profitPct - a.profitPct);
    const best = ideas[0];
    if (!best) {
        return {
            action: null,
            spot,
            reason: 'No book order beats the pool by the minimum profit.',
        };
    }
    return { action: best, spot, reason: best.label };
}

/** Re-check a queued hedge against the pool before spending the next block. */
export function hedgeStillPays({
    pool,
    symbol,
    kind,
    quantity,
    price,
    feeMul = DEFAULT_FEE_MUL,
    minProfitPct = 0.8,
}) {
    try {
        const qty = new Big(quantity);
        const px = new Big(price);
        if (kind === 'sell-pool') {
            const out = sellTokensToPool(pool, symbol, quantity, feeMul);
            if (!out) return false;
            return out.minus(qty.times(px)).div(qty.times(px)).times(100).gte(minProfitPct);
        }
        if (kind === 'buy-pool' || kind === 'sell-book') {
            const cost = hiveToBuyTokens(pool, symbol, quantity, feeMul);
            if (!cost) return false;
            return qty.times(px).minus(cost).div(cost).times(100).gte(minProfitPct);
        }
        return false;
    } catch {
        return false;
    }
}

/** A bid that can take `quantity` at or above `minPrice`, ignoring our own orders. */
export function matchingBid({ bids, account, minPrice, quantity, tokenPrecision = 8 }) {
    const rows = foreign(sortBook(bids, 'bid'), account);
    try {
        const need = new Big(quantity);
        const floor = new Big(minPrice);
        for (const row of rows) {
            const price = new Big(row.price);
            if (price.lt(floor)) return null;
            const level = new Big(row.quantity);
            if (!level.gt(0)) continue;
            const take = need.lt(level) ? need : level;
            const qtyStr = floorToPrecision(take, tokenPrecision);
            const priceStr = floorToPrecision(price, 8);
            if (qtyStr && priceStr) return { price: priceStr, quantity: qtyStr };
        }
    } catch {
        return null;
    }
    return null;
}

function drifted(order, target, repricePct) {
    try {
        const diff = new Big(order.price).minus(target).abs().div(target).times(100);
        return diff.gt(repricePct);
    } catch {
        return true;
    }
}

/**
 * Quote one side around the pool. A replace is a cancel now and a new
 * order on a later block, so this never returns two actions.
 */
export function planMake({
    asks,
    bids,
    pool,
    symbol,
    account,
    orders = { buys: [], sells: [] },
    botIds = [],
    tokenPrecision = 8,
    hiveBalance = '0',
    tokenBalance = '0',
    maxHive = '5',
    spreadPct = 1.5,
    repricePct = 0.4,
}) {
    const spot = hivePerToken(pool, symbol);
    if (!spot) return { action: null, spot: null, reason: 'This token has no SWAP.HIVE pool.' };

    const half = new Big(spreadPct).div(200);
    let bidPx = spot.times(new Big(1).minus(half));
    let askPx = spot.times(new Big(1).plus(half));
    const bestAsk = foreign(sortBook(asks, 'ask'), account)[0];
    const bestBid = foreign(sortBook(bids, 'bid'), account)[0];
    if (bestAsk && bidPx.gte(bestAsk.price)) bidPx = new Big(bestAsk.price).times('0.999');
    if (bestBid && askPx.lte(bestBid.price)) askPx = new Big(bestBid.price).times('1.001');
    const bidPrice = floorToPrecision(bidPx, 8);
    const askPrice = floorToPrecision(askPx, 8);
    if (!bidPrice || !askPrice || new Big(bidPrice).gte(askPrice)) {
        return { action: null, spot, reason: 'The book is too tight to quote around the pool.' };
    }

    const ids = new Set(botIds);
    const botBid = (orders.buys || []).find((order) => ids.has(order.txId));
    const botAsk = (orders.sells || []).find((order) => ids.has(order.txId));
    const userBid = (orders.buys || []).find((order) => !ids.has(order.txId));
    const userAsk = (orders.sells || []).find((order) => !ids.has(order.txId));

    if (botBid && drifted(botBid, bidPrice, repricePct)) {
        return {
            action: { kind: 'cancel-bid', id: botBid.txId, price: bidPrice },
            spot,
            reason: 'Cancel the bid. The pool moved.',
        };
    }
    if (botAsk && drifted(botAsk, askPrice, repricePct)) {
        return {
            action: { kind: 'cancel-ask', id: botAsk.txId, price: askPrice },
            spot,
            reason: 'Cancel the ask. The pool moved.',
        };
    }

    const hive = new Big(hiveBalance || 0);
    const tokens = new Big(tokenBalance || 0);
    const tokenValue = tokens.times(spot);
    const preferBid = hive.gte(tokenValue);
    const sides = preferBid ? ['bid', 'ask'] : ['ask', 'bid'];
    let blocked = null;

    for (const side of sides) {
        if (side === 'bid' && !botBid) {
            if (userBid) {
                blocked = 'A bid you placed is already open, so that side stays yours.';
                continue;
            }
            let spend = hive.lt(maxHive) ? hive : new Big(maxHive);
            spend = spend.times('0.98');
            const qty = floorToPrecision(spend.div(bidPrice), tokenPrecision);
            if (!qty || spend.lt(DUST_HIVE)) continue;
            if (bestAsk && new Big(bidPrice).gte(bestAsk.price)) continue;
            return {
                action: { kind: 'place-bid', price: bidPrice, quantity: qty },
                spot,
                bidPrice,
                askPrice,
                reason: `Bid ${qty} ${symbol} at ${bidPrice}, under the pool.`,
            };
        }
        if (side === 'ask' && !botAsk) {
            if (userAsk) {
                blocked = 'An offer you placed is already open, so that side stays yours.';
                continue;
            }
            const cap = new Big(maxHive).div(askPrice);
            let qty = tokens.lt(cap) ? tokens.times('0.98') : cap;
            const qtyStr = floorToPrecision(qty, tokenPrecision);
            if (!qtyStr) continue;
            if (bestBid && new Big(askPrice).lte(bestBid.price)) continue;
            return {
                action: { kind: 'place-ask', price: askPrice, quantity: qtyStr },
                spot,
                bidPrice,
                askPrice,
                reason: `Offer ${qtyStr} ${symbol} at ${askPrice}, above the pool.`,
            };
        }
    }

    return {
        action: null,
        spot,
        bidPrice,
        askPrice,
        reason: blocked || 'Quotes are already near the pool.',
    };
}
