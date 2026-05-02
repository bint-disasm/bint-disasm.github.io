/**
 * Hex dump view component.
 *
 * Displays binary data in hex format with ASCII representation.
 * Supports inline editing of bytes.
 */

import { events, Events } from '../core/events.js';
import { formatAddress, escapeHtml } from '../utils/format.js';

const template = document.createElement('template');
template.innerHTML = `
    <style>
        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
        * { scrollbar-width: thin; scrollbar-color: var(--border-color) transparent; }
        @supports (-webkit-hyphens: none) { * { scrollbar-width: none; } ::-webkit-scrollbar { display: none; } }

        :host {
            display: block;
            font-family: var(--font-mono);
            font-size: var(--font-size-xs);
            line-height: 1.5;
            overflow: auto;
        }

        .container {
            padding: var(--space-sm);
        }

        .loading, .empty {
            color: var(--text-muted);
            padding: var(--space-lg);
            text-align: center;
        }

        table {
            border-collapse: collapse;
            width: 100%;
        }

        tr:hover {
            background: var(--bg-hover);
        }

        td {
            padding: 1px var(--space-xs);
            vertical-align: top;
        }

        .col-address {
            color: var(--color-address);
            white-space: nowrap;
            cursor: pointer;
            padding-right: var(--space-md);
        }

        .col-address:hover {
            text-decoration: underline;
        }

        .col-hex {
            color: var(--text-primary);
            letter-spacing: 0.5px;
        }

        .col-ascii {
            color: var(--text-secondary);
            white-space: pre;
            border-left: 1px solid var(--border-subtle);
            padding-left: var(--space-md);
        }

        .byte {
            display: inline-block;
            width: 2ch;
            margin-right: 0.5ch;
            cursor: pointer;
            border-radius: 2px;
            padding: 0 1px;
            /* Hyphen-minus is a soft break opportunity, so a "--"
             * cell (rendered for unmapped bytes in an emu state
             * view) was wrapping between its two dashes — pin the
             * whole cell as one line. */
            white-space: nowrap;
        }

        .byte:nth-child(8) {
            margin-right: 1ch;
        }

        .byte:hover {
            background: var(--bg-hover);
            outline: 1px solid var(--accent-primary);
        }

        .byte.zero {
            color: var(--text-muted);
        }

        .byte.printable {
            color: var(--color-byte-printable);
        }

        .byte.high {
            color: var(--color-byte-high);
        }

        .byte.editing {
            background: var(--accent-primary);
            color: var(--bg-primary);
            outline: none;
        }

        .byte-input {
            width: 2ch;
            background: var(--accent-primary);
            color: var(--bg-primary);
            border: none;
            font-family: inherit;
            font-size: inherit;
            text-align: center;
            padding: 0;
            margin: 0;
            outline: none;
            text-transform: uppercase;
        }

        .ascii-char {
            cursor: pointer;
            padding: 0 1px;
            border-radius: 2px;
        }

        .ascii-char:hover {
            background: var(--bg-hover);
            outline: 1px solid var(--accent-primary);
        }

        .ascii-char.non-printable {
            color: var(--text-muted);
        }

        .ascii-char.editing {
            background: var(--accent-primary);
            color: var(--bg-primary);
            outline: none;
        }

        .ascii-input {
            width: 1ch;
            background: var(--accent-primary);
            color: var(--bg-primary);
            border: none;
            font-family: inherit;
            font-size: inherit;
            text-align: center;
            padding: 0;
            margin: 0;
            outline: none;
        }
    </style>

    <div class="container">
        <div class="empty">No binary loaded</div>
    </div>
`;

