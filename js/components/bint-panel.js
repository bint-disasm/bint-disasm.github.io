/**
 * Base panel component with header, content, and collapse/close functionality.
 *
 * Usage:
 *   <bint-panel title="Disassembly" icon="code">
 *     <div>Panel content here</div>
 *   </bint-panel>
 *
 * Attributes:
 *   - title: Panel title text
 *   - icon: Icon character/emoji for the panel
 *   - closable: Whether panel can be closed (default: true)
 *   - collapsible: Whether panel can be collapsed (default: true)
 *   - collapsed: Whether panel is currently collapsed
 */

import { events, Events } from '../core/events.js';

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
            background: var(--bg-secondary);
            border: 1px solid var(--panel-border);
            overflow: hidden;
        }

        :host([collapsed]) {
            flex: 0 0 auto !important;
        }

        .header {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-sm);
            background: var(--panel-header-bg);
            border-bottom: 1px solid var(--border-subtle);
            cursor: grab;
            user-select: none;
        }

        .header:active {
            cursor: grabbing;
        }

        .icon {
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
            width: 16px;
            text-align: center;
        }

        .title {
            flex: 1;
            font-size: var(--font-size-sm);
            font-weight: 500;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .actions {
            display: flex;
            gap: 2px;
        }

        .btn {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            border-radius: 3px;
            color: var(--text-secondary);
            font-size: 12px;
            cursor: pointer;
            padding: 0;
        }

        .btn:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
        }

        .btn-close:hover {
            background: var(--accent-error);
            color: white;
        }

        .content {
            flex: 1;
            overflow: auto;
            min-height: 0;
            display: flex;
            flex-direction: column;
        }

        :host([collapsed]) .content {
            display: none;
        }

        ::slotted(*) {
            flex: 1;
            min-height: 0;
        }

        /* Inline header slot — hosts components that want to live
         * next to the panel title (e.g. tab strips, mode toggles).
         * Sits between the title and the right-side actions; sized
         * to its content rather than expanding to fill. */
        .header-slot {
            display: flex;
            align-items: center;
            margin-left: var(--space-md);
            flex: 0 0 auto;
            min-height: 0;
        }
        ::slotted([slot="header"]) {
            flex: 0 0 auto;
            min-height: 0;
        }
    </style>

    <div class="header">
        <span class="icon"></span>
        <span class="title"></span>
        <slot name="header" class="header-slot"></slot>
        <div class="actions">
            <button class="btn btn-collapse" title="Collapse">-</button>
            <button class="btn btn-close" title="Close">x</button>
        </div>
    </div>
    <div class="content">
        <slot></slot>
    </div>
`;

export class BintPanel extends HTMLElement {
    static get observedAttributes() {
        return ['panel-title', 'icon', 'collapsed', 'closable', 'collapsible'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._titleEl = this.shadowRoot.querySelector('.title');
        this._iconEl = this.shadowRoot.querySelector('.icon');
        this._collapseBtn = this.shadowRoot.querySelector('.btn-collapse');
        this._closeBtn = this.shadowRoot.querySelector('.btn-close');
        this._header = this.shadowRoot.querySelector('.header');

        this._collapseBtn.addEventListener('click', () => this.toggleCollapse());
        this._closeBtn.addEventListener('click', () => this.close());

        // Drag handling for docking
        this._header.addEventListener('mousedown', (e) => this._onDragStart(e));
    }

    connectedCallback() {
        this._updateTitle();
        this._updateIcon();
        this._updateButtons();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        switch (name) {
            case 'panel-title':
                this._updateTitle();
                break;
            case 'icon':
                this._updateIcon();
                break;
            case 'collapsed':
                this._updateCollapseButton();
                break;
            case 'closable':
            case 'collapsible':
                this._updateButtons();
                break;
        }
    }

    get panelTitle() {
        return this.getAttribute('panel-title') || '';
    }

    set panelTitle(value) {
        this.setAttribute('panel-title', value);
    }

    get icon() {
        return this.getAttribute('icon') || '';
    }

    set icon(value) {
        this.setAttribute('icon', value);
    }

    get collapsed() {
        return this.hasAttribute('collapsed');
    }

    set collapsed(value) {
        if (value) {
            this.setAttribute('collapsed', '');
        } else {
            this.removeAttribute('collapsed');
        }
    }

    get closable() {
        return !this.hasAttribute('closable') || this.getAttribute('closable') !== 'false';
    }

    get collapsible() {
        return !this.hasAttribute('collapsible') || this.getAttribute('collapsible') !== 'false';
    }

    toggleCollapse() {
        this.collapsed = !this.collapsed;
        this._updateCollapseButton();
        // Dispatch event so parent can adjust layout
        this.dispatchEvent(new CustomEvent('panel-collapse-changed', {
            bubbles: true,
            detail: { panel: this, collapsed: this.collapsed }
        }));
    }

    close() {
        this.dispatchEvent(new CustomEvent('panel-close', { bubbles: true }));
        events.emit(Events.PANEL_CLOSED, { panel: this, title: this.panelTitle });
        this.remove();
    }

    _updateTitle() {
        this._titleEl.textContent = this.panelTitle;
    }

    _updateIcon() {
        this._iconEl.textContent = this.icon;
        this._iconEl.style.display = this.icon ? '' : 'none';
    }

    _updateCollapseButton() {
        this._collapseBtn.textContent = this.collapsed ? '+' : '-';
        this._collapseBtn.title = this.collapsed ? 'Expand' : 'Collapse';
    }

    _updateButtons() {
        this._collapseBtn.style.display = this.collapsible ? '' : 'none';
        this._closeBtn.style.display = this.closable ? '' : 'none';
    }

    _onDragStart(e) {
        // Only start drag from header chrome, not buttons or any
        // slotted header content (tab strips etc.). Slotted nodes
        // live in the light DOM, so the click target won't be inside
        // this shadow root — bail when we get a foreign element.
        if (e.target.closest('.btn')) return;
        if (e.composedPath().some((n) => n instanceof Element && n.slot === 'header')) {
            return;
        }

        this.dispatchEvent(new CustomEvent('panel-drag-start', {
            bubbles: true,
            detail: { panel: this, startX: e.clientX, startY: e.clientY }
        }));
    }
}

customElements.define('bint-panel', BintPanel);

export default BintPanel;
