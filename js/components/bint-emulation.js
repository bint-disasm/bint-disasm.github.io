/**
 * Emulation panel component.
 *
 * Lives in the bottom-right Tools panel alongside Strings. Drives
 * bint's symbolic / concrete CPU emulator:
 *   - Init button creates a fresh state seeded at the current seek
 *   - State dropdown switches between live emulation states (each
 *     fork lands here after a `emu fork` or a symbolic branch)
 *   - Register table shows the active state's general registers
 *   - Symbols list tracks named symbolic variables we've created
 *     (bint doesn't expose a list-symbols API yet, so we shadow them
 *     client-side)
 *   - "+ Symbol" opens a modal to mint a new symbol and optionally
 *     write it into a register or memory address
 */

import { events, Events } from '../core/events.js';
import { escapeHtml } from '../utils/format.js';
import { asIndex } from '../core/wasm-api.js';

const template = document.createElement('template');
template.innerHTML = `
    <style>
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
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-sm);
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-subtle);
        }

        .run-bar {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-sm);
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
        }
        .run-inputs {
            display: flex;
            gap: var(--space-sm);
            flex: 1;
            min-width: 0;
        }
        .run-inputs label {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
            flex: 1;
            min-width: 0;
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
        }
        .run-inputs input {
            flex: 1;
            min-width: 0;
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            padding: 2px var(--space-xs);
            font-family: inherit;
            font-size: inherit;
        }
        .run-inputs input::placeholder { color: var(--text-muted); }

        button.action {
            font-family: inherit;
            font-size: inherit;
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            padding: 2px var(--space-sm);
            cursor: pointer;
        }
        button.action:hover { background: var(--bg-hover); }
        button.action.primary {
            border-color: var(--accent-primary);
            color: var(--accent-primary);
        }
        button.action:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        /* Style the checkbox as a flat toggle button to match the
         * surrounding .action buttons (Init / + Symbol). The native
         * input is hidden and we render the label itself as the
         * clickable surface; :has(input:checked) flips its colors
         * to the accent palette so the toggle reads as on/off. */
        .solve-toggle {
            display: inline-flex;
            align-items: center;
            font-family: inherit;
            font-size: inherit;
            line-height: 1;
            color: var(--text-secondary);
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            padding: 2px var(--space-sm);
            cursor: pointer;
            user-select: none;
            transition: color var(--transition-fast),
                        background var(--transition-fast),
                        border-color var(--transition-fast);
        }
        .solve-toggle:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
        }
        .solve-toggle input {
            /* Visually hidden but still accessible to keyboard /
             * screen readers — checkbox semantics intact. */
            position: absolute;
            opacity: 0;
            pointer-events: none;
            width: 0;
            height: 0;
        }
        .solve-toggle:has(input:checked) {
            color: var(--accent-primary);
            border-color: var(--accent-primary);
            background: var(--bg-primary);
        }
        .solve-toggle:focus-within {
            outline: 1px solid var(--accent-primary);
            outline-offset: 1px;
        }

        select.states {
            font-family: inherit;
            font-size: inherit;
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            padding: 2px var(--space-xs);
            min-width: 0;
            flex: 1;
        }

        .body {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-xs) var(--space-sm);
            background: var(--bg-secondary);
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-bottom: 1px solid var(--border-subtle);
            position: sticky;
            top: 0;
            z-index: 1;
        }

        .reg-grid {
            display: grid;
            /* name | value | seek-btn */
            grid-template-columns: minmax(60px, max-content) 1fr min-content;
            column-gap: var(--space-sm);
            align-items: center;
        }
        .reg-seek {
            background: transparent;
            color: var(--text-secondary);
            border: 1px solid var(--border-color);
            border-radius: 2px;
            padding: 0 6px;
            margin-right: var(--space-xs);
            cursor: pointer;
            font-family: inherit;
            font-size: var(--font-size-xs);
            line-height: 1.4;
        }
        .reg-seek:hover {
            color: var(--accent-primary);
            border-color: var(--accent-primary);
            background: var(--bg-primary);
        }
        .reg-name {
            color: var(--color-register);
            padding: 2px var(--space-sm);
            border-right: 1px solid var(--border-subtle);
        }
        .reg-value {
            color: var(--color-number);
            padding: 0;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .reg-value input {
            width: 100%;
            background: transparent;
            color: inherit;
            border: 1px solid transparent;
            border-radius: 2px;
            padding: 1px var(--space-sm);
            font-family: inherit;
            font-size: inherit;
            font-variant-numeric: tabular-nums;
        }
        .reg-value input:hover {
            border-color: var(--border-color);
            background: var(--bg-primary);
        }
        .reg-value input:focus {
            border-color: var(--accent-primary);
            background: var(--bg-primary);
            outline: none;
        }
        .reg-value input.dirty {
            border-color: var(--accent-warning);
        }
        .reg-row {
            display: contents;
        }
        .reg-row:hover .reg-name,
        .reg-row:hover .reg-value {
            background: var(--bg-hover);
        }

        .sym-row {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: 2px var(--space-sm);
            border-bottom: 1px solid var(--border-subtle);
        }
        .sym-name { color: var(--color-function); }
        .sym-bits { color: var(--text-muted); font-size: var(--font-size-xs); }
        .sym-row .solve-btn {
            margin-left: auto;
            font-family: inherit;
            font-size: var(--font-size-xs);
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            padding: 0 var(--space-xs);
            cursor: pointer;
        }
        .sym-row .solve-btn:hover { background: var(--bg-hover); }

        .section-actions {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
        }
        .link-btn {
            background: transparent;
            color: var(--accent-primary);
            border: none;
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
            padding: 0;
            text-decoration: underline;
        }
        .link-btn:hover { color: var(--text-primary); }

        #constraints pre {
            margin: 0;
            padding: var(--space-sm);
            background: var(--bg-primary);
            color: var(--text-secondary);
            font-family: inherit;
            font-size: var(--font-size-xs);
            white-space: pre;
            overflow-x: auto;
            max-height: 300px;
            overflow-y: auto;
            border-bottom: 1px solid var(--border-subtle);
        }
        .sym-result {
            color: var(--color-string);
            font-size: var(--font-size-xs);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
            min-width: 0;
        }
        .sym-result.unsat { color: var(--accent-error); }

        .empty, .loading {
            color: var(--text-muted);
            padding: var(--space-md);
            text-align: center;
            font-size: var(--font-size-xs);
        }

        /* Modal — local to this component's shadow root since the
         * outer modal container is in bint-app's shadow DOM and
         * unreachable from here. */
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .modal-overlay.open { display: flex; }
        .modal {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: var(--space-lg);
            min-width: 320px;
            box-shadow: var(--panel-shadow);
        }
        .modal-title {
            color: var(--text-primary);
            font-weight: bold;
            margin-bottom: var(--space-md);
        }
        .modal-row {
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin-bottom: var(--space-sm);
        }
        .modal-row label {
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
        }
        .modal-row input {
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            padding: 4px var(--space-xs);
            font-family: inherit;
            font-size: inherit;
        }
        .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: var(--space-sm);
            margin-top: var(--space-md);
        }
        .modal-error {
            color: var(--accent-error);
            font-size: var(--font-size-xs);
            margin-top: var(--space-xs);
        }
    </style>

    <div class="toolbar">
        <button type="button" class="action primary" id="btn-init" title="Initialize state at current seek">Init</button>
        <select class="states" id="state-select">
            <option value="">No state</option>
        </select>
        <button type="button" class="action" id="btn-new-symbol" title="Create a new symbolic value">+ Symbol</button>
        <label class="solve-toggle" title="Solve symbolic bytes against the path's constraints when rendering hex">
            <input type="checkbox" id="solve-symbolic" />
            <span>Solve hex</span>
        </label>
    </div>
    <div class="run-bar">
        <button type="button" class="action" id="btn-step" title="Execute a single instruction in the active state">Step</button>
        <button type="button" class="action primary" id="btn-run" title="Run from active state's PC until halt / avoid / max-steps">Run</button>
        <div class="run-inputs">
            <label>
                <span>Halt at</span>
                <input type="text" id="halt-input" placeholder="0x401000, 0x401234" autocomplete="off" />
            </label>
            <label>
                <span>Avoid</span>
                <input type="text" id="avoid-input" placeholder="0x401050" autocomplete="off" />
            </label>
            <label>
                <span>Merge</span>
                <input type="text" id="merge-input" placeholder="0x401080" autocomplete="off" />
            </label>
        </div>
    </div>
    <div class="body">
        <div class="section-header">
            <span>Symbols</span>
            <span id="sym-count"></span>
        </div>
        <div id="symbols">
            <div class="empty">No symbols</div>
        </div>
        <div class="section-header">
            <span>Constraints</span>
            <span class="section-actions">
                <span id="constraint-count"></span>
                <button type="button" class="link-btn" id="btn-toggle-constraints" hidden>view</button>
            </span>
        </div>
        <div id="constraints">
            <div class="empty">No constraints — path is unconditionally SAT</div>
        </div>
        <div class="section-header">
            <span>Registers</span>
            <span id="reg-count"></span>
        </div>
        <div id="registers">
            <div class="empty">No state — click Init</div>
        </div>
    </div>

    <div class="modal-overlay" id="modal">
        <div class="modal">
            <div class="modal-title">New symbolic value</div>
            <div class="modal-row">
                <label>Name</label>
                <input type="text" id="sym-name-input" placeholder="flag" autocomplete="off" />
            </div>
            <div class="modal-row">
                <label>Bits</label>
                <input type="number" id="sym-bits-input" value="64" min="1" max="4096" />
            </div>
            <div class="modal-row">
                <label>Write to (optional — register name or 0xADDRESS)</label>
                <input type="text" id="sym-target-input" placeholder="rdi  or  0x20000" autocomplete="off" />
            </div>
            <div class="modal-error" id="sym-error" hidden></div>
            <div class="modal-actions">
                <button type="button" class="action" id="btn-cancel">Cancel</button>
                <button type="button" class="action primary" id="btn-create">Create</button>
            </div>
        </div>
    </div>
`;

