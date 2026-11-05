import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { HIVE_RPCS, getHiveRpc, setHiveRpc, probeHiveRpc, DEFAULT_HIVE_RPC } from '../api/hive';
import {
    HIVE_ENGINE_RPCS,
    getHiveEngineRpc,
    getSavedHiveEngineRpc,
    setHiveEngineRpc,
    probeHiveEngineRpc,
    normalizeRpc,
    readRpcProbe,
    writeRpcProbe,
    DEFAULT_HIVE_ENGINE_RPC,
} from '../api/hiveEngine';

const SLOW_MS = 1500;
const CONCURRENCY = 3;

function hostOf(url) {
    try { return new URL(url).host; } catch { return url; }
}

function statusLabel(row) {
    if (!row) return 'Not checked';
    if (!row.ok) {
        if (row.error === 'timeout') return 'Timeout';
        if (row.error === 'unreachable') return 'Down';
        return row.error || 'Down';
    }
    if (row.ms >= SLOW_MS) return `${row.ms} ms · slow`;
    return `${row.ms} ms`;
}

function dotClass(row) {
    if (!row) return 'unknown';
    if (!row.ok) return 'down';
    if (row.ms >= SLOW_MS) return 'slow';
    return 'ok';
}

async function checkAll(urls, probe, signal, onOne) {
    const results = {};
    let cursor = 0;
    async function worker() {
        while (cursor < urls.length) {
            if (signal.aborted) return;
            const url = urls[cursor];
            cursor += 1;
            const row = await probe(url, 5000, signal);
            results[normalizeRpc(url)] = row;
            onOne(normalizeRpc(url), row);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()));
    return results;
}

function NodeList({ title, urls, active, results, onPick }) {
    const activeNorm = normalizeRpc(active);
    return (
        <section className="rpc-group">
            <h3>{title}</h3>
            <div className="rpc-list">
                {urls.map((url) => {
                    const key = normalizeRpc(url);
                    const row = results[key];
                    const current = key === activeNorm;
                    return (
                        <div key={key} className={`rpc-row ${current ? 'active' : ''}`}>
                            <span className={`rpc-dot ${dotClass(row)}`} />
                            <span className="rpc-host">
                                <strong>{hostOf(url)}</strong>
                                <span>{statusLabel(row)}</span>
                            </span>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={current}
                                onClick={() => onPick(url)}
                            >
                                {current ? 'In use' : 'Use'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default function RpcSettingsModal({ onClose }) {
    const heRpc = getSavedHiveEngineRpc();
    const hiveRpc = getHiveRpc();
    const liveEngine = getHiveEngineRpc();
    const [customHe, setCustomHe] = useState('');
    const [probe, setProbe] = useState(() => readRpcProbe());
    const [checking, setChecking] = useState(false);
    const [done, setDone] = useState(0);
    const [total, setTotal] = useState(0);
    const checkRef = useRef(null);

    useEffect(() => () => checkRef.current?.abort(), []);

    const heUrls = useMemo(() => {
        const extra = normalizeRpc(heRpc);
        const known = HIVE_ENGINE_RPCS.map(normalizeRpc);
        return known.includes(extra) ? HIVE_ENGINE_RPCS : [heRpc, ...HIVE_ENGINE_RPCS];
    }, [heRpc]);

    const hiveUrls = useMemo(() => {
        const extra = normalizeRpc(hiveRpc);
        const known = HIVE_RPCS.map(normalizeRpc);
        return known.includes(extra) ? HIVE_RPCS : [hiveRpc, ...HIVE_RPCS];
    }, [hiveRpc]);

    const checkedAt = probe.checkedAt
        ? new Date(probe.checkedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : null;

    const runCheck = async () => {
        if (checking) return;
        checkRef.current?.abort();
        const controller = new AbortController();
        checkRef.current = controller;
        const urls = { he: heUrls, hive: hiveUrls };
        const count = urls.he.length + urls.hive.length;
        setChecking(true);
        setDone(0);
        setTotal(count);
        const next = { he: { ...(probe.he || {}) }, hive: { ...(probe.hive || {}) }, checkedAt: Date.now() };
        const bump = (chain, key, row) => {
            if (controller.signal.aborted) return;
            next[chain][key] = row;
            setProbe({ ...next, he: { ...next.he }, hive: { ...next.hive } });
            setDone((n) => n + 1);
        };
        try {
            await checkAll(urls.he, probeHiveEngineRpc, controller.signal, (key, row) => bump('he', key, row));
            if (controller.signal.aborted) return;
            await checkAll(urls.hive, probeHiveRpc, controller.signal, (key, row) => bump('hive', key, row));
            if (!controller.signal.aborted) writeRpcProbe(next);
        } finally {
            if (checkRef.current === controller) setChecking(false);
        }
    };

    const useEngine = (url) => {
        setHiveEngineRpc(url);
        window.location.reload();
    };

    const useHive = (url) => {
        setHiveRpc(url);
        window.location.reload();
    };

    return (
        <Modal title="RPC nodes" onClose={onClose} size="md">
            <p className="rpc-help">
                Pick the node the app uses. Check nodes tests each one once and then stops.
                Nothing is polled in the background.
            </p>
            {normalizeRpc(liveEngine) !== normalizeRpc(heRpc) && (
                <p className="rpc-help">
                    {hostOf(heRpc)} failed recently, so requests are using {hostOf(liveEngine)} for about a minute.
                </p>
            )}
            <div className="rpc-toolbar">
                <button type="button" className="btn btn-secondary btn-sm" onClick={runCheck} disabled={checking}>
                    {checking ? `Checking ${done}/${total}` : 'Check nodes'}
                </button>
                <span>{checkedAt ? `Last check ${checkedAt}` : 'Not checked yet'}</span>
            </div>

            <NodeList
                title="Hive-Engine"
                urls={heUrls}
                active={heRpc}
                results={probe.he || {}}
                onPick={useEngine}
            />
            <form
                className="rpc-custom"
                onSubmit={(e) => {
                    e.preventDefault();
                    const url = customHe.trim();
                    if (url) useEngine(url);
                }}
            >
                <input
                    className="input"
                    type="url"
                    placeholder={DEFAULT_HIVE_ENGINE_RPC}
                    value={customHe}
                    onChange={(e) => setCustomHe(e.target.value)}
                />
                <button type="submit" className="btn btn-ghost btn-sm" disabled={!customHe.trim()}>
                    Use custom
                </button>
            </form>

            <NodeList
                title="Hive"
                urls={hiveUrls}
                active={hiveRpc}
                results={probe.hive || {}}
                onPick={useHive}
            />
            <div className="rpc-toolbar" style={{ marginTop: 8 }}>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                        setHiveEngineRpc(DEFAULT_HIVE_ENGINE_RPC);
                        setHiveRpc(DEFAULT_HIVE_RPC);
                        window.location.reload();
                    }}
                >
                    Reset defaults
                </button>
            </div>
        </Modal>
    );
}
