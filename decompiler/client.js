// Client-side wrapper around the decompiler worker. Hides the
// request/reply correlation so callers can write `await client.decompile(...)`
// instead of bookkeeping their own message ids.

export class DecompilerClient {
    constructor(workerUrl) {
        this.worker = new Worker(workerUrl, { type: 'module' });
        this.nextId = 1;
        this.pending = new Map(); // id → {resolve, reject}
        this.worker.addEventListener('message', (ev) => {
            const { id, ok, error, ...result } = ev.data;
            const p = this.pending.get(id);
            if (!p) return;
            this.pending.delete(id);
            if (ok) p.resolve(result);
            else p.reject(new Error(error));
        });
        this.worker.addEventListener('error', (ev) => {
            // Fatal worker error: reject everything pending so callers
            // don't hang forever.
            const err = new Error(ev.message || 'worker error');
            for (const p of this.pending.values()) p.reject(err);
            this.pending.clear();
        });
    }

    _send(cmd, args) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, cmd, ...args });
        });
    }

    /**
     * Mount the spec files for one processor. `arch` is the manifest's
     * top-level processor directory ("x86", "AARCH64", "ARM", "MIPS",
     * "PowerPC"); only that subset is materialised in the worker's
     * lazy FS, keeping initial load to one architecture instead of all
     * five. Safe to call repeatedly — the worker tracks which archs
     * are mounted and skips work it already did.
     */
    init({ specBaseUrl, manifestUrl, arch }) {
        return this._send('init', { specBaseUrl, manifestUrl, arch });
    }

    /**
     * Create a decompiler session bound to an architecture and a binary.
     *
     *   languageId: SLEIGH id with compiler suffix, e.g. "x86:LE:64:default:gcc"
     *   regions:    [{vaddr, bytes}, ...] — one entry per loadable
     *               segment of the binary. Pass each segment at its
     *               actual virtual address so non-contiguous Mach-O
     *               layouts and ELFs whose entry isn't on the first
     *               PT_LOAD page resolve correctly.
     *   symbols:    [[address, name], ...]
     *   readonly:   [[address, size], ...]
     *   strings:    [[address, length], ...] — printable C strings
     *               registered as `char[length]` symbols so the
     *               decompiler renders pointer loads to those
     *               addresses as string literals.
     */
    async open({ languageId, regions, symbols, readonly, strings }) {
        const { sessionId } = await this._send('open', {
            languageId,
            regions,
            symbols,
            readonly,
            strings,
        });
        return new DecompilerSession(this, sessionId);
    }

    terminate() {
        this.worker.terminate();
        for (const p of this.pending.values()) {
            p.reject(new Error('client terminated'));
        }
        this.pending.clear();
    }
}

export class DecompilerSession {
    constructor(client, sessionId) {
        this.client = client;
        this.sessionId = sessionId;
        this.closed = false;
    }

    async decompile(address, name = '') {
        if (this.closed) throw new Error('session closed');
        const { code } = await this.client._send('decompile', {
            sessionId: this.sessionId,
            address,
            name,
        });
        return code;
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        await this.client._send('close', { sessionId: this.sessionId });
    }
}