export class BintHexView extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._container = this.shadowRoot.querySelector('.container');
        this._api = null;
        // 16 bytes per row on desktop, 8 on phone-sized screens. The
        // Rust side decides hex layout from the `hex.cols` option, so
        // we just push the right value into that option once the wasm
        // session is wired up (see setAPI below). Re-applies on
        // breakpoint cross-over for things like the Z Fold unfolding
        // mid-session.
        this._mobileMQ = window.matchMedia(
            '(max-width: 768px), (pointer: coarse) and (max-width: 1024px)'
        );
        this._mobileMQ.addEventListener('change', () => {
            this._applyHexCols();
            this.refresh();
        });
        this._editing = false;
        // null = read from session memory layer (default).
        // number = read from emulation state at that index.
        // Driven by MEMORY_VIEW_TARGET_CHANGED from the Emulation panel.
        this._stateIndex = null;
        // Whether the hex view should ask the SMT solver for one
        // feasible byte assignment when rendering symbolic cells —
        // toggled by the Emulation panel's "Solve hex" checkbox.
        // Only meaningful when `_stateIndex` is set.
        this._solveSymbolic = false;

        events.on(Events.BINARY_LOADED, () => {
            this._stateIndex = null;
            this._solveSymbolic = false;
            this.refresh();
        });
        events.on(Events.SEEK_CHANGED, () => this.refresh());
        events.on(Events.MEMORY_VIEW_TARGET_CHANGED, ({ stateIndex }) => {
            this._stateIndex = (typeof stateIndex === 'number') ? stateIndex : null;
            this.refresh();
        });
        events.on(Events.HEX_SOLVE_TOGGLED, ({ solve }) => {
            this._solveSymbolic = !!solve;
            this.refresh();
        });

        // Handle clicks on bytes and ascii chars
        this.shadowRoot.addEventListener('click', (e) => {
            if (this._editing) return;

            const byte = e.target.closest('.byte');
            if (byte) {
                this._startByteEdit(byte);
                return;
            }

            const asciiChar = e.target.closest('.ascii-char');
            if (asciiChar) {
                this._startAsciiEdit(asciiChar);
                return;
            }
        });
    }

    setAPI(api) {
        this._api = api;
        this._applyHexCols();
    }

    /** Push the viewport-appropriate hex.cols value into the wasm
     *  session's options. Safe to call before or after the API is
     *  connected; without an API it's a no-op. */
    _applyHexCols() {
        if (!this._api?.session?.options_set) return;
        try {
            this._api.session.options_set('hex.cols', this._mobileMQ.matches ? '8' : '16');
        } catch (e) {
            console.warn('[hex] failed to set hex.cols', e);
        }
    }

    async refresh() {
        if (this._editing) return; // Don't refresh while editing

        if (!this._api) {
            this._showEmpty('No API connected');
            return;
        }

        if (!await this._api.hasBinary()) {
            this._showEmpty('No binary loaded');
            return;
        }

        this._showLoading();

        try {
            // hex_dump returns HexOutput { start_address, lines:
            // [{address: BigInt, hex, ascii}] }. 512 bytes is enough
            // for a panelful at the default 16 cols-per-row.
            const seek = await this._api.getSeek();
            const seekBig = typeof seek === 'bigint' ? seek : BigInt(seek);
            // hex_dump dispatches through Session::memory_view —
            // null target means session memory; a number redirects
            // through that emulation state's overlay.
            // `_solveSymbolic` asks the path's SMT solver for one
            // feasible byte assignment so the user sees concrete
            // values for symbolic cells (single solver call across
            // the whole window).
            const output = this._api.session.hex_dump(
                seekBig,
                0x200,
                this._stateIndex,
                this._solveSymbolic,
            );
            const lines = output?.lines;
            if (!Array.isArray(lines) || lines.length === 0) {
                this._showEmpty('No data available');
                return;
            }
            this._renderLines(lines);
        } catch (e) {
            this._showEmpty(`Error: ${e.message || e}`);
        }
    }

    async seekTo(address) {
        if (!this._api) return;
        await this._api.setSeek(address);
        // Note: setSeek emits SEEK_CHANGED which triggers refresh
    }

    _showLoading() {
        this._container.innerHTML = '<div class="loading">Loading...</div>';
    }

    _showEmpty(message) {
        this._container.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
    }

    _renderLines(lines) {
        const table = document.createElement('table');
        for (const line of lines) {
            const addrBig = line.address;
            const addrStr = '0x' + addrBig.toString(16);
            const hex = line.hex || '';
            const ascii = line.ascii || '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-address" data-address="${escapeHtml(addrStr)}">${escapeHtml(addrStr)}</td>
                <td class="col-hex">${this._createEditableBytes(hex, addrBig)}</td>
                <td class="col-ascii">${this._createEditableAscii(ascii, addrBig)}</td>
            `;
            tr.querySelector('.col-address').addEventListener('click', () => {
                this.seekTo(addrStr);
            });
            table.appendChild(tr);
        }
        this._container.innerHTML = '';
        this._container.appendChild(table);
    }

    _createEditableBytes(hexString, baseAddress) {
        // Split into individual bytes
        // baseAddress is a BigInt for 64-bit address support
        const bytes = hexString.trim().split(/\s+/);
        return bytes.map((byte, index) => {
            const value = parseInt(byte, 16);
            let className = 'byte';

            if (value === 0) {
                className += ' zero';
            } else if (value >= 0x20 && value <= 0x7e) {
                className += ' printable';
            } else if (value >= 0x80) {
                className += ' high';
            }

            // Store address as hex string
            const addr = '0x' + (baseAddress + BigInt(index)).toString(16);
            return `<span class="${className}" data-address="${addr}" data-value="${byte}">${byte}</span>`;
        }).join('');
    }

    _createEditableAscii(ascii, baseAddress) {
        // baseAddress is a BigInt for 64-bit address support
        return Array.from(ascii).map((char, index) => {
            const code = char.charCodeAt(0);
            const isPrintable = code >= 0x20 && code <= 0x7e;
            const displayChar = isPrintable ? escapeHtml(char) : '.';
            const className = isPrintable ? 'ascii-char' : 'ascii-char non-printable';
            // Store address as hex string
            const addr = '0x' + (baseAddress + BigInt(index)).toString(16);
            return `<span class="${className}" data-address="${addr}" data-char="${char}">${displayChar}</span>`;
        }).join('');
    }

    _startByteEdit(byteSpan) {
        // Address is stored as hex string
        const address = byteSpan.dataset.address;
        const currentValue = byteSpan.dataset.value || byteSpan.textContent;

        this._editing = true;
        byteSpan.classList.add('editing');
        byteSpan.innerHTML = `<input type="text" class="byte-input" maxlength="2" value="${currentValue}">`;

        const input = byteSpan.querySelector('.byte-input');
        input.focus();
        input.select();

        let finished = false;
        const finishEdit = async (commit, advance = false) => {
            if (finished) return;
            finished = true;
            this._editing = false;

            if (commit) {
                const newValue = input.value.toUpperCase().padStart(2, '0');
                if (/^[0-9A-F]{2}$/.test(newValue) && newValue !== currentValue.toUpperCase()) {
                    await this._writeByte(address, newValue);
                }
            }

            if (advance) {
                // Calculate next address and edit it after refresh
                const nextAddr = '0x' + (BigInt(address) + 1n).toString(16);
                await this.refresh();
                // Find the next byte span and start editing it
                const nextByte = this.shadowRoot.querySelector(`.byte[data-address="${nextAddr}"]`);
                if (nextByte) {
                    this._startByteEdit(nextByte);
                }
            } else {
                this.refresh();
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEdit(true, true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEdit(false, false);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                finishEdit(true, true);
            }
        });

        input.addEventListener('blur', () => {
            finishEdit(true, false);
        });

        // Auto-advance after 2 valid hex digits
        input.addEventListener('input', () => {
            // Filter to only hex chars
            input.value = input.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
            if (input.value.length >= 2) {
                finishEdit(true, true);
            }
        });
    }

    _startAsciiEdit(asciiSpan) {
        // Address is stored as hex string
        const address = asciiSpan.dataset.address;
        const currentChar = asciiSpan.dataset.char || asciiSpan.textContent;

        this._editing = true;
        asciiSpan.classList.add('editing');
        asciiSpan.innerHTML = `<input type="text" class="ascii-input" maxlength="1" value="">`;

        const input = asciiSpan.querySelector('.ascii-input');
        input.focus();

        let finished = false;
        const finishEdit = async (commit, advance = false) => {
            if (finished) return;
            finished = true;
            this._editing = false;

            if (commit && input.value.length === 1) {
                const charCode = input.value.charCodeAt(0);
                if (charCode >= 0x20 && charCode <= 0x7e) {
                    const hexValue = charCode.toString(16).toUpperCase().padStart(2, '0');
                    const oldHex = currentChar.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
                    if (hexValue !== oldHex) {
                        await this._writeByte(address, hexValue);
                    }
                }
            }

            if (advance) {
                // Calculate next address and edit it after refresh
                const nextAddr = '0x' + (BigInt(address) + 1n).toString(16);
                await this.refresh();
                // Find the next ascii char span and start editing it
                const nextChar = this.shadowRoot.querySelector(`.ascii-char[data-address="${nextAddr}"]`);
                if (nextChar) {
                    this._startAsciiEdit(nextChar);
                }
            } else {
                this.refresh();
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEdit(true, true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEdit(false, false);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                finishEdit(true, true);
            }
        });

        input.addEventListener('blur', () => {
            finishEdit(true, false);
        });

        // Auto-advance after 1 character
        input.addEventListener('input', () => {
            if (input.value.length >= 1) {
                finishEdit(true, true);
            }
        });
    }

    async _writeByte(address, hexValue) {
        if (!this._api) return;

        try {
            const addrStr = String(address).startsWith('0x') ? address : `0x${address}`;
            const value = parseInt(hexValue, 16);
            // memory_write goes through MemApi::write into the COW
            // memory layer — same as `memory write` did, just typed.
            this._api.session.memory_write(BigInt(addrStr), new Uint8Array([value]));
            events.emit(Events.MEMORY_MODIFIED, { address: addrStr, value });
        } catch (e) {
            console.error(`Failed to write byte: ${e}`);
        }
    }
}

customElements.define('bint-hex-view', BintHexView);

export default BintHexView;
