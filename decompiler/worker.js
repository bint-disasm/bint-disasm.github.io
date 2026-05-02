// Web Worker that owns the Ghidra decompiler wasm module.
//
// Spec files are registered as Emscripten LazyFile entries: the module's
// virtual FS knows the file exists and its size, but the bytes are only
// fetched (synchronous XHR, fine in a worker) when the decompiler actually
// opens the file. That's what makes shipping all of x86/ARM/MIPS/PowerPC
// tolerable — most users only pay for the one arch they decompile.
//
// The main thread talks to this worker via postMessage. Every request
// carries an `id` so the main side can correlate replies:
//
//   → { id, cmd: "init",      specBaseUrl, manifestUrl }
//   ← { id, ok, error? }
//
//   → { id, cmd: "open",      regions[{vaddr, bytes}], languageId, symbols[], readonly[] }
//   ← { id, ok, sessionId?, error? }
//
//   → { id, cmd: "decompile", sessionId, address, name }
//   ← { id, ok, code?, error? }
//
//   → { id, cmd: "close",     sessionId }
//   ← { id, ok }

import BintDecompilerModule from './dist/bint_decompiler.js';

let mod = null;             // the loaded emscripten module
let api = null;             // cwrapped C API
const sessions = new Map(); // sessionId → wasm handle pointer
let nextSession = 1;

function bindApi(m) {
    return {
        add_spec_dir: m.cwrap('bint_decompiler_add_spec_dir', 'number', ['string']),
        create:       m.cwrap('bint_decompiler_create',       'number', ['string']),
        add_region:   m.cwrap('bint_decompiler_add_region',   'number', ['number', 'bigint', 'number', 'number']),
        add_symbol:   m.cwrap('bint_decompiler_add_symbol',   'number', ['number', 'bigint', 'string']),
        add_string:   m.cwrap('bint_decompiler_add_string',   'number', ['number', 'bigint', 'bigint']),
        add_readonly: m.cwrap('bint_decompiler_add_readonly', 'number', ['number', 'bigint', 'bigint']),
        decompile:    m.cwrap('bint_decompiler_decompile',    'number', ['number', 'bigint', 'string']),
        free_string:  m.cwrap('bint_decompiler_free_string',  null,     ['number']),
        destroy:      m.cwrap('bint_decompiler_destroy',      null,     ['number']),
    };
}

// Walk a relative path like "x86/data/languages/x86-64.sla", create any
// missing directory components under `/spec/`, then register the file as
// a lazy entry pointing at `baseUrl + path`. LazyFile fetches bytes on
// first access via synchronous XHR (worker-safe).
function mountLazyFile(FS, relPath, size, url) {
    const parts = relPath.split('/');
    let cur = '/spec';
    for (let i = 0; i < parts.length - 1; i++) {
        cur += '/' + parts[i];
        try { FS.mkdir(cur); } catch (e) { /* EEXIST */ }
    }
    const fileName = parts[parts.length - 1];
    // createLazyFile(parent, name, url, canRead, canWrite)
    FS.createLazyFile(cur, fileName, url, /* canRead */ true, /* canWrite */ false);
    // Emscripten knows the size after first access, but we can hint it
    // so its initial stat() doesn't need a HEAD request. Not critical.
}

async function doInit({ specBaseUrl, manifestUrl }) {
    if (mod) return; // idempotent
    mod = await BintDecompilerModule();
    api = bindApi(mod);

    const manifest = await (await fetch(manifestUrl)).json();

    // Root dir
    try { mod.FS.mkdir('/spec'); } catch (e) {}

    // One LazyFile per manifest entry.
    const dirs = new Set();
    for (const entry of manifest.files) {
        mountLazyFile(mod.FS, entry.path, entry.size, specBaseUrl + entry.path);
        // Collect each file's parent dir; we'll tell the decompiler about
        // the language dirs after the FS is populated.
        const parts = entry.path.split('/');
        if (parts[parts.length - 2] === 'languages') {
            dirs.add('/spec/' + parts.slice(0, -1).join('/'));
        }
    }
    for (const dir of dirs) {
        if (api.add_spec_dir(dir) !== 0) {
            throw new Error(`add_spec_dir(${dir}) failed`);
        }
    }
}

function doOpen({ regions, languageId, symbols, readonly, strings }) {
    if (!mod) throw new Error('worker not initialized');
    if (!Array.isArray(regions) || regions.length === 0) {
        throw new Error('open requires at least one memory region');
    }
    const handle = api.create(languageId);
    if (!handle) throw new Error('decompiler create failed');
    // Each region is staged into wasm memory, copied into a C++-owned
    // buffer by add_region, then freed. Doing this one region at a time
    // keeps peak heap usage bounded by the largest segment.
    for (const region of regions) {
        const bytesU8 = region.bytes instanceof Uint8Array
            ? region.bytes
            : new Uint8Array(region.bytes);
        if (bytesU8.length === 0) continue;
        const ptr = mod._malloc(bytesU8.length);
        mod.HEAPU8.set(bytesU8, ptr);
        api.add_region(handle, BigInt(region.vaddr), ptr, bytesU8.length);
        mod._free(ptr);
    }
    for (const [addr, name] of (symbols || [])) {
        api.add_symbol(handle, BigInt(addr), name);
    }
    for (const [addr, size] of (readonly || [])) {
        api.add_readonly(handle, BigInt(addr), BigInt(size));
    }
    // Detected printable strings → typed `char[len]` symbols, so the
    // decompiler renders constant references as string literals.
    for (const [addr, len] of (strings || [])) {
        api.add_string(handle, BigInt(addr), BigInt(len));
    }
    const id = nextSession++;
    sessions.set(id, handle);
    return id;
}

function doDecompile({ sessionId, address, name }) {
    const handle = sessions.get(sessionId);
    if (!handle) throw new Error(`unknown sessionId ${sessionId}`);
    const cstr = api.decompile(handle, BigInt(address), name || '');
    if (!cstr) throw new Error('decompile returned null');
    const code = mod.UTF8ToString(cstr);
    api.free_string(cstr);
    return code;
}

function doClose({ sessionId }) {
    const handle = sessions.get(sessionId);
    if (handle) {
        api.destroy(handle);
        sessions.delete(sessionId);
    }
}

self.addEventListener('message', async (ev) => {
    const { id, cmd, ...args } = ev.data;
    try {
        let result = {};
        switch (cmd) {
            case 'init':      await doInit(args); break;
            case 'open':      result = { sessionId: doOpen(args) }; break;
            case 'decompile': result = { code: doDecompile(args) }; break;
            case 'close':     doClose(args); break;
            default: throw new Error(`unknown cmd: ${cmd}`);
        }
        self.postMessage({ id, ok: true, ...result });
    } catch (err) {
        self.postMessage({ id, ok: false, error: err.message || String(err) });
    }
});
