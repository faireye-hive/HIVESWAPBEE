const store = new Map();

/**
 * Share one in-flight read and reuse the result until `ttlMs` passes.
 * `fresh` skips a stale hit but still joins a read that is already running.
 */
export function cachedRead(key, ttlMs, loader, { fresh = false } = {}) {
    const now = Date.now();
    const hit = store.get(key);
    if (!fresh && hit && hit.data !== undefined && now - hit.at < ttlMs) {
        return Promise.resolve(hit.data);
    }
    if (hit?.promise) return hit.promise;

    const promise = Promise.resolve()
        .then(loader)
        .then((data) => {
            store.set(key, { at: Date.now(), data });
            return data;
        })
        .catch((err) => {
            const cur = store.get(key);
            if (cur?.promise === promise) {
                if (cur.data !== undefined) store.set(key, { at: cur.at, data: cur.data });
                else store.delete(key);
            }
            throw err;
        });

    store.set(key, { at: hit?.at || 0, data: hit?.data, promise });
    return promise;
}

export function writeCache(key, data) {
    store.set(key, { at: Date.now(), data });
}

export function invalidateCache(test) {
    for (const key of [...store.keys()]) {
        if (!test || test(key)) store.delete(key);
    }
}
