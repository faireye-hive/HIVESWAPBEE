import { useCallback, useEffect, useState } from 'react';
import { getHeadBlock } from '../api/hive.js';
import { invalidateMarketReads } from '../api/hiveEngine.js';
import { gateBegin, gateEnd, gateNote, gateReady, gateSnapshot } from '../lib/blockGate.js';

export function useBlockGate() {
    const [snap, setSnap] = useState(gateSnapshot);
    useEffect(() => {
        const sync = () => setSnap(gateSnapshot());
        window.addEventListener('hiveswapbee:block-gate', sync);
        return () => window.removeEventListener('hiveswapbee:block-gate', sync);
    }, []);
    useEffect(() => {
        if (!snap.waiting) return undefined;
        const id = setInterval(() => setSnap(gateSnapshot()), 500);
        return () => clearInterval(id);
    }, [snap.waiting]);
    return snap;
}

/** One Hive-Engine broadcast, and then no other until the next Hive block. */
export function useEngineTx() {
    const gate = useBlockGate();

    const run = useCallback(async (work) => {
        if (gateSnapshot().inFlight) {
            throw new Error('A transaction is already waiting for Keychain.');
        }
        const head = await getHeadBlock();
        if (!gateReady(head)) {
            throw new Error('Wait for the next Hive block. A second transaction in the same block pays an extra fee.');
        }
        if (!gateBegin()) {
            throw new Error('A transaction is already waiting for Keychain.');
        }
        try {
            await work();
            gateNote(await getHeadBlock(true));
            invalidateMarketReads();
        } catch (err) {
            gateEnd();
            throw err;
        }
    }, []);

    return { gate, run };
}
