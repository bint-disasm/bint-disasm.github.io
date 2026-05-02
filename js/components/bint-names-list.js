/**
 * Names list component.
 *
 * Displays all named entities: functions, imports, exports, sections, labels, etc.
 * Uses the unified `name list` command which combines all name sources.
 */

import { events, Events } from '../core/events.js';
import { escapeHtml } from '../utils/format.js';

// Map type indicators to display info
const TYPE_INFO = {
    'f': { name: 'function', color: 'var(--color-function)', label: 'func' },
    'l': { name: 'label', color: 'var(--text-secondary)', label: 'label' },
    'v': { name: 'variable', color: 'var(--accent-tertiary)', label: 'var' },
    's': { name: 'section', color: 'var(--accent-secondary)', label: 'sect' },
    'i': { name: 'import', color: 'var(--accent-warning)', label: 'imp' },
    'e': { name: 'export', color: 'var(--accent-success, #4caf50)', label: 'exp' },
    'L': { name: 'local', color: 'var(--text-muted)', label: 'local' },
    'p': { name: 'param', color: 'var(--text-muted)', label: 'param' },
    'c': { name: 'comment', color: 'var(--color-comment)', label: 'cmt' },
    't': { name: 'type', color: 'var(--accent-primary)', label: 'type' },
};

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
            padding: var(--space-lg);
            text-align: center;
        }

        .name-row {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-sm);
            cursor: pointer;
            border-bottom: 1px solid var(--border-subtle);
        }

        .name-row:hover {
            background: var(--bg-hover);
        }

        .name-row.selected {
            background: var(--bg-tertiary);
        }

        .name-icon {
            font-size: 10px;
            width: 1ch;
            text-align: center;
            font-weight: bold;
        }

        .name-text {
            flex: 1;
            color: var(--color-function);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .name-address {
            color: var(--color-address);
            font-size: var(--font-size-xs);
        }

        .name-size {
            color: var(--text-muted);
            font-size: var(--font-size-xs);
            min-width: 6ch;
            text-align: right;
        }

        .count {
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
            padding: var(--space-xs) var(--space-sm);
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
        }
    </style>

    <div class="toolbar">
        <input type="text" class="search" placeholder="Filter names...">
    </div>
    <div class="count"></div>
    <div class="list">
        <div class="empty">No binary loaded</div>
    </div>
`;

export class BintNamesList extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._list = this.shadowRoot.querySelector('.list');
        this._search = this.shadowRoot.querySelector('.search');
        this._count = this.shadowRoot.querySelector('.count');
        this._api = null;
        this._names = [];
        this._filteredNames = [];

        this._search.addEventListener('input', () => this._filterNames());

        events.on(Events.BINARY_LOADED, () => this.refresh());
        events.on(Events.ANALYSIS_COMPLETE, () => this.refresh());
    }

    setAPI(api) {
        this._api = api;
    }

    async refresh() {
        console.log('[names-list] refresh() called');

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
            // name_list returns NamesListOutput { entries, kind_filter }
            // — each entry is { kind_indicator, address: BigInt, name,
            // size: BigInt|null, kind }.
            const output = this._api.session.name_list();
            const entries = output?.entries;
            if (!Array.isArray(entries) || entries.length === 0) {
                this._showEmpty('No names available');
                return;
            }
            this._names = entries.map((e) => ({
                type: e.kind_indicator || '',
                address: '0x' + e.address.toString(16),
                name: e.name || '',
                size: e.size != null ? '0x' + e.size.toString(16) : '',
            }));
            this._filterNames();
        } catch (e) {
            this._showEmpty(`Error: ${e.message || e}`);
        }
    }

    _filterNames() {
        const query = this._search.value.toLowerCase();

        if (query) {
            this._filteredNames = this._names.filter(n =>
                n.name.toLowerCase().includes(query) ||
                n.address.toLowerCase().includes(query) ||
                n.type.toLowerCase().includes(query) ||
                (TYPE_INFO[n.type]?.name || '').includes(query) ||
                (TYPE_INFO[n.type]?.label || '').includes(query)
            );
        } else {
            this._filteredNames = [...this._names];
        }

        // Sort by type first, then by name
        this._filteredNames.sort((a, b) => {
            // Compare type indicators
            const typeCompare = a.type.localeCompare(b.type);
            if (typeCompare !== 0) return typeCompare;
            // Same type, compare names
            return a.name.localeCompare(b.name);
        });

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
        if (this._filteredNames.length === 0) {
            if (this._names.length > 0) {
                this._showEmpty('No entries match filter');
            } else {
                this._showEmpty('No names available');
            }
            return;
        }

        // Count by type
        const counts = {};
        for (const n of this._filteredNames) {
            const info = TYPE_INFO[n.type];
            const label = info?.label || n.type;
            counts[label] = (counts[label] || 0) + 1;
        }

        // Build count string
        const parts = Object.entries(counts)
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .map(([label, count]) => `${count} ${label}`);
        this._count.textContent = parts.join(', ');

        this._list.innerHTML = '';

        for (const name of this._filteredNames) {
            const div = document.createElement('div');
            div.className = 'name-row';

            const info = TYPE_INFO[name.type] || { color: 'var(--text-primary)' };

            div.innerHTML = `
                <span class="name-icon" style="color: ${info.color}">${escapeHtml(name.type)}</span>
                <span class="name-text" title="${escapeHtml(name.name)}">${escapeHtml(name.name)}</span>
                <span class="name-size">${name.size ? escapeHtml(name.size) : ''}</span>
                <span class="name-address">${escapeHtml(name.address)}</span>
            `;

            div.addEventListener('click', () => {
                this._selectName(name);
                this._seekToName(name);
            });

            this._list.appendChild(div);
        }
    }

    _selectName(name) {
        // Remove previous selection
        this._list.querySelectorAll('.name-row.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // Find and select this name
        const index = this._filteredNames.indexOf(name);
        const el = this._list.children[index];
        if (el) {
            el.classList.add('selected');
        }

        events.emit(Events.SELECTION_CHANGED, { type: 'name', data: name });
    }

    async _seekToName(name) {
        if (!this._api) return;

        const addr = name.address;
        if (!addr || addr === '0x' || addr === '0x0' || !/^0x[0-9a-fA-F]+$/.test(addr)) {
            console.warn(`[names-list] Invalid address for name "${name.name}": ${addr}`);
            return;
        }

        // For functions without a size, analyze them first so we can
        // record the size + xrefs in the database.
        if (name.type === 'f' && !name.size) {
            try {
                this._api.session.analyze_function(BigInt(addr));
                this.refresh();
            } catch (e) {
                console.warn('[names-list] analyze_function failed', e);
            }
        }

        await this._api.setSeek(addr);
    }
}

customElements.define('bint-names-list', BintNamesList);

export default BintNamesList;
