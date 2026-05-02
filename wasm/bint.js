let wasm;

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedBigUint64ArrayMemory0 = null;
function getBigUint64ArrayMemory0() {
    if (cachedBigUint64ArrayMemory0 === null || cachedBigUint64ArrayMemory0.byteLength === 0) {
        cachedBigUint64ArrayMemory0 = new BigUint64Array(wasm.memory.buffer);
    }
    return cachedBigUint64ArrayMemory0;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getBigUint64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

let WASM_VECTOR_LEN = 0;

const WebSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_websession_free(ptr >>> 0, 1));

/**
 * A bint session exposed to JavaScript.
 *
 * This wraps the native Session type and provides a JavaScript-friendly API.
 * The primary interface is through `execute()` which runs bint commands.
 */
export class WebSession {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebSessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_websession_free(ptr, 0);
    }
    /**
     * Select an emulation state by index. Returns `EmuSelectOutput`.
     * @param {number} index
     * @returns {any}
     */
    emu_select(index) {
        const ret = wasm.websession_emu_select(this.__wbg_ptr, index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * List all live emulation states (PC + halt status), with the
     * active index. Drives the Emulation tab's state dropdown.
     * @returns {any}
     */
    emu_states() {
        const ret = wasm.websession_emu_states(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Create a named symbolic variable of the given bit-width — the
     * "New Symbol" modal calls this then follows up with `emu_set`
     * to write it into a register or memory address.
     * @param {string} name
     * @param {number} bits
     * @returns {any}
     */
    emu_symbol(name, bits) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.websession_emu_symbol(this.__wbg_ptr, ptr0, len0, bits);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Returns whether a binary is loaded.
     *
     * This is a convenience method to avoid parsing command output
     * for a simple boolean check.
     * @returns {boolean}
     */
    has_binary() {
        const ret = wasm.websession_has_binary(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Lists xrefs originating at `address`.
     * @param {bigint} address
     * @returns {any}
     */
    xrefs_from(address) {
        const ret = wasm.websession_xrefs_from(this.__wbg_ptr, address);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Whole-binary recursive-descent analysis. Records discovered
     * functions and xrefs into the session database.
     * @returns {any}
     */
    analyze_all() {
        const ret = wasm.websession_analyze_all(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Disassembles starting at `address`. If `count` is provided,
     * decodes that many instructions linearly; if `None` and the
     * address is inside a known function, the whole function is
     * emitted with block labels and separators.
     * @param {bigint} address
     * @param {number | null} [count]
     * @returns {any}
     */
    disassemble(address, count) {
        const ret = wasm.websession_disassemble(this.__wbg_ptr, address, isLikeNone(count) ? 0x100000001 : (count) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Loads a binary from raw bytes.
     *
     * This is WASM-specific since browsers can't access the filesystem.
     * The equivalent for HTTP backends would be uploading the file.
     *
     * # Arguments
     *
     * * `data` - The raw binary data as a Uint8Array
     * * `filename` - A display name for the binary
     *
     * # Returns
     *
     * JSON output from `info general /j` command on success, or throws on error.
     * @param {Uint8Array} data
     * @param {string} filename
     * @returns {string}
     */
    load_binary(data, filename) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.websession_load_binary(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Rename an existing name by id.
     * @param {bigint} id
     * @param {string} new_name
     * @returns {any}
     */
    name_rename(id, new_name) {
        const ptr0 = passStringToWasm0(new_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.websession_name_rename(this.__wbg_ptr, id, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Sets `name` to `value`. Same parsing as `e <name>=<value>` —
     * bools accept `true|false|on|off|yes|no|1|0`, ints accept
     * decimal or `0x` hex.
     * @param {string} name
     * @param {string} value
     * @returns {any}
     */
    options_set(name, value) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.websession_options_set(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Binary metadata (format, architecture, entry point, sizes, …).
     * Returned at file-load time too via `load_binary`, but exposed
     * here so the frontend can refresh after option changes etc.
     * @returns {any}
     */
    info_general() {
        const ret = wasm.websession_info_general(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Strings discovered in readable sections (printable ASCII runs of
     * length >= `min_length`).
     * @param {number} min_length
     * @returns {any}
     */
    info_strings(min_length) {
        const ret = wasm.websession_info_strings(this.__wbg_ptr, min_length);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Flush pending COW memory writes back into the underlying file.
     * @returns {any}
     */
    memory_apply() {
        const ret = wasm.websession_memory_apply(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Write `bytes` at `address` into the COW memory layer (does not
     * touch the underlying file until `memory_apply` flushes).
     * @param {bigint} address
     * @param {Uint8Array} bytes
     * @returns {any}
     */
    memory_write(address, bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.websession_memory_write(this.__wbg_ptr, address, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Lists every configurable option with its current value, type
     * tag, and description. Drives the web Options modal.
     * @returns {any}
     */
    options_list() {
        const ret = wasm.websession_options_list(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Step forward in seek history.
     * @returns {any}
     */
    seek_forward() {
        const ret = wasm.websession_seek_forward(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Full seek history (with current index) for nav button state.
     * @returns {any}
     */
    seek_history() {
        const ret = wasm.websession_seek_history(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Snapshot the active state's general registers. `include_temporaries`
     * pulls in SLEIGH temporaries (off by default for display).
     * @param {boolean} include_temporaries
     * @returns {any}
     */
    emu_registers(include_temporaries) {
        const ret = wasm.websession_emu_registers(this.__wbg_ptr, include_temporaries);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Loadable segments / sections — name, virtual address, size,
     * permissions string. Used by the decompile panel to populate its
     * load image and pick readonly ranges for string rendering.
     * @returns {any}
     */
    info_sections() {
        const ret = wasm.websession_info_sections(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Snapshot the active path's accumulated boolean constraints as
     * an SMT-LIB 2 script. Drives the Emulation panel's constraints
     * viewer.
     * @returns {any}
     */
    emu_constraints() {
        const ret = wasm.websession_emu_constraints(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Analyses the function at `address` and returns its
     * `FunctionOutput` (entry, blocks with edge kinds, calls, …).
     * Records the function in the names DB as a side effect — same
     * behaviour as the `analyze function` command.
     * @param {bigint} address
     * @returns {any}
     */
    analyze_function(address) {
        const ret = wasm.websession_analyze_function(this.__wbg_ptr, address);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Loads a pre-compiled SLEIGH specification from bytes.
     *
     * This is WASM-specific since the SLEIGH specs need to be fetched
     * from URLs and loaded into memory. Native builds compile specs on demand.
     *
     * # Arguments
     *
     * * `arch_id` - The architecture identifier (e.g., "x86:LE:64:default")
     * * `data` - The serialized SLEIGH data as a Uint8Array
     *
     * # Returns
     *
     * `true` on success, throws on error.
     * @param {string} arch_id
     * @param {Uint8Array} data
     * @returns {boolean}
     */
    load_sleigh_spec(arch_id, data) {
        const ptr0 = passStringToWasm0(arch_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.websession_load_sleigh_spec(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * SLEIGH language id for the loaded binary's architecture +
     * endianness + word size (e.g. `"MIPS:LE:32:default"`). Returns
     * `None` until `load_binary` has run. The web frontend uses this
     * to fetch the right pre-compiled spec — keeping a single
     * authoritative resolver on the Rust side instead of duplicating
     * the table across JS files.
     * @returns {string | undefined}
     */
    sleigh_language_id() {
        const ret = wasm.websession_sleigh_language_id(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Snap an address to the containing function's entry. Checks the
     * NameSpace first, then falls back to a bounded backward prologue
     * scan. Returns the resolved entry, or the input address unchanged
     * if no function could be identified.
     *
     * Used by the web decompile panel so decompiling from the middle
     * of a function decompiles from the function's actual start rather
     * than producing garbage. Returns a JS BigInt (via WASM_BIGINT).
     * @param {bigint} address
     * @returns {bigint}
     */
    resolve_function_entry(address) {
        const ret = wasm.websession_resolve_function_entry(this.__wbg_ptr, address);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Creates a new session with default configuration.
     */
    constructor() {
        const ret = wasm.websession_new();
        this.__wbg_ptr = ret >>> 0;
        WebSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Run the active emulation state until halt / avoid / max-steps.
     * `max_steps` of 0 means "use the runner's default" (10000).
     * `halts`, `avoids`, and `merges` are flat u64 arrays — the JS
     * side flattens its three comma-separated input boxes into
     * these before calling.
     * @param {number | null | undefined} max_steps
     * @param {BigUint64Array} halts
     * @param {BigUint64Array} avoids
     * @param {BigUint64Array} merges
     * @returns {any}
     */
    emu_run(max_steps, halts, avoids, merges) {
        const ptr0 = passArray64ToWasm0(halts, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray64ToWasm0(avoids, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray64ToWasm0(merges, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.websession_emu_run(this.__wbg_ptr, isLikeNone(max_steps) ? 0x100000001 : (max_steps) >>> 0, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Write `value` (a number, hex literal, or registered symbol name)
     * to `entity` (a register name or memory address). The text-form
     * arguments mirror the `emulate set` command so the modal's two
     * inputs map straight through.
     * @param {string} entity
     * @param {string} value
     * @returns {any}
     */
    emu_set(entity, value) {
        const ptr0 = passStringToWasm0(entity, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.websession_emu_set(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Executes a command and returns the result.
     *
     * This is the primary interface for interacting with bint.
     * All functionality (seek, disassemble, hex dump, etc.) is accessed
     * through commands, keeping the API consistent with HTTP backends.
     *
     * Commands can include modifiers:
     * - `/j` for JSON output
     * - `~pattern` for grep filtering
     * - `@ 0xADDR` for temporary seek
     *
     * # Arguments
     *
     * * `command` - The command string to execute
     *
     * # Returns
     *
     * The command output as a string, or throws on error.
     * @param {string} command
     * @returns {string}
     */
    execute(command) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(command, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.websession_execute(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Read `size` bytes starting at virtual address `address` from the
     * loaded image. Honours per-segment mapping (so addresses across
     * non-contiguous Mach-O segments resolve correctly), unlike a flat
     * file-offset projection.
     *
     * Used by the web decompile panel to populate the decompiler's
     * in-worker memory map segment-by-segment. Returns an empty vec on
     * failure rather than throwing — partial reads aren't expected in
     * our segment-iteration call sites.
     * @param {bigint} address
     * @param {number} size
     * @returns {Uint8Array}
     */
    read_at(address, size) {
        const ret = wasm.websession_read_at(this.__wbg_ptr, address, size);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Initialise a fresh emulation state at `address` (typically the
     * current seek). Maps the binary's segments into emu memory and
     * makes the new state active. Returns the typed `EmuInitOutput`.
     * @param {bigint} address
     * @returns {any}
     */
    emu_init(address) {
        const ret = wasm.websession_emu_init(this.__wbg_ptr, address);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Single-step (or `count`-step) the active emulation state. Same
     * as the `emulate step [count]` command — drives the concrete
     * engine for known-PC paths and the symex one for branches.
     * @param {number} count
     * @returns {any}
     */
    emu_step(count) {
        const ret = wasm.websession_emu_step(this.__wbg_ptr, count);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Current seek address.
     * @returns {bigint}
     */
    get_seek() {
        const ret = wasm.websession_get_seek(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Hex dump of `length` bytes starting at `address`. When
     * `state_idx` is `Some(i)`, reads through the layered memory
     * view of emulation state `i` — symbolic cells render as `??`
     * (with `?` in the ASCII column) and unmapped cells as `--`
     * (with `-` in the ASCII column). When `None`, reads from the
     * session memory layer (default behaviour).
     * @param {bigint} address
     * @param {number} length
     * @param {number | null | undefined} state_idx
     * @param {boolean} solve_symbolic
     * @returns {any}
     */
    hex_dump(address, length, state_idx, solve_symbolic) {
        const ret = wasm.websession_hex_dump(this.__wbg_ptr, address, length, isLikeNone(state_idx) ? 0x100000001 : (state_idx) >>> 0, solve_symbolic);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Add a new name at `address` of the given kind (`func`, `label`, …).
     * @param {string} kind
     * @param {bigint} address
     * @param {string} name
     * @returns {any}
     */
    name_add(kind, address, name) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.websession_name_add(this.__wbg_ptr, ptr0, len0, address, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Set the current seek address.
     * @param {bigint} address
     * @returns {any}
     */
    set_seek(address) {
        const ret = wasm.websession_set_seek(this.__wbg_ptr, address);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Lists xrefs that point at `address`. See `XrefsOutput` for shape.
     * @param {bigint} address
     * @returns {any}
     */
    xrefs_to(address) {
        const ret = wasm.websession_xrefs_to(this.__wbg_ptr, address);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Reset all emulation state.
     * @returns {any}
     */
    emu_reset() {
        const ret = wasm.websession_emu_reset(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Solve the active path's accumulated constraints for `name`,
     * returning the typed `EmuSolveOutput` (hex / bytes / lossy
     * utf-8 / unsat). Pass an empty string to just check SAT/UNSAT.
     * @param {string} name
     * @returns {any}
     */
    emu_solve(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.websession_emu_solve(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Returns the current binary contents (with pending writes applied)
     * as a base64 blob plus filename and size — what the frontend
     * hands to the browser's download API for "Save File".
     * @returns {any}
     */
    file_data() {
        const ret = wasm.websession_file_data(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Names registered exactly at `address`.
     * @param {bigint} address
     * @returns {any}
     */
    name_here(address) {
        const ret = wasm.websession_name_here(this.__wbg_ptr, address);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Lists names matching the optional kind filter (`func`, `import`,
     * `export`, `label`, `comment`, `variable`, `section`, `data`).
     * Pass `None` for all.
     * @param {string | null} [kind]
     * @returns {any}
     */
    name_list(kind) {
        var ptr0 = isLikeNone(kind) ? 0 : passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.websession_name_list(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Step backward in seek history.
     * @returns {any}
     */
    seek_back() {
        const ret = wasm.websession_seek_back(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) WebSession.prototype[Symbol.dispose] = WebSession.prototype.free;

/**
 * Sets up panic hook for better error messages in the browser console.
 */
export function init_panic_hook() {
    wasm.init_panic_hook();
}

/**
 * Returns the bint version string.
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_Error_52673b7de5a0ca89 = function(arg0, arg1) {
        const ret = Error(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_String_8f0eb39a4a4c2f66 = function(arg0, arg1) {
        const ret = String(arg1);
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_is_string_704ef9c8fc131030 = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
        const ret = new Object();
        return ret;
    };
    imports.wbg.__wbg_new_25f239778d6112b9 = function() {
        const ret = new Array();
        return ret;
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
        return ret;
    };
    imports.wbg.__wbg_new_b546ae120718850e = function() {
        const ret = new Map();
        return ret;
    };
    imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
        arg0[arg1] = arg2;
    };
    imports.wbg.__wbg_set_7df433eea03a5c14 = function(arg0, arg1, arg2) {
        arg0[arg1 >>> 0] = arg2;
    };
    imports.wbg.__wbg_set_efaaf145b9377369 = function(arg0, arg1, arg2) {
        const ret = arg0.set(arg1, arg2);
        return ret;
    };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = arg1.stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_cast_4625c577ab2ec9ee = function(arg0) {
        // Cast intrinsic for `U64 -> Externref`.
        const ret = BigInt.asUintN(64, arg0);
        return ret;
    };
    imports.wbg.__wbindgen_cast_9ae0607507abb057 = function(arg0) {
        // Cast intrinsic for `I64 -> Externref`.
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function(arg0) {
        // Cast intrinsic for `F64 -> Externref`.
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedBigUint64ArrayMemory0 = null;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('bint_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