export class BintEmulation extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._api = null;
        this._active = false;
        this._symbols = []; // {name, bits} — shadowed client-side
        // Currently-targeted emulation state index for the hex view's
        // memory dispatcher. `null` = "No state" (read from the
        // session memory layer); a number = read from that state's
        // overlay. Driven by the state dropdown.
        this._currentTarget = null;

        this._btnInit = this.shadowRoot.getElementById('btn-init');
        this._btnNewSymbol = this.shadowRoot.getElementById('btn-new-symbol');
        this._btnStep = this.shadowRoot.getElementById('btn-step');
        this._btnRun = this.shadowRoot.getElementById('btn-run');
        this._btnToggleConstraints = this.shadowRoot.getElementById('btn-toggle-constraints');
        this._stateSelect = this.shadowRoot.getElementById('state-select');
        this._solveCheckbox = this.shadowRoot.getElementById('solve-symbolic');
        this._solveCheckbox.addEventListener('change', () => {
            events.emit(Events.HEX_SOLVE_TOGGLED, { solve: this._solveCheckbox.checked });
        });
        this._haltInput = this.shadowRoot.getElementById('halt-input');
        this._avoidInput = this.shadowRoot.getElementById('avoid-input');
        this._mergeInput = this.shadowRoot.getElementById('merge-input');
        this._constraintCount = this.shadowRoot.getElementById('constraint-count');
        this._constraintsContainer = this.shadowRoot.getElementById('constraints');
        this._constraintsExpanded = false;
        this._regContainer = this.shadowRoot.getElementById('registers');
        this._symContainer = this.shadowRoot.getElementById('symbols');
        this._regCount = this.shadowRoot.getElementById('reg-count');
        this._symCount = this.shadowRoot.getElementById('sym-count');

        this._modal = this.shadowRoot.getElementById('modal');
        this._symNameInput = this.shadowRoot.getElementById('sym-name-input');
        this._symBitsInput = this.shadowRoot.getElementById('sym-bits-input');
        this._symTargetInput = this.shadowRoot.getElementById('sym-target-input');
        this._symError = this.shadowRoot.getElementById('sym-error');
        this._btnCreate = this.shadowRoot.getElementById('btn-create');
        this._btnCancel = this.shadowRoot.getElementById('btn-cancel');

        this._btnInit.addEventListener('click', () => this._initState());
        this._btnNewSymbol.addEventListener('click', () => this._openModal());
        this._btnStep.addEventListener('click', () => this._stepState());
        this._btnRun.addEventListener('click', () => this._runState());
        this._btnToggleConstraints.addEventListener('click', () => this._toggleConstraints());
        this._stateSelect.addEventListener('change', () => this._selectState());
        this._btnCancel.addEventListener('click', () => this._closeModal());
        this._btnCreate.addEventListener('click', () => this._createSymbol());
        this._modal.addEventListener('click', (e) => {
            if (e.target === this._modal) this._closeModal();
        });

        events.on(Events.BINARY_LOADED, () => {
            this._currentTarget = null;
            events.emit(Events.MEMORY_VIEW_TARGET_CHANGED, { stateIndex: null });
            // Wipe symbols on a new binary — emulation states get
            // reset by the wasm session implicitly when load_binary
            // re-creates the underlying Session.
            this._symbols = [];
            this._renderRegisters([]);
            this._renderSymbols();
            this._refreshStates();
        });

        // Pick up breakpoint toggles from the disassembly view — the
        // halt/avoid circles next to each row drive the same input
        // boxes the user could have typed into directly. We replace
        // the box contents wholesale so the disasm-view Sets stay
        // the single source of truth; users who want bespoke values
        // can still type in additional addresses afterward.
        events.on(Events.BREAKPOINTS_CHANGED, ({ halts, avoids, merges }) => {
            this._haltInput.value = (halts || []).join(', ');
            this._avoidInput.value = (avoids || []).join(', ');
            this._mergeInput.value = (merges || []).join(', ');
        });
    }

    setAPI(api) {
        this._api = api;
    }

    /** Called by bint-app when the Tools tab toggles. We refresh on
     *  becoming visible so the panel reflects state changes made via
     *  the console between visits. */
    setActive(active) {
        this._active = active;
        if (active) this.refresh();
    }

    async refresh() {
        if (!this._api) return;
        if (!(await this._api.hasBinary())) return;
        this._refreshStates();
        this._renderSymbols();
    }

    // -------------------------------------------------------------------
    // State + register fetch
    // -------------------------------------------------------------------

    _refreshStates() {
        if (!this._api?.session?.emu_states) return;
        try {
            const out = this._api.session.emu_states();
            const states = out?.states || [];
            this._stateSelect.innerHTML = '';
            // Always include a "No state" option at the top, even
            // when emulation states exist. Selecting it points the
            // hex view back at the session memory layer (the
            // default) without losing the states themselves — the
            // user can come back to any of them in this dropdown.
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.textContent = 'No state';
            // Selected by default when nothing is "active", or when
            // the user has previously switched to no-state via this
            // dropdown.
            if (states.length === 0 || this._currentTarget === null) {
                noneOpt.selected = true;
            }
            this._stateSelect.appendChild(noneOpt);

            if (states.length === 0) {
                this._renderRegisters([]);
                return;
            }
            for (const s of states) {
                const opt = document.createElement('option');
                // State indices come back as BigInt at the wasm
                // boundary (usize via serde-wasm-bindgen). Normalise
                // to Number — they're small in practice and Number
                // is what `_currentTarget` and the dropdown <option>
                // value compare cleanly against.
                const idxNum = asIndex(s.index);
                opt.value = String(idxNum);
                const pcHex = '0x' + BigInt(s.pc).toString(16);
                opt.textContent = `[${idxNum}] ${pcHex} ${s.status}`;
                // Only mark a state as the dropdown's selected entry
                // when the user has explicitly targeted it — otherwise
                // "No state" stays selected and reads pass through.
                if (
                    this._currentTarget !== null
                    && this._currentTarget === idxNum
                ) {
                    opt.selected = true;
                }
                this._stateSelect.appendChild(opt);
            }
            this._refreshRegisters();
        } catch (e) {
            console.warn('[emulation] emu_states failed', e);
        }
    }

    _refreshRegisters() {
        if (!this._api?.session?.emu_registers) return;
        try {
            const out = this._api.session.emu_registers(false);
            this._renderRegisters(out?.registers || []);
        } catch (e) {
            // Pre-init or no active state — render empty.
            this._renderRegisters([]);
        }
        this._refreshConstraints();
    }

    /**
     * Pull the active path's accumulated constraints. Renders just
     * the count by default — clicking "view" expands the SMT-LIB
     * dump inline. Refreshed alongside registers so users see the
     * constraint count grow as Step / Run progress.
     */
    _refreshConstraints() {
        if (!this._api?.session?.emu_constraints) return;
        try {
            const out = this._api.session.emu_constraints();
            const count = out?.count ?? 0;
            this._lastConstraintsSmt = out?.smtlib || '';
            if (count === 0) {
                this._constraintCount.textContent = '';
                this._btnToggleConstraints.hidden = true;
                this._constraintsContainer.innerHTML =
                    '<div class="empty">No constraints — path is unconditionally SAT</div>';
                this._constraintsExpanded = false;
                return;
            }
            this._constraintCount.textContent = `${count}`;
            this._btnToggleConstraints.hidden = false;
            this._btnToggleConstraints.textContent = this._constraintsExpanded ? 'hide' : 'view';
            if (this._constraintsExpanded) {
                this._renderConstraints();
            } else {
                this._constraintsContainer.innerHTML = `
                    <div class="empty">${count} constraint(s) on the active path — click view to inspect SMT-LIB</div>
                `;
            }
        } catch (e) {
            // Pre-init / no active state.
            this._constraintCount.textContent = '';
            this._btnToggleConstraints.hidden = true;
            this._constraintsContainer.innerHTML =
                '<div class="empty">No constraints — path is unconditionally SAT</div>';
        }
    }

    _renderConstraints() {
        const pre = document.createElement('pre');
        pre.textContent = this._lastConstraintsSmt || '';
        this._constraintsContainer.innerHTML = '';
        this._constraintsContainer.appendChild(pre);
    }

    _toggleConstraints() {
        this._constraintsExpanded = !this._constraintsExpanded;
        this._btnToggleConstraints.textContent = this._constraintsExpanded ? 'hide' : 'view';
        if (this._constraintsExpanded) {
            this._renderConstraints();
        } else {
            this._refreshConstraints();
        }
    }

    _stepState() {
        if (!this._api?.session?.emu_step) return;
        try {
            this._api.session.emu_step(1);
            // Step keeps the same active state; refresh registers
            // (PC will have advanced) and constraints (a symbolic
            // branch step adds a constraint).
            this._refreshRegisters();
        } catch (e) {
            console.warn('[emulation] emu_step failed', e);
        }
    }

    _renderRegisters(regs) {
        if (!regs.length) {
            this._regContainer.innerHTML = '<div class="empty">No state — click Init</div>';
            this._regCount.textContent = '';
            return;
        }
        this._regCount.textContent = `${regs.length}`;
        const grid = document.createElement('div');
        grid.className = 'reg-grid';
        for (const r of regs) {
            const row = document.createElement('div');
            row.className = 'reg-row';
            // value comes back as BigInt via serde-wasm-bindgen (u64
            // → BigInt with `serialize_large_number_types_as_bigints`).
            const hex = '0x' + BigInt(r.value).toString(16);
            const nameSpan = document.createElement('span');
            nameSpan.className = 'reg-name';
            nameSpan.textContent = r.name;
            const valueWrap = document.createElement('span');
            valueWrap.className = 'reg-value';
            const input = document.createElement('input');
            input.type = 'text';
            input.spellcheck = false;
            input.value = hex;
            input.dataset.original = hex;
            input.dataset.regName = r.name;
            // Mark dirty when the user has typed something different
            // from the last-written value, so they can see at a glance
            // which inputs are unsaved.
            input.addEventListener('input', () => {
                input.classList.toggle('dirty', input.value.trim() !== input.dataset.original);
            });
            // Commit on Enter or blur — the only edits we send. Esc
            // reverts. emu_set is called for each commit so the user
            // can edit several registers in sequence.
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._commitRegisterEdit(input);
                } else if (e.key === 'Escape') {
                    input.value = input.dataset.original;
                    input.classList.remove('dirty');
                    input.blur();
                }
            });
            input.addEventListener('blur', () => {
                if (input.classList.contains('dirty')) {
                    this._commitRegisterEdit(input);
                }
            });
            valueWrap.appendChild(input);
            // Seek button — jump the disasm/hex panels to the
            // address currently held in this register. Hidden until
            // the row is hovered to keep the table tight; clicking
            // never affects emulation state, only the seek address.
            const seekBtn = document.createElement('button');
            seekBtn.type = 'button';
            seekBtn.className = 'reg-seek';
            seekBtn.title = `Seek to ${r.name}`;
            seekBtn.textContent = '→';
            // Without `preventDefault` on mousedown the input loses
            // focus when the click starts, which fires the input's
            // blur-commit path and rebuilds the entire register
            // grid before the click event can land — the seek
            // button gets destroyed mid-click and the handler
            // never runs. Suppressing the focus shift keeps the
            // current row alive long enough for click to fire.
            seekBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
            });
            seekBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this._api?.setSeek) return;
                // Use the input's *current* value so an unsaved edit
                // is honoured — saves a dirty-commit step when the
                // user types in an address and just wants to jump
                // there. Falls back to the canonical hex if the
                // input is empty.
                const raw = input.value.trim() || hex;
                this._api.setSeek(raw).catch((err) => {
                    console.warn('[emulation] setSeek failed', err);
                });
            });
            row.appendChild(nameSpan);
            row.appendChild(valueWrap);
            row.appendChild(seekBtn);
            grid.appendChild(row);
        }
        this._regContainer.innerHTML = '';
        this._regContainer.appendChild(grid);
    }

    _commitRegisterEdit(input) {
        if (!this._api?.session?.emu_set) return;
        const name = input.dataset.regName;
        const value = input.value.trim();
        if (!name || !value) return;
        try {
            this._api.session.emu_set(name, value);
            input.classList.remove('dirty');
            input.dataset.original = value;
            // Refresh so the canonical hex form (and any side-effects
            // like flag-register updates) lands in the table.
            this._refreshRegisters();
        } catch (e) {
            console.warn(`[emulation] emu_set ${name}=${value} failed`, e);
            // Revert the input on failure so the user sees the
            // unchanged register value.
            input.value = input.dataset.original;
            input.classList.remove('dirty');
        }
    }

    _renderSymbols() {
        if (!this._symbols.length) {
            this._symContainer.innerHTML = '<div class="empty">No symbols</div>';
            this._symCount.textContent = '';
            return;
        }
        this._symCount.textContent = `${this._symbols.length}`;
        this._symContainer.innerHTML = '';
        for (const s of this._symbols) {
            const row = document.createElement('div');
            row.className = 'sym-row';
            const nameEl = document.createElement('span');
            nameEl.className = 'sym-name';
            nameEl.textContent = s.name;
            const bitsEl = document.createElement('span');
            bitsEl.className = 'sym-bits';
            bitsEl.textContent = `${s.bits} bits`;
            const resultEl = document.createElement('span');
            resultEl.className = 'sym-result';
            if (s.result) {
                resultEl.textContent = s.result;
                if (s.unsat) resultEl.classList.add('unsat');
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'solve-btn';
            btn.textContent = 'Solve';
            btn.title = `Solve the active path's constraints for ${s.name}`;
            btn.addEventListener('click', () => this._solveSymbol(s.name));
            row.appendChild(nameEl);
            row.appendChild(bitsEl);
            row.appendChild(resultEl);
            row.appendChild(btn);
            this._symContainer.appendChild(row);
        }
    }

    _solveSymbol(name) {
        if (!this._api?.session?.emu_solve) return;
        const sym = this._symbols.find((s) => s.name === name);
        if (!sym) return;
        try {
            const out = this._api.session.emu_solve(name);
            if (out?.unsat) {
                sym.result = 'UNSAT';
                sym.unsat = true;
            } else {
                // Show both forms when the symbol decoded to a
                // printable string ("flag" / "password" patterns):
                // the user wants to see the readable form *and* the
                // raw bytes in case some chars are subtly off (e.g.
                // a single non-printable byte can hint at off-by-one
                // in the constraint). Hex-only when it's clearly not
                // a string. The wasm side gives us both.
                const hex = out?.hex || '';
                const str = out?.string || '';
                const isPrintable = str && /^[\x20-\x7e]+$/.test(str);
                sym.result = isPrintable
                    ? (hex ? `"${str}" (${hex})` : `"${str}"`)
                    : hex || '(empty)';
                sym.unsat = false;
            }
        } catch (e) {
            sym.result = `error: ${e.message || e}`;
            sym.unsat = true;
        }
        this._renderSymbols();
    }

    // -------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------

    async _initState() {
        if (!this._api?.session?.emu_init) return;
        try {
            const seek = this._api.getSeek
                ? await this._api.getSeek()
                : 0n;
            const seekBig = typeof seek === 'bigint' ? seek : BigInt(seek || 0);
            const out = this._api.session.emu_init(seekBig);
            // Auto-target the freshly-initialised state in the hex
            // view — typical UX expectation. The user can still go
            // back to the session memory layer at any time via the
            // dropdown's "No state" entry.
            const newIdx = asIndex(out?.state_index);
            this._currentTarget = newIdx;
            events.emit(Events.MEMORY_VIEW_TARGET_CHANGED, { stateIndex: newIdx });
            this._refreshStates();
        } catch (e) {
            console.warn('[emulation] emu_init failed', e);
        }
    }

    /**
     * Parse a comma-separated list of address tokens (hex with or
     * without `0x`, decimal) into BigInt values. Empty / unparseable
     * tokens are dropped. Used for the halt + avoid inputs.
     */
    _parseAddressList(text) {
        if (!text) return [];
        const out = [];
        for (const raw of text.split(',')) {
            const tok = raw.trim();
            if (!tok) continue;
            try {
                const v = tok.toLowerCase().startsWith('0x')
                    ? BigInt(tok)
                    : /^[0-9]+$/.test(tok)
                        ? BigInt(tok)
                        : BigInt('0x' + tok);
                out.push(v);
            } catch {
                console.warn(`[emulation] could not parse address token: ${tok}`);
            }
        }
        return out;
    }

    _runState() {
        if (!this._api?.session?.emu_run) return;
        const halts = this._parseAddressList(this._haltInput.value);
        const avoids = this._parseAddressList(this._avoidInput.value);
        const merges = this._parseAddressList(this._mergeInput.value);
        try {
            // max_steps undefined → wasm side picks the default 10000.
            // wasm-bindgen accepts BigUint64Array for Vec<u64>.
            const haltsArr = new BigUint64Array(halts);
            const avoidsArr = new BigUint64Array(avoids);
            const mergesArr = new BigUint64Array(merges);
            const out = this._api.session.emu_run(undefined, haltsArr, avoidsArr, mergesArr);
            console.log('[emulation] emu_run', out);
            // After running, the path forks into terminal states.
            // Auto-target the first one (index 0 — the engine resets
            // its active index there in `replace_emu_states`) so the
            // hex view, register table, and constraints viewer all
            // jump to a real path's state without the user having to
            // pick from the dropdown. They can still pick "No state"
            // or any other terminal path afterward.
            const states = this._api.session.emu_states?.()?.states || [];
            if (states.length > 0) {
                const firstIdx = asIndex(states[0].index);
                this._currentTarget = firstIdx;
                events.emit(Events.MEMORY_VIEW_TARGET_CHANGED, { stateIndex: firstIdx });
            } else {
                this._currentTarget = null;
                events.emit(Events.MEMORY_VIEW_TARGET_CHANGED, { stateIndex: null });
            }
            this._refreshStates();
        } catch (e) {
            console.warn('[emulation] emu_run failed', e);
        }
    }

    _selectState() {
        const v = this._stateSelect.value;
        if (v === '') {
            // "No state" — point the hex view back at the session
            // memory layer. We don't touch the underlying emu state
            // selection (the engine still has an "active" state for
            // step/run); this is purely a memory-view toggle.
            this._currentTarget = null;
            this._renderRegisters([]);
            this._refreshConstraints();
            events.emit(Events.MEMORY_VIEW_TARGET_CHANGED, { stateIndex: null });
            return;
        }
        if (!this._api?.session?.emu_select) return;
        const idx = parseInt(v, 10);
        if (Number.isNaN(idx)) return;
        try {
            this._api.session.emu_select(idx);
            this._currentTarget = idx;
            this._refreshRegisters();
            // Tell the hex view to read from this state's layered
            // memory instead of the session's memory layer.
            events.emit(Events.MEMORY_VIEW_TARGET_CHANGED, { stateIndex: idx });
        } catch (e) {
            console.warn('[emulation] emu_select failed', e);
        }
    }

    _openModal() {
        this._symError.hidden = true;
        this._symError.textContent = '';
        this._symNameInput.value = '';
        this._symBitsInput.value = '64';
        this._symTargetInput.value = '';
        this._modal.classList.add('open');
        this._symNameInput.focus();
    }

    _closeModal() {
        this._modal.classList.remove('open');
    }

    _showModalError(msg) {
        this._symError.textContent = msg;
        this._symError.hidden = false;
    }

    _createSymbol() {
        if (!this._api?.session?.emu_symbol) {
            this._showModalError('emu API unavailable');
            return;
        }
        const name = this._symNameInput.value.trim();
        const bits = parseInt(this._symBitsInput.value, 10);
        const target = this._symTargetInput.value.trim();
        if (!name) {
            this._showModalError('Name is required');
            return;
        }
        if (!bits || bits < 1) {
            this._showModalError('Bits must be ≥ 1');
            return;
        }

        try {
            this._api.session.emu_symbol(name, bits);
            // Track client-side; bint has no list-symbols API yet.
            if (!this._symbols.find((s) => s.name === name)) {
                this._symbols.push({ name, bits });
            }
            // Optional second step: write the symbol into a register
            // or memory address. `emu_set` accepts the symbol name as
            // the value — same path the `emulate set` command uses.
            if (target) {
                try {
                    this._api.session.emu_set(target, name);
                } catch (e) {
                    this._showModalError(`Created '${name}' but write failed: ${e.message || e}`);
                    this._renderSymbols();
                    this._refreshRegisters();
                    return;
                }
            }
            this._renderSymbols();
            this._refreshRegisters();
            this._closeModal();
        } catch (e) {
            this._showModalError(`emu_symbol failed: ${e.message || e}`);
        }
    }
}

customElements.define('bint-emulation', BintEmulation);

export default BintEmulation;
