/**
 * Cross-references panel component.
 *
 * Displays xrefs to/from the current address.
 */

import { events, Events } from '../core/events.js';
import { escapeHtml } from '../utils/format.js';

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
            display: flex;
            flex-direction: column;
            font-family: var(--font-mono);
            font-size: var(--font-size-sm);
            overflow: hidden;
        }

        .tabs {
            display: flex;
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-subtle);
        }

        .tab {
            padding: var(--space-xs) var(--space-sm);
            cursor: pointer;
            color: var(--text-secondary);
            border-bottom: 2px solid transparent;
            font-size: var(--font-size-xs);
        }

        .tab:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
        }

        .tab.active {
            color: var(--accent-primary);
            border-bottom-color: var(--accent-primary);
        }

        .list {
            flex: 1;
            overflow-y: auto;
            min-height: 0;
        }

        .empty {
            color: var(--text-muted);
            padding: var(--space-md);
            text-align: center;
            font-size: var(--font-size-xs);
        }

        .xref {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-sm);
            cursor: pointer;
            border-bottom: 1px solid var(--border-subtle);
        }

        .xref:hover {
            background: var(--bg-hover);
        }

        .xref-type {
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
            width: 32px;
        }

        .xref-address {
            color: var(--color-address);
        }

        .xref-name {
            flex: 1;
            color: var(--color-function);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    </style>

    <div class="tabs">
        <div class="tab active" data-tab="to">To</div>
        <div class="tab" data-tab="from">From</div>
    </div>
    <div class="list">
        <div class="empty">Select an address to see xrefs</div>
    </div>
`;

export class BintXrefs extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._list = this.shadowRoot.querySelector('.list');
        this._tabs = this.shadowRoot.querySelectorAll('.tab');
        this._api = null;
        this._currentTab = 'to';
        this._currentAddress = null;

        // Tab switching
        this._tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this._tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this._currentTab = tab.dataset.tab;
                this.refresh();
            });
        });

        events.on(Events.SEEK_CHANGED, (addr) => {
            this._currentAddress = addr;
            this.refresh();
        });
        // Re-fetch after `analyze all` finishes — the seek didn't
        // change but the xref database did, and we'd otherwise sit on
        // a stale "no xrefs" until the user navigates somewhere.
        events.on(Events.ANALYSIS_COMPLETE, () => this.refresh());
    }

    setAPI(api) {
        this._api = api;
    }

    async refresh() {
        if (!this._api || this._currentAddress === null) {
            this._showEmpty('Select an address to see xrefs');
            return;
        }

        try {
            const addr = BigInt(this._currentAddress);
            // Typed wasm methods return native JS objects: xrefs is an
            // Array of { from: bigint, to: bigint, kind: string,
            // annotation: string|null }. No JSON round-trip, no shape
            // matching — the structure mirrors XrefsOutput on the Rust
            // side exactly.
            const output = this._currentTab === 'to'
                ? this._api.session.xrefs_to(addr)
                : this._api.session.xrefs_from(addr);
            const xrefs = output?.xrefs;
            if (!Array.isArray(xrefs) || xrefs.length === 0) {
                this._showEmpty(`No xrefs ${this._currentTab} this address`);
                return;
            }
            const showFrom = this._currentTab === 'to';
            const rows = xrefs.map((x) => {
                const otherAddr = showFrom ? x.from : x.to;
                return {
                    type: x.kind || '',
                    address: '0x' + otherAddr.toString(16),
                    name: x.annotation || '',
                };
            });
            this._renderList(rows);
        } catch (e) {
            this._showEmpty(`Error: ${e}`);
        }
    }

    _showEmpty(message) {
        this._list.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
    }

    _renderList(rows) {
        const getValue = (cell) => {
            if (cell === null || cell === undefined) return '';
            if (typeof cell === 'object' && cell.value !== undefined) return cell.value;
            return String(cell);
        };

        this._list.innerHTML = '';

        for (const row of rows) {
            let type, address, name;

            if (row.type !== undefined || row.address !== undefined) {
                type = getValue(row.type);
                address = getValue(row.address);
                name = getValue(row.name || row.function);
            } else if (Array.isArray(row)) {
                type = getValue(row[0]);
                address = getValue(row[1]);
                name = getValue(row[2]);
            } else {
                continue;
            }

            const div = document.createElement('div');
            div.className = 'xref';
            div.innerHTML = `
                <span class="xref-type">${escapeHtml(type)}</span>
                <span class="xref-address">${escapeHtml(address)}</span>
                <span class="xref-name">${escapeHtml(name)}</span>
            `;

            div.addEventListener('click', () => {
                // address is already a hex string like "0x1234"
                if (this._api && address) {
                    this._api.setSeek(address);
                }
            });

            this._list.appendChild(div);
        }
    }
}

customElements.define('bint-xrefs', BintXrefs);

export default BintXrefs;
