import Big from 'big.js';

/** Fallback when marketpools params have not loaded yet. On-chain default is 0.25%. */
export const DEFAULT_FEE_MUL = '0.9975';

const HUBS = ['SWAP.HIVE', 'SWAP.HBD', 'BEE'];

export function floorToPrecision(value, precision) {
    const p = Number.isFinite(Number(precision)) ? Math.max(0, Math.min(8, Number(precision))) : 8;
    try {
        const n = value instanceof Big ? value : new Big(value);
        if (!n.gt(0)) return null;
        const s = n.toFixed(p, Big.roundDown);
        if (!new Big(s).gt(0)) return null;
        return s;
    } catch {
        return null;
    }
}

/** One unit at the token's last decimal, used so rounding cannot trip slippage. */
function oneUnit(precision) {
    const p = Math.max(0, Math.min(8, Number(precision) || 0));
    return new Big(10).pow(-p);
}

export function buildPoolIndex(pools) {
    const index = new Map();
    for (const pool of pools || []) {
        if (!pool?.tokenPair) continue;
        const [a, b] = pool.tokenPair.split(':');
        if (!a || !b) continue;
        index.set(`${a}:${b}`, pool);
        index.set(`${b}:${a}`, pool);
    }
    return index;
}

function liquid(pool) {
    try {
        return new Big(pool.baseQuantity).gt(0) && new Big(pool.quoteQuantity).gt(0);
    } catch {
        return false;
    }
}

export function findRoute(index, from, to) {
    if (!from || !to || from === to) return null;
    const direct = index.get(`${from}:${to}`);
    if (direct && liquid(direct)) return [{ pool: direct, from, to }];

    for (const hub of HUBS) {
        if (hub === from || hub === to) continue;
        const first = index.get(`${from}:${hub}`);
        const second = index.get(`${hub}:${to}`);
        if (first && second && liquid(first) && liquid(second)) {
            return [
                { pool: first, from, to: hub },
                { pool: second, from: hub, to },
            ];
        }
    }
    return null;
}

export function reservesFor(pool, tokenIn) {
    const [base, quote] = pool.tokenPair.split(':');
    if (tokenIn === base) {
        return { reserveIn: pool.baseQuantity, reserveOut: pool.quoteQuantity, tokenOut: quote };
    }
    if (tokenIn === quote) {
        return { reserveIn: pool.quoteQuantity, reserveOut: pool.baseQuantity, tokenOut: base };
    }
    return null;
}

/**
 * Exact-input quote. Fee is taken from the input, matching Hive-Engine
 * marketpools `tradeFeeMul` (0.9975 = 0.25% fee).
 */
export function quoteExactIn(amountIn, reserveIn, reserveOut, feeMul = DEFAULT_FEE_MUL) {
    try {
        const amt = new Big(amountIn);
        const rin = new Big(reserveIn);
        const rout = new Big(reserveOut);
        const fee = new Big(feeMul);
        if (!amt.gt(0) || !rin.gt(0) || !rout.gt(0) || !fee.gt(0) || fee.gt(1)) return null;
        const inWithFee = amt.times(fee);
        const out = inWithFee.times(rout).div(rin.plus(inWithFee));
        if (!out.gt(0) || !out.lt(rout)) return null;
        return out;
    } catch {
        return null;
    }
}

/**
 * Optimistic quote for display, plus the custom_json steps to broadcast.
 * Multi-hop swaps run in one transaction, so the bridge hop only keeps a
 * small buffer. The user's slippage protects the final amount.
 */
export function buildSwap({ route, amountIn, slippagePct, feeMul, precisionOf }) {
    if (!route?.length) return null;
    const fee = feeMul || DEFAULT_FEE_MUL;
    let cursor = amountIn;
    const optimistic = [];

    for (const hop of route) {
        const side = reservesFor(hop.pool, hop.from);
        if (!side) return null;
        const raw = quoteExactIn(cursor, side.reserveIn, side.reserveOut, fee);
        const precOut = precisionOf(hop.to);
        const precIn = precisionOf(hop.from);
        if (raw == null || precOut == null || precIn == null) return null;
        const amountOut = floorToPrecision(raw, precOut);
        const sentIn = floorToPrecision(cursor, precIn);
        if (!amountOut || !sentIn) return null;
        optimistic.push({
            tokenPair: hop.pool.tokenPair,
            from: hop.from,
            to: hop.to,
            amountIn: sentIn,
            amountOut,
            reserveIn: side.reserveIn,
            reserveOut: side.reserveOut,
            spot: new Big(side.reserveOut).div(side.reserveIn),
        });
        cursor = amountOut;
    }

    const slip = new Big(Number.isFinite(Number(slippagePct)) ? slippagePct : 1).div(100);
    if (slip.lt(0) || slip.gte(0.5)) return null;

    // On a 2-hop route the bridge output must be known before the second hop.
    // A 0.30% buffer (or half the slippage, whichever is smaller) covers
    // same-block reserve drift. The rest of the slippage stays on the last hop.
    const halfSlip = slip.div(2);
    const bridgeBuf = route.length > 1
        ? (halfSlip.lt('0.003') ? halfSlip : new Big('0.003'))
        : new Big(0);

    const ops = [];
    cursor = amountIn;
    for (let i = 0; i < route.length; i += 1) {
        const hop = route[i];
        const side = reservesFor(hop.pool, hop.from);
        const raw = quoteExactIn(cursor, side.reserveIn, side.reserveOut, fee);
        const precIn = precisionOf(hop.from);
        const precOut = precisionOf(hop.to);
        const tokenAmount = floorToPrecision(cursor, precIn);
        if (!tokenAmount || raw == null) return null;

        const isLast = i === route.length - 1;
        const keep = new Big(1).minus(isLast ? slip : bridgeBuf);
        let minRaw = raw.times(keep);
        // Drop 1 unit so ROUND_DOWN inside the contract cannot exceed minAmountOut.
        const buffered = minRaw.minus(oneUnit(precOut));
        if (buffered.gt(0)) minRaw = buffered;
        const minAmountOut = floorToPrecision(minRaw, precOut);
        if (!minAmountOut) return null;

        ops.push({
            tokenPair: hop.pool.tokenPair,
            tokenSymbol: hop.from,
            tokenAmount,
            tradeType: 'exactInput',
            minAmountOut,
        });
        cursor = isLast ? cursor : minAmountOut;
    }

    const amountOut = optimistic[optimistic.length - 1].amountOut;
    const spot = optimistic.reduce((acc, step) => acc.times(step.spot), new Big(1));
    const ideal = new Big(amountIn).times(spot).times(new Big(fee).pow(route.length));
    let priceImpact = 0;
    if (ideal.gt(0)) {
        priceImpact = Math.max(0, ideal.minus(amountOut).div(ideal).times(100).toNumber());
    }

    const feePct = new Big(1).minus(fee).times(100).times(route.length).toNumber();

    return {
        steps: optimistic,
        ops,
        amountOut,
        minReceived: ops[ops.length - 1].minAmountOut,
        priceImpact,
        feePct,
        rate: new Big(amountOut).div(amountIn).toString(),
    };
}
