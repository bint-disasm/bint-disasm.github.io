/**
 * Abstract API interface for bint.
 *
 * Originally written to support multiple backends (WASM in-process and a
 * remote bint server over HTTP) by funnelling everything through
 * text-mode `execute()`. We've since dropped the server-mode plan and
 * gone with typed wasm-bindgen calls everywhere — `WasmAPI` overrides
 * each method below with a direct call into the wasm session and never
 * touches `execute()` outside of the console REPL.
 *
 * The class is kept as a contract / type hint and to leave a clean path
 * for adding alternative backends later if we ever change our minds.
 */

import { events, Events } from './events.js';

export class BintAPI {
    /** Load a binary from raw bytes. */
    async loadBinary(_data, _filename) { throw new Error('Not implemented'); }

    /** Load a pre-compiled SLEIGH spec. */
    async loadSleighSpec(_archId, _data) { throw new Error('Not implemented'); }

    /** Run a bint command and return its stdout (used by the console). */
    async execute(_command) { throw new Error('Not implemented'); }

    /** Whether a binary is loaded. */
    async hasBinary() { throw new Error('Not implemented'); }

    /** Current seek address as a 0x-prefixed hex string. */
    async getSeek() { throw new Error('Not implemented'); }

    /** Move the seek pointer; emits SEEK_CHANGED. */
    async setSeek(_addr) { throw new Error('Not implemented'); }

    /** Step backward in seek history; emits SEEK_CHANGED if a step happened. */
    async seekBack() { throw new Error('Not implemented'); }

    /** Step forward in seek history; emits SEEK_CHANGED if a step happened. */
    async seekForward() { throw new Error('Not implemented'); }

    /** Whether `seekBack()` would do anything. */
    async canSeekBack() { throw new Error('Not implemented'); }

    /** Whether `seekForward()` would do anything. */
    async canSeekForward() { throw new Error('Not implemented'); }

    /**
     * Set the colour theme via the `theme <name>` command.
     * Theme handling is tiny and one-shot, so we leave it as a text
     * command rather than wiring a typed endpoint for it.
     */
    async setTheme(name) {
        const result = await this.execute(`theme ${name}`);
        return result.includes('Theme set to');
    }

    /** List available theme names. */
    async getAvailableThemes() {
        const result = await this.execute('theme');
        const match = result.match(/Available themes: (.+)$/);
        if (match) return match[1].split(', ').map(s => s.trim());
        return ['dark', 'light', 'monokai', 'solarized-dark', 'none'];
    }

    /** bint version string. */
    async getVersion() { throw new Error('Not implemented'); }

    /** Snapshot the current binary contents (with edits applied). */
    async getFileData() { throw new Error('Not implemented'); }
}

// `events` is imported above for component code that wants to broadcast
// SEEK_CHANGED / etc. through the same module that owns the API contract.
export { events, Events };

export default BintAPI;
