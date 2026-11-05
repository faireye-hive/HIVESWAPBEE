/**
 * Hive-Engine bills an account that sends more than one contract tx in a block.
 * Six seconds covers the block that includes the broadcast and the one after it.
 */
const BLOCK_GAP_MS = 6000;
const STORAGE_KEY = 'hiveswapbee_he_block';

let inFlight = false;
let lastBlock = 0;
let notBefore = 0;

function restore() {
    if (typeof sessionStorage === 'undefined') return;
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
        lastBlock = Number(saved.lastBlock) || 0;
        notBefore = Number(saved.notBefore) || 0;
    } catch {
        lastBlock = 0;
        notBefore = 0;
    }
}

function persist() {
    if (typeof sessionStorage !== 'undefined') {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ lastBlock, notBefore }));
        } catch {
            /* private mode */
        }
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('hiveswapbee:block-gate'));
}

restore();

export function gateSnapshot(now = Date.now()) {
    const waiting = inFlight || now < notBefore;
    return { inFlight, lastBlock, notBefore, waiting };
}

export function gateBegin() {
    if (inFlight) return false;
    inFlight = true;
    persist();
    return true;
}

export function gateEnd() {
    inFlight = false;
    persist();
}

/** Call with the Hive head block observed after a successful broadcast. */
export function gateNote(headBlock) {
    inFlight = false;
    const head = Number(headBlock) || 0;
    if (head > lastBlock) lastBlock = head;
    notBefore = Date.now() + BLOCK_GAP_MS;
    persist();
}

/**
 * True when the next contract broadcast cannot land in `lastBlock`.
 * A missing head is not enough, unless this account has not broadcast yet.
 */
export function gateReady(headBlock, now = Date.now()) {
    if (inFlight || now < notBefore) return false;
    const head = Number(headBlock) || 0;
    if (!lastBlock) return true;
    if (!head) return false;
    return head > lastBlock;
}
