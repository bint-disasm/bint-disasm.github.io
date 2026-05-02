/**
 * Strings panel component.
 *
 * Displays strings found in the binary.
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

        .toolbar {
            display: flex;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-sm);
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-subtle);
        }

        .search {
            flex: 1;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            padding: 2px var(--space-xs);
            color: var(--text-primary);
            font-family: inherit;
            font-size: inherit;
        }

        .search::placeholder {
            color: var(--text-muted);
        }

        .list {
            flex: 1;
            overflow-y: auto;
            min-height: 0;
        }

        .empty, .loading {
            color: var(--text-muted);
            padding: var(--space-md);
            text-align: center;
            font-size: var(--font-size-xs);
        }

        .count {
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
            padding: var(--space-xs) var(--space-sm);
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
        }

        .string-item {
            display: flex;
            align-items: flex-start;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-sm);
            cursor: pointer;
            border-bottom: 1px solid var(--border-subtle);
        }

        .string-item:hover {
            background: var(--bg-hover);
        }

        .string-address {
            color: var(--color-address);
            flex-shrink: 0;
            font-size: var(--font-size-xs);
        }

        .string-value {
            color: var(--color-string);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .string-length {
            color: var(--text-muted);
            font-size: var(--font-size-xs);
            flex-shrink: 0;
        }
    </style>

    <div class="toolbar">
        <input type="text" class="search" placeholder="Filter strings...">
    </div>
    <div class="count"></div>
    <div class="list">
        <div class="empty">No binary loaded</div>
    </div>
`;

export class BintStrings extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._list = this.shadowRoot.querySelector('.list');
        this._search = this.shadowRoot.querySelector('.search');
        this._count = this.shadowRoot.querySelector('.count');
        this._api = null;
        this._strings = [];
        this._filteredStrings = [];

        this._search.addEventListener('input', () => this._filterStrings());

        events.on(Events.BINARY_LOADED, () => this.refresh());
    }

    setAPI(api) {
        this._api = api;
    }

    async refresh() {
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
            // info_strings returns StringsOutput { strings, min_length }
            // — each string is { address: BigInt, value, length }.
            const output = this._api.session.info_strings(4);
            const strings = output?.strings;
            if (!Array.isArray(strings) || strings.length === 0) {
                this._strings = [];
                this._showEmpty('No strings found');
                return;
            }
            this._strings = strings.map((s) => ({
                address: '0x' + s.address.toString(16),
                value: s.value || '',
                length: String(s.length ?? ''),
            }));
            this._filterStrings();
        } catch (e) {
            this._showEmpty(`Error: ${e.message || e}`);
        }
    }

    _filterStrings() {
        const query = this._search.value.toLowerCase();

        if (query) {
            this._filteredStrings = this._strings.filter(s =>
                s.value.toLowerCase().includes(query) ||
                s.address.toLowerCase().includes(query)
            );
        } else {
            this._filteredStrings = this._strings;
        }

        this._renderList();
    }

    _showLoading() {
        this._list.innerHTML = '<div class="loading">Loading...</div>';
        this._count.textContent = '';
    }

    _showEmpty(message) {
        this._list.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
        this._count.textContent = '';
    }

    _renderList() {
        if (this._filteredStrings.length === 0) {
            if (this._strings.length > 0) {
                this._showEmpty('No strings match filter');
            } else {
                this._showEmpty('No strings found');
            }
            return;
        }

        this._count.textContent = `${this._filteredStrings.length} string(s)`;

        this._list.innerHTML = '';

        for (const str of this._filteredStrings) {
            const div = document.createElement('div');
            div.className = 'string-item';
            div.innerHTML = `
                <span class="string-address">${escapeHtml(str.address)}</span>
                <span class="string-value">"${escapeHtml(str.value)}"</span>
                ${str.length ? `<span class="string-length">${escapeHtml(str.length)}</span>` : ''}
            `;

            div.addEventListener('click', () => {
                // str.address is already a hex string like "0x1234"
                if (this._api && str.address) {
                    this._api.setSeek(str.address);
                }
            });

            this._list.appendChild(div);
        }
    }
}

customElements.define('bint-strings', BintStrings);

export default BintStrings;
