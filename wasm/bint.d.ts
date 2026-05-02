/* tslint:disable */
/* eslint-disable */

export class WebSession {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Select an emulation state by index. Returns `EmuSelectOutput`.
   */
  emu_select(index: number): any;
  /**
   * List all live emulation states (PC + halt status), with the
   * active index. Drives the Emulation tab's state dropdown.
   */
  emu_states(): any;
  /**
   * Create a named symbolic variable of the given bit-width — the
   * "New Symbol" modal calls this then follows up with `emu_set`
   * to write it into a register or memory address.
   */
  emu_symbol(name: string, bits: number): any;
  /**
   * Returns whether a binary is loaded.
   *
   * This is a convenience method to avoid parsing command output
   * for a simple boolean check.
   */
  has_binary(): boolean;
  /**
   * Lists xrefs originating at `address`.
   */
  xrefs_from(address: bigint): any;
  /**
   * Whole-binary recursive-descent analysis. Records discovered
   * functions and xrefs into the session database.
   */
  analyze_all(): any;
  /**
   * Disassembles starting at `address`. If `count` is provided,
   * decodes that many instructions linearly; if `None` and the
   * address is inside a known function, the whole function is
   * emitted with block labels and separators.
   */
  disassemble(address: bigint, count?: number | null): any;
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
   */
  load_binary(data: Uint8Array, filename: string): string;
  /**
   * Rename an existing name by id.
   */
  name_rename(id: bigint, new_name: string): any;
  /**
   * Sets `name` to `value`. Same parsing as `e <name>=<value>` —
   * bools accept `true|false|on|off|yes|no|1|0`, ints accept
   * decimal or `0x` hex.
   */
  options_set(name: string, value: string): any;
  /**
   * Binary metadata (format, architecture, entry point, sizes, …).
   * Returned at file-load time too via `load_binary`, but exposed
   * here so the frontend can refresh after option changes etc.
   */
  info_general(): any;
  /**
   * Strings discovered in readable sections (printable ASCII runs of
   * length >= `min_length`).
   */
  info_strings(min_length: number): any;
  /**
   * Flush pending COW memory writes back into the underlying file.
   */
  memory_apply(): any;
  /**
   * Write `bytes` at `address` into the COW memory layer (does not
   * touch the underlying file until `memory_apply` flushes).
   */
  memory_write(address: bigint, bytes: Uint8Array): any;
  /**
   * Lists every configurable option with its current value, type
   * tag, and description. Drives the web Options modal.
   */
  options_list(): any;
  /**
   * Step forward in seek history.
   */
  seek_forward(): any;
  /**
   * Full seek history (with current index) for nav button state.
   */
  seek_history(): any;
  /**
   * Snapshot the active state's general registers. `include_temporaries`
   * pulls in SLEIGH temporaries (off by default for display).
   */
  emu_registers(include_temporaries: boolean): any;
  /**
   * Loadable segments / sections — name, virtual address, size,
   * permissions string. Used by the decompile panel to populate its
   * load image and pick readonly ranges for string rendering.
   */
  info_sections(): any;
  /**
   * Snapshot the active path's accumulated boolean constraints as
   * an SMT-LIB 2 script. Drives the Emulation panel's constraints
   * viewer.
   */
  emu_constraints(): any;
  /**
   * Analyses the function at `address` and returns its
   * `FunctionOutput` (entry, blocks with edge kinds, calls, …).
   * Records the function in the names DB as a side effect — same
   * behaviour as the `analyze function` command.
   */
  analyze_function(address: bigint): any;
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
   */
  load_sleigh_spec(arch_id: string, data: Uint8Array): boolean;
  /**
   * SLEIGH language id for the loaded binary's architecture +
   * endianness + word size (e.g. `"MIPS:LE:32:default"`). Returns
   * `None` until `load_binary` has run. The web frontend uses this
   * to fetch the right pre-compiled spec — keeping a single
   * authoritative resolver on the Rust side instead of duplicating
   * the table across JS files.
   */
  sleigh_language_id(): string | undefined;
  /**
   * Snap an address to the containing function's entry. Checks the
   * NameSpace first, then falls back to a bounded backward prologue
   * scan. Returns the resolved entry, or the input address unchanged
   * if no function could be identified.
   *
   * Used by the web decompile panel so decompiling from the middle
   * of a function decompiles from the function's actual start rather
   * than producing garbage. Returns a JS BigInt (via WASM_BIGINT).
   */
  resolve_function_entry(address: bigint): bigint;
  /**
   * Creates a new session with default configuration.
   */
  constructor();
  /**
   * Run the active emulation state until halt / avoid / max-steps.
   * `max_steps` of 0 means "use the runner's default" (10000).
   * `halts`, `avoids`, and `merges` are flat u64 arrays — the JS
   * side flattens its three comma-separated input boxes into
   * these before calling.
   */
  emu_run(max_steps: number | null | undefined, halts: BigUint64Array, avoids: BigUint64Array, merges: BigUint64Array): any;
  /**
   * Write `value` (a number, hex literal, or registered symbol name)
   * to `entity` (a register name or memory address). The text-form
   * arguments mirror the `emulate set` command so the modal's two
   * inputs map straight through.
   */
  emu_set(entity: string, value: string): any;
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
   */
  execute(command: string): string;
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
   */
  read_at(address: bigint, size: number): Uint8Array;
  /**
   * Initialise a fresh emulation state at `address` (typically the
   * current seek). Maps the binary's segments into emu memory and
   * makes the new state active. Returns the typed `EmuInitOutput`.
   */
  emu_init(address: bigint): any;
  /**
   * Single-step (or `count`-step) the active emulation state. Same
   * as the `emulate step [count]` command — drives the concrete
   * engine for known-PC paths and the symex one for branches.
   */
  emu_step(count: number): any;
  /**
   * Current seek address.
   */
  get_seek(): bigint;
  /**
   * Hex dump of `length` bytes starting at `address`. When
   * `state_idx` is `Some(i)`, reads through the layered memory
   * view of emulation state `i` — symbolic cells render as `??`
   * (with `?` in the ASCII column) and unmapped cells as `--`
   * (with `-` in the ASCII column). When `None`, reads from the
   * session memory layer (default behaviour).
   */
  hex_dump(address: bigint, length: number, state_idx: number | null | undefined, solve_symbolic: boolean): any;
  /**
   * Add a new name at `address` of the given kind (`func`, `label`, …).
   */
  name_add(kind: string, address: bigint, name: string): any;
  /**
   * Set the current seek address.
   */
  set_seek(address: bigint): any;
  /**
   * Lists xrefs that point at `address`. See `XrefsOutput` for shape.
   */
  xrefs_to(address: bigint): any;
  /**
   * Reset all emulation state.
   */
  emu_reset(): any;
  /**
   * Solve the active path's accumulated constraints for `name`,
   * returning the typed `EmuSolveOutput` (hex / bytes / lossy
   * utf-8 / unsat). Pass an empty string to just check SAT/UNSAT.
   */
  emu_solve(name: string): any;
  /**
   * Returns the current binary contents (with pending writes applied)
   * as a base64 blob plus filename and size — what the frontend
   * hands to the browser's download API for "Save File".
   */
  file_data(): any;
  /**
   * Names registered exactly at `address`.
   */
  name_here(address: bigint): any;
  /**
   * Lists names matching the optional kind filter (`func`, `import`,
   * `export`, `label`, `comment`, `variable`, `section`, `data`).
   * Pass `None` for all.
   */
  name_list(kind?: string | null): any;
  /**
   * Step backward in seek history.
   */
  seek_back(): any;
}

/**
 * Sets up panic hook for better error messages in the browser console.
 */
export function init_panic_hook(): void;

/**
 * Returns the bint version string.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_websession_free: (a: number, b: number) => void;
  readonly version: () => [number, number];
  readonly websession_analyze_all: (a: number) => [number, number, number];
  readonly websession_analyze_function: (a: number, b: bigint) => [number, number, number];
  readonly websession_disassemble: (a: number, b: bigint, c: number) => [number, number, number];
  readonly websession_emu_constraints: (a: number) => [number, number, number];
  readonly websession_emu_init: (a: number, b: bigint) => [number, number, number];
  readonly websession_emu_registers: (a: number, b: number) => [number, number, number];
  readonly websession_emu_reset: (a: number) => [number, number, number];
  readonly websession_emu_run: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly websession_emu_select: (a: number, b: number) => [number, number, number];
  readonly websession_emu_set: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly websession_emu_solve: (a: number, b: number, c: number) => [number, number, number];
  readonly websession_emu_states: (a: number) => [number, number, number];
  readonly websession_emu_step: (a: number, b: number) => [number, number, number];
  readonly websession_emu_symbol: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly websession_execute: (a: number, b: number, c: number) => [number, number, number, number];
  readonly websession_file_data: (a: number) => [number, number, number];
  readonly websession_get_seek: (a: number) => bigint;
  readonly websession_has_binary: (a: number) => number;
  readonly websession_hex_dump: (a: number, b: bigint, c: number, d: number, e: number) => [number, number, number];
  readonly websession_info_general: (a: number) => [number, number, number];
  readonly websession_info_sections: (a: number) => [number, number, number];
  readonly websession_info_strings: (a: number, b: number) => [number, number, number];
  readonly websession_load_binary: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly websession_load_sleigh_spec: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly websession_memory_apply: (a: number) => [number, number, number];
  readonly websession_memory_write: (a: number, b: bigint, c: number, d: number) => [number, number, number];
  readonly websession_name_add: (a: number, b: number, c: number, d: bigint, e: number, f: number) => [number, number, number];
  readonly websession_name_here: (a: number, b: bigint) => [number, number, number];
  readonly websession_name_list: (a: number, b: number, c: number) => [number, number, number];
  readonly websession_name_rename: (a: number, b: bigint, c: number, d: number) => [number, number, number];
  readonly websession_new: () => number;
  readonly websession_options_list: (a: number) => [number, number, number];
  readonly websession_options_set: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly websession_read_at: (a: number, b: bigint, c: number) => [number, number];
  readonly websession_resolve_function_entry: (a: number, b: bigint) => bigint;
  readonly websession_seek_back: (a: number) => [number, number, number];
  readonly websession_seek_forward: (a: number) => [number, number, number];
  readonly websession_seek_history: (a: number) => [number, number, number];
  readonly websession_set_seek: (a: number, b: bigint) => [number, number, number];
  readonly websession_sleigh_language_id: (a: number) => [number, number];
  readonly websession_xrefs_from: (a: number, b: bigint) => [number, number, number];
  readonly websession_xrefs_to: (a: number, b: bigint) => [number, number, number];
  readonly init_panic_hook: () => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
