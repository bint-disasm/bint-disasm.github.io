/**
 * Disassembly view component.
 *
 * Displays disassembled instructions with syntax highlighting.
 */

import { events, Events } from '../core/events.js';
import { formatAddress, formatBytes, formatInstruction, escapeHtml } from '../utils/format.js';

/**
 * Apply register / number / label syntax highlighting to a fragment of
 * operand text. Used for the parts of an operand string that *aren't*
 * inside an `OperandRef` span — refs already get their own clickable
 * styling so they shouldn't be re-tokenised.
 */
function highlightOperandTokens(text) {
    return escapeHtml(text)
        .replace(/\b(0x[0-9a-fA-F]+)\b/g, '<span class="number">$1</span>')
        .replace(/\b(\d+)\b/g, '<span class="number">$1</span>')
        .replace(
            /\b(rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|rip|r\d+[bwd]?|eax|ebx|ecx|edx|esi|edi|esp|ebp|eip|ax|bx|cx|dx|al|ah|bl|bh|cl|ch|dl|dh|x\d+|w\d+|sp|lr|pc|fp|xzr|wzr|cs|ds|es|fs|gs|ss)\b/gi,
            '<span class="register">$1</span>',
        );
}

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
            font-size: var(--font-size-xs);
            line-height: 1.6;
            height: 100%;
            min-height: 0;
        }

        /* Linear / Graph mode buttons used to live in a toolbar
         * here. They've been hoisted into the panel header (driven
         * via this component's public setMode() method) so the
         * disasm view content can use the full vertical space. */

        .container {
            padding: var(--space-sm);
            flex: 1 1 auto;
            min-height: 0;
            overflow: auto;
        }

        /* --- graph mode --- */
        .graph-viewport {
            position: relative;
            width: 100%;
            height: 100%;
            overflow: hidden;
            cursor: grab;
            background:
                radial-gradient(circle, var(--border-subtle) 1px, transparent 1px) 0 0 / 24px 24px;
            /* Block native pan/zoom so a finger drag stays a graph
             * pan instead of scrolling the page or pinch-zooming
             * the whole document on mobile. */
            touch-action: none;
        }
        .graph-viewport.panning { cursor: grabbing; }

        .graph-world {
            position: absolute;
            top: 0;
            left: 0;
            transform-origin: 0 0;
        }

        .graph-edges {
            position: absolute;
            top: 0;
            left: 0;
            overflow: visible;
            pointer-events: none;
        }

        .graph-node {
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
            white-space: nowrap;
            padding: 4px 6px;
        }
        .graph-node.entry {
            border-color: var(--accent-primary, #4a9eff);
        }
        .graph-node.current {
            box-shadow: 0 0 0 2px var(--accent-primary, #4a9eff);
        }

        .graph-node .node-row {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .graph-node .node-bp {
            display: inline-flex;
            align-items: center;
            cursor: pointer;
            user-select: none;
            padding-right: 2px;
        }
        .graph-node .node-addr {
            color: var(--color-address);
            cursor: pointer;
        }
        .graph-node .node-addr:hover {
            text-decoration: underline;
        }
        .graph-node .node-disasm {
            white-space: pre;
        }

        .edge {
            fill: none;
            stroke-width: 1.5;
        }
        .edge.unconditional { stroke: var(--text-secondary, #888); }
        .edge.true          { stroke: #4caf50; }
        .edge.false         { stroke: #e57373; }
        .edge.fallthrough   { stroke: var(--text-muted, #666); }
        .edge.call_return   { stroke: var(--text-muted, #666); stroke-dasharray: 4 3; }

        .loading {
            color: var(--text-muted);
            padding: var(--space-lg);
            text-align: center;
        }

        .empty {
            color: var(--text-muted);
            padding: var(--space-lg);
            text-align: center;
        }

        table {
            border-collapse: collapse;
            width: 100%;
        }

        tr {
            border-bottom: 1px solid var(--border-subtle);
        }

        tr:hover {
            background: var(--bg-hover);
        }

        tr.current {
            background: var(--bg-tertiary);
            box-shadow: inset 3px 0 0 var(--color-accent, #4a9eff);
        }

        td {
            padding: 2px var(--space-sm);
            vertical-align: top;
        }

        /* Breakpoint marker column. Each instruction gets a small
         * circle the user can click to mark it as a symex halt
         * (orange — keeps a path that reaches it), avoid (red —
         * drops a path that reaches it), or merge (blue — collapses
         * converging paths at the named PC). State cycles: empty →
         * halt → avoid → merge → empty. The Emulation panel keeps
         * its halt/avoid/merge input boxes in sync via the
         * BREAKPOINTS_CHANGED event. */
        .col-bp {
            width: 14px;
            padding: 4px 0 4px var(--space-sm);
            cursor: pointer;
            user-select: none;
        }
        /* Circles are rendered in two contexts (linear table + graph
         * nodes). Keep the color rules unscoped so the same .halt /
         * .avoid / .merge classes paint both. Literal hex over CSS
         * variables to remove any chance of theme tokens drifting
         * out from under us. */
        .bp-circle {
            display: inline-block;
            width: 9px;
            height: 9px;
            border: 1px solid var(--border-color);
            border-radius: 50%;
            background: transparent;
            vertical-align: middle;
            opacity: 0.4;
            transition: opacity var(--transition-fast),
                        background var(--transition-fast);
        }
        tr:hover .bp-circle, .graph-node:hover .bp-circle { opacity: 1; }
        /* Halt — orange. Same hue as the address column so users
         * see "this address is on the keep-list" at a glance. */
        .bp-circle.halt {
            background: #ffa657;
            border-color: #ffa657;
            opacity: 1;
        }
        /* Avoid — red. Path is dropped entirely. */
        .bp-circle.avoid {
            background: #f85149;
            border-color: #f85149;
            opacity: 1;
        }
        /* Merge — blue. Converging paths get collapsed at the PC. */
        .bp-circle.merge {
            background: #58a6ff;
            border-color: #58a6ff;
            opacity: 1;
        }

        .col-label {
            color: var(--color-label);
            font-weight: 500;
            width: 1%;
            white-space: nowrap;
        }

        .col-address {
            color: var(--color-address);
            width: 1%;
            white-space: nowrap;
            cursor: pointer;
        }

        .col-address:hover {
            text-decoration: underline;
        }

        .col-bytes {
            color: var(--color-bytes);
            width: 1%;
            white-space: nowrap;
            letter-spacing: 0.5px;
        }

        @media (max-width: 768px), (pointer: coarse) and (max-width: 1024px) {
            /* Bytes column eats too much horizontal real estate on
             * a phone — and the disassembly text is what people
             * actually want to read. Hide it under the breakpoint. */
            .col-bytes {
                display: none;
            }
        }

        .col-instruction {
            white-space: nowrap;
        }

        .col-comment {
            color: var(--color-comment);
            font-style: italic;
        }

        .separator {
            height: 8px;
            border-bottom: 1px dashed var(--border-color);
        }

        .mnemonic {
            color: var(--color-mnemonic);
            font-weight: 500;
        }

        .register {
            color: var(--color-register);
        }

        .number {
            color: var(--color-number);
        }

        /* Generic clickable address span. Every operand ref (call
         * target, branch target, data pointer, …) gets one so the
         * user can navigate to anywhere the disassembly mentions an
         * address. The kind-specific subclass picks a color from the
         * theme palette so functions, plain symbols, and unresolved
         * hex all read distinctly. */
        .ref-target {
            cursor: pointer;
            text-decoration: none;
        }
        .ref-target:hover {
            text-decoration: underline;
        }
        .ref-function {
            color: var(--color-function);
        }
        .ref-symbol {
            color: var(--color-label);
        }
        .ref-address {
            color: var(--color-number);
        }

    </style>

    <div class="container">
        <div class="empty">No binary loaded</div>
    </div>
`;

export class BintDisassembly extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._container = this.shadowRoot.querySelector('.container');
        this._api = null;
        this._currentAddress = 0;
        this._mode = 'linear';

        // Symex breakpoints. Three `Set<string>`s of canonical
        // 0x-prefixed lowercase hex addresses; the per-row click
        // handler cycles addresses through halt → avoid → merge →
        // none and emits BREAKPOINTS_CHANGED so the Emulation panel
        // can sync its halt/avoid/merge input boxes. Cleared on
        // binary load.
        this._haltAddrs = new Set();
        this._avoidAddrs = new Set();
        this._mergeAddrs = new Set();

        // Mode toggle is driven externally now — bint-app renders
        // the Linear/Graph buttons in the panel header and calls
        // `setMode()` on this component.

        // Single delegated click handler for breakpoint columns —
        // works for both linear and graph rows that carry a
        // `data-bp-addr` attribute.
        this._container.addEventListener('click', (e) => {
            const bp = e.target.closest('[data-bp-addr]');
            if (!bp) return;
            e.stopPropagation();
            this._cycleBreakpoint(bp.dataset.bpAddr);
        });

        // Subscribe to events
        events.on(Events.BINARY_LOADED, () => {
            this._haltAddrs.clear();
            this._avoidAddrs.clear();
            this._mergeAddrs.clear();
            this._emitBreakpoints();
            this.refresh();
        });
        events.on(Events.SEEK_CHANGED, (addr) => {
            this._currentAddress = addr;
            this.refresh();
        });
        events.on(Events.MEMORY_MODIFIED, () => this.refresh());
    }

    /** Returns the CSS class for the breakpoint circle at `addr` —
     *  empty (no marker), `halt` (orange), `avoid` (red), or
     *  `merge` (blue). */
    _bpClassFor(addr) {
        const k = (addr || '').toLowerCase();
        if (this._haltAddrs.has(k)) return 'halt';
        if (this._avoidAddrs.has(k)) return 'avoid';
        if (this._mergeAddrs.has(k)) return 'merge';
        return '';
    }

    /** Cycle the breakpoint state for `addr`: empty → halt → avoid
     *  → merge → empty. Emits BREAKPOINTS_CHANGED with the full
     *  sets so the Emulation panel can reflect the change in its
     *  inputs. */
    _cycleBreakpoint(addr) {
        const k = (addr || '').toLowerCase();
        if (!k) return;
        if (this._haltAddrs.has(k)) {
            this._haltAddrs.delete(k);
            this._avoidAddrs.add(k);
        } else if (this._avoidAddrs.has(k)) {
            this._avoidAddrs.delete(k);
            this._mergeAddrs.add(k);
        } else if (this._mergeAddrs.has(k)) {
            this._mergeAddrs.delete(k);
        } else {
            this._haltAddrs.add(k);
        }
        // Update just the matching circles in place — avoids a full
        // table rebuild while clicking through several breakpoints.
        for (const el of this.shadowRoot.querySelectorAll(
            `[data-bp-addr="${CSS.escape(k)}"] .bp-circle`,
        )) {
            el.classList.remove('halt', 'avoid', 'merge');
            const cls = this._bpClassFor(k);
            if (cls) el.classList.add(cls);
        }
        this._emitBreakpoints();
    }

    _emitBreakpoints() {
        events.emit(Events.BREAKPOINTS_CHANGED, {
            halts: [...this._haltAddrs],
            avoids: [...this._avoidAddrs],
            merges: [...this._mergeAddrs],
        });
    }

    /** Switch between linear (table) and graph (CFG) rendering.
     *  Called by bint-app when the user clicks the Linear/Graph
     *  buttons in the panel header. No-op if the mode is already
     *  the requested one. */
    setMode(mode) {
        if (mode !== 'linear' && mode !== 'graph') return;
        if (this._mode === mode) return;
        this._mode = mode;
        this.refresh();
    }

    /** Returns the current mode ('linear' | 'graph'). */
    getMode() {
        return this._mode;
    }

    /**
     * Set the API instance.
     * @param {BintAPI} api
     */
    setAPI(api) {
        this._api = api;
    }

    /**
     * Refresh the disassembly view in whichever mode is currently active.
     */
    async refresh() {
        if (!this._api) {
            this._showEmpty('No API connected');
            return;
        }

        const hasBinary = await this._api.hasBinary();
        if (!hasBinary) {
            this._showEmpty('No binary loaded');
            return;
        }

        this._showLoading();

        try {
            this._currentAddress = await this._api.getSeek();
            if (this._mode === 'graph') {
                await this._refreshGraph();
            } else {
                await this._refreshLinear();
            }
        } catch (e) {
            console.error('[disassembly] error:', e);
            this._showEmpty(`Error: ${e}`);
        }
    }

    async _refreshLinear() {
        // disassemble() returns DisassemblyOutput { entries, … } natively
        // — entries are typed DisasmEntry objects (BigInt addresses,
        // Uint8Array bytes, structured branch_target). No JSON shape
        // detection needed.
        const addr = BigInt(this._currentAddress);
        let output;
        try {
            output = this._api.session.disassemble(addr);
        } catch (e) {
            this._showEmpty(`Error: ${e.message || e}`);
            return;
        }
        const entries = output?.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            this._showEmpty('No disassembly available');
            return;
        }
        // `lowercase` mirrors the asm.lowercase option. SLEIGH emits
        // uppercase by default; the table renderer downcases when this
        // flag is set, and we have to do the same on the JS side now
        // that we render the typed entries directly.
        this._renderEntries(entries, !!output.lowercase);
    }

    async _refreshGraph() {
        if (!window.dagre) {
            this._showEmpty('dagre not loaded');
            return;
        }
        // Snap to the containing function so the graph shows the WHOLE
        // function regardless of where the user is currently parked.
        // The block holding the original seek is what gets the "current"
        // highlight inside _renderGraph.
        let entry;
        try {
            entry = this._api.resolveFunctionEntry(this._currentAddress);
        } catch (e) {
            this._showEmpty('current address is not inside an analyzed function');
            return;
        }
        let output;
        try {
            output = this._api.session.analyze_function(entry);
        } catch (e) {
            this._showEmpty(`Error: ${e.message || e}`);
            return;
        }
        if (!output || !Array.isArray(output.blocks) || output.blocks.length === 0) {
            this._showEmpty('current address is not inside an analyzed function');
            return;
        }
        this._renderGraph(output);
    }

    /**
     * Seek to an address.
     * The SEEK_CHANGED event will trigger refresh automatically.
     * @param {string} address - Hex string like "0x1234"
     */
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

    /**
     * Render typed DisasmEntry objects directly. Replaces the previous
     * shape-detecting renderer; we now consume the native struct rather
     * than re-parsing flattened JSON.
     */
    _renderEntries(entries, lowercase) {
        const table = document.createElement('table');
        let currentRow = null;
        const seek = this._seekAsBigInt();

        // Format a 0x-prefixed lowercase hex address with no leading
        // zeros — matches what the rest of the UI passes through setSeek.
        const fmtAddr = (a) => '0x' + a.toString(16);
        const maybeLower = (s) => (lowercase ? s.toLowerCase() : s);

        for (const entry of entries) {
            if (entry.block_separator_before) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="6" class="separator"></td>';
                table.appendChild(tr);
            }

            const addrStr = fmtAddr(entry.address);
            const label = entry.label || '';
            // Comment column = user-set comment + auto-annotations
            // (e.g. string contents at referenced addresses) joined
            // by " ; " — same composition as the terminal renderer.
            const commentParts = [];
            if (entry.comment) commentParts.push(entry.comment);
            for (const a of entry.annotations || []) commentParts.push(a);
            const comment = commentParts.join(' ; ');
            const bytes = formatBytes(entry.bytes || []);

            // Render instruction HTML. Errors are shown as `invalid`.
            // Operand refs (computed Rust-side from a NameSpace lookup
            // over every hex address in the operand string) drive
            // both the symbol substitution and the per-span click
            // wiring — so `mov rdi, 0x4005c5` rendered as
            // `mov rdi, main` (clickable), and `call 0x400410` as
            // `call __libc_start_main` (also clickable). Lowercasing
            // happens before substitution so mangled names land in
            // their original case.
            let instructionHtml;
            if (entry.error) {
                instructionHtml = 'invalid';
            } else {
                instructionHtml = this._renderInstructionHtml(entry, lowercase);
            }

            const tr = document.createElement('tr');
            if (seek !== null && entry.address === seek) {
                tr.classList.add('current');
                currentRow = tr;
            }
            const bpCls = this._bpClassFor(addrStr);
            tr.innerHTML = `
                <td class="col-bp" data-bp-addr="${escapeHtml(addrStr)}">
                    <span class="bp-circle ${bpCls}"></span>
                </td>
                <td class="col-label">${escapeHtml(label)}</td>
                <td class="col-address" data-address="${escapeHtml(addrStr)}">${escapeHtml(addrStr)}</td>
                <td class="col-bytes">${escapeHtml(bytes)}</td>
                <td class="col-instruction">${instructionHtml}</td>
                <td class="col-comment">${comment ? '; ' + escapeHtml(comment) : ''}</td>
            `;

            tr.querySelector('.col-address').addEventListener('click', () => {
                this.seekTo(addrStr);
            });

            // Wire every operand ref — call/jump targets *and* data
            // pointers — to seek (and analyse, if the ref is a call).
            for (const refEl of tr.querySelectorAll('.ref-target')) {
                refEl.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const targetAddr = refEl.dataset.target;
                    const isCallTarget = refEl.dataset.isCall === 'true';
                    if (!targetAddr) return;
                    if (isCallTarget && this._api) {
                        // analyze_function is mutating — registers
                        // the function in the names DB so the next
                        // disasm at that address shows a label.
                        try {
                            this._api.session.analyze_function(BigInt(targetAddr));
                        } catch (err) {
                            console.warn('[disassembly] analyze_function failed', err);
                        }
                    }
                    this.seekTo(targetAddr);
                });
            }

            table.appendChild(tr);
        }

        this._container.innerHTML = '';
        this._container.appendChild(table);

        if (currentRow) {
            requestAnimationFrame(() => {
                currentRow.scrollIntoView({ block: 'center', behavior: 'auto' });
            });
        }
    }

    /**
     * Build an instruction's HTML from a typed `DisasmEntry`.
     *
     * The Rust side has already scanned every hex token in
     * `entry.operands` and emitted an `OperandRef` per address,
     * carrying the byte range, the resolved symbol name (if any), and
     * the kind ("func", "import", "var", …). We:
     *   1. Lowercase the raw `mnemonic operands` if asked.
     *   2. Walk the operand string, swapping ref ranges for clickable
     *      spans (with the symbol name substituted when present).
     *   3. Tokenise the in-between text for register / number coloring.
     */
    _renderInstructionHtml(entry, lowercase) {
        const mnemonic = entry.mnemonic || '';
        const rawOperands = entry.operands || '';
        const operands = lowercase ? rawOperands.toLowerCase() : rawOperands;
        const mnemHtml = `<span class="mnemonic">${escapeHtml(
            lowercase ? mnemonic.toLowerCase() : mnemonic,
        )}</span>`;

        if (!operands) return mnemHtml;

        const refs = (entry.operand_refs || [])
            .slice()
            .sort((a, b) => Number(a.start) - Number(b.start));

        let html = mnemHtml + ' ';
        let cursor = 0;
        for (const r of refs) {
            const s = Number(r.start);
            const e = Number(r.end);
            if (s < cursor || e > operands.length || s > e) continue;
            if (s > cursor) {
                html += highlightOperandTokens(operands.slice(cursor, s));
            }
            const refText = r.symbol ?? operands.slice(s, e);
            const cls = r.kind === 'func' || r.kind === 'import'
                ? 'ref-target ref-function'
                : r.symbol
                    ? 'ref-target ref-symbol'
                    : 'ref-target ref-address';
            const targetAttr = '0x' + BigInt(r.address).toString(16);
            html += `<span class="${cls}" data-target="${targetAttr}" data-is-call="${!!r.is_call}">${escapeHtml(refText)}</span>`;
            cursor = e;
        }
        if (cursor < operands.length) {
            html += highlightOperandTokens(operands.slice(cursor));
        }
        return html;
    }

    /**
     * Render a CFG of the function returned by `analyze function /j`.
     *
     * Layout pipeline:
     *   1. Insert all block nodes into a hidden container so the browser
     *      computes their natural sizes.
     *   2. Feed sizes + edges into dagre for top-to-bottom Sugiyama
     *      layout.
     *   3. Position nodes absolutely; draw edges as SVG paths between
     *      them, coloured by EdgeKind.
     *   4. Wrap everything in a pannable/zoomable viewport.
     */
    _renderGraph(funcOutput) {
        const blocks = funcOutput.blocks;

        // Build the viewport + world container. The world holds both
        // the SVG edge layer and the absolutely-positioned block nodes
        // so they share a single transform for pan/zoom.
        const viewport = document.createElement('div');
        viewport.className = 'graph-viewport';
        const world = document.createElement('div');
        world.className = 'graph-world';
        viewport.appendChild(world);

        const SVG_NS = 'http://www.w3.org/2000/svg';
        const edgeSvg = document.createElementNS(SVG_NS, 'svg');
        edgeSvg.setAttribute('class', 'graph-edges');
        world.appendChild(edgeSvg);

        // Block start (hex string) → DOM node. We key dagre nodes by
        // the same string so the round-trip stays straightforward.
        const nodeByAddr = new Map();
        // Find the block that CONTAINS the current seek (not just the
        // one starting at it) — the user might be parked mid-block.
        const seek = this._seekAsBigInt();
        const isCurrentBlock = (blk) => {
            if (seek === null) return false;
            return BigInt(blk.start) <= seek && seek < BigInt(blk.end);
        };

        let currentNode = null;
        let entryNode = null;

        for (const blk of blocks) {
            const addrHex = this._normalizeAddrHex(blk.start);
            const node = document.createElement('div');
            node.className = 'graph-node';
            if (blk.start === funcOutput.entry) {
                node.classList.add('entry');
                entryNode = node;
            }
            if (isCurrentBlock(blk)) {
                node.classList.add('current');
                currentNode = node;
            }

            // Render each instruction as one row: [address] [disasm].
            // The CFG endpoint now ships the same operand metadata the
            // linear view uses (mnemonic, operands, operand_refs,
            // annotations) so we can drive `_renderInstructionHtml`
            // off it and get symbol substitution + clickable address
            // spans inside graph nodes too. lowercase=false here —
            // the Rust side already lower-cased mnemonic/operands per
            // asm.lowercase before serializing.
            const rows = (blk.instructions || []).map((insn) => {
                const addr = '0x' + Number(insn.address).toString(16);
                const html = this._renderInstructionHtml(insn, false);
                const bpCls = this._bpClassFor(addr);
                return `
                    <div class="node-row">
                        <span class="node-bp" data-bp-addr="${escapeHtml(addr)}">
                            <span class="bp-circle ${bpCls}"></span>
                        </span>
                        <span class="node-addr" data-addr="${escapeHtml(addr)}">${escapeHtml(addr)}</span>
                        <span class="node-disasm">${html}</span>
                    </div>`;
            }).join('');
            node.innerHTML = rows;
            world.appendChild(node);
            nodeByAddr.set(addrHex, { dom: node, block: blk });
        }

        // Stage the viewport so we can measure node sizes.
        this._container.innerHTML = '';
        this._container.appendChild(viewport);

        // dagre layout.
        const g = new window.dagre.graphlib.Graph();
        g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 50, marginx: 20, marginy: 20 });
        g.setDefaultEdgeLabel(() => ({}));
        for (const [addr, { dom }] of nodeByAddr) {
            const rect = dom.getBoundingClientRect();
            g.setNode(addr, { width: rect.width, height: rect.height });
        }
        for (const [fromAddr, { block }] of nodeByAddr) {
            for (const edge of (block.successors || [])) {
                const toAddr = this._normalizeAddrHex(edge.target);
                if (!nodeByAddr.has(toAddr)) continue; // edge leaves the function
                g.setEdge(fromAddr, toAddr, { kind: edge.kind || 'unconditional' });
            }
        }
        window.dagre.layout(g);

        // Position nodes from layout output. dagre gives node centres,
        // so subtract half-width/half-height to get the top-left corner.
        let totalW = 0, totalH = 0;
        for (const addr of nodeByAddr.keys()) {
            const { dom } = nodeByAddr.get(addr);
            const n = g.node(addr);
            const x = n.x - n.width / 2;
            const y = n.y - n.height / 2;
            dom.style.left = `${x}px`;
            dom.style.top = `${y}px`;
            totalW = Math.max(totalW, x + n.width);
            totalH = Math.max(totalH, y + n.height);
        }

        // Edges. dagre gives a polyline of points between blocks; we
        // emit a smooth `M ... L ... L ...` path. An SVG <marker> at
        // the end gives us a directional arrowhead.
        edgeSvg.setAttribute('width', String(totalW + 20));
        edgeSvg.setAttribute('height', String(totalH + 20));
        const defs = document.createElementNS(SVG_NS, 'defs');
        for (const kind of ['unconditional', 'true', 'false', 'fallthrough', 'call_return']) {
            const marker = document.createElementNS(SVG_NS, 'marker');
            marker.setAttribute('id', `arrow-${kind}`);
            marker.setAttribute('viewBox', '0 0 10 10');
            marker.setAttribute('refX', '8');
            marker.setAttribute('refY', '5');
            marker.setAttribute('markerWidth', '6');
            marker.setAttribute('markerHeight', '6');
            marker.setAttribute('orient', 'auto-start-reverse');
            const tri = document.createElementNS(SVG_NS, 'path');
            tri.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
            tri.setAttribute('class', `edge ${kind}`);
            tri.setAttribute('stroke', 'none');
            tri.setAttribute('fill', 'context-stroke');
            marker.appendChild(tri);
            defs.appendChild(marker);
        }
        edgeSvg.appendChild(defs);

        for (const e of g.edges()) {
            const meta = g.edge(e);
            const points = meta.points;
            if (!points || points.length < 2) continue;
            const kind = meta.kind || 'unconditional';
            const d = points
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                .join(' ');
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('class', `edge ${kind}`);
            path.setAttribute('marker-end', `url(#arrow-${kind})`);
            edgeSvg.appendChild(path);
        }

        // Wire pan + zoom + click-to-seek. Pass the current block (or
        // entry, if no current) as the focal point — the initial paint
        // centres on it so the user sees where they are without
        // hunting around the graph.
        const focalNode = currentNode || entryNode;
        this._installGraphInteractions(viewport, world, nodeByAddr, totalW, totalH, focalNode);
    }

    _installGraphInteractions(viewport, world, nodeByAddr, contentW, contentH, focalNode) {
        let scale = 1;
        let tx = 0, ty = 0;

        const apply = () => {
            world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        };
        // Initial fit: centre the focal node (current block, or entry)
        // in the viewport. If we have no focal node — empty graph —
        // fall back to the simple "centre horizontally, top-pin"
        // behaviour.
        const fit = () => {
            const vw = viewport.clientWidth;
            const vh = viewport.clientHeight;
            if (focalNode) {
                // Block left/top were assigned via inline style during
                // layout; size comes from the rendered DOM. These are
                // world-space coordinates (pre-transform).
                const left = parseFloat(focalNode.style.left) || 0;
                const top = parseFloat(focalNode.style.top) || 0;
                const w = focalNode.offsetWidth;
                const h = focalNode.offsetHeight;
                const cx = left + w / 2;
                const cy = top + h / 2;
                tx = vw / 2 - cx * scale;
                ty = vh / 2 - cy * scale;
            } else {
                tx = Math.max(8, (vw - contentW) / 2);
                ty = 8;
            }
            apply();
        };
        requestAnimationFrame(fit);

        // Pan + pinch-zoom via pointer events. One active pointer
        // pans by translating the world; two active pointers pinch-
        // zoom around the midpoint between them, with the panning
        // delta of the midpoint also applied so the gesture feels
        // anchored to the user's fingers. Clickable elements
        // (.node-addr / .ref-target / .node-bp) still receive their
        // own click events because we don't preventDefault on a pointer
        // that landed on one — only on background drags.
        const activePointers = new Map(); // pointerId → {x, y}
        let lastCentroid = null;          // {x, y} — last frame's midpoint
        let lastPinchDist = null;         // last frame's |p1 - p2|

        const startedOnControl = (target) => !!(
            target.closest?.('.node-addr') ||
            target.closest?.('.ref-target') ||
            target.closest?.('.node-bp')
        );
        const centroidOf = () => {
            let x = 0, y = 0;
            for (const p of activePointers.values()) { x += p.x; y += p.y; }
            const n = activePointers.size;
            return { x: x / n, y: y / n };
        };
        const pinchDist = () => {
            const [a, b] = [...activePointers.values()];
            return Math.hypot(a.x - b.x, a.y - b.y);
        };

        viewport.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            // Ignore presses on interactive elements so click
            // handlers (seek-on-address, ref-target, breakpoint)
            // still fire normally. Capturing the pointer here would
            // also swallow those clicks.
            if (startedOnControl(e.target)) return;
            viewport.setPointerCapture(e.pointerId);
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (activePointers.size === 1) {
                viewport.classList.add('panning');
                lastCentroid = { x: e.clientX, y: e.clientY };
                lastPinchDist = null;
            } else if (activePointers.size === 2) {
                lastCentroid = centroidOf();
                lastPinchDist = pinchDist();
            }
            e.preventDefault();
        });

        viewport.addEventListener('pointermove', (e) => {
            if (!activePointers.has(e.pointerId)) return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (activePointers.size === 1) {
                const c = centroidOf();
                tx += c.x - lastCentroid.x;
                ty += c.y - lastCentroid.y;
                lastCentroid = c;
            } else if (activePointers.size >= 2) {
                const rect = viewport.getBoundingClientRect();
                const c = centroidOf();
                const d = pinchDist();
                if (lastPinchDist && lastPinchDist > 0) {
                    const factor = d / lastPinchDist;
                    const newScale = Math.max(0.2, Math.min(3, scale * factor));
                    const mx = c.x - rect.left;
                    const my = c.y - rect.top;
                    tx = mx - (mx - tx) * (newScale / scale);
                    ty = my - (my - ty) * (newScale / scale);
                    scale = newScale;
                }
                // Pan component: translate by the centroid delta.
                tx += c.x - lastCentroid.x;
                ty += c.y - lastCentroid.y;
                lastCentroid = c;
                lastPinchDist = d;
            }
            apply();
        });

        const endPointer = (e) => {
            if (!activePointers.has(e.pointerId)) return;
            activePointers.delete(e.pointerId);
            if (viewport.hasPointerCapture(e.pointerId)) {
                viewport.releasePointerCapture(e.pointerId);
            }
            if (activePointers.size === 0) {
                viewport.classList.remove('panning');
                lastCentroid = null;
                lastPinchDist = null;
            } else {
                // Re-anchor on the remaining pointer(s).
                lastCentroid = centroidOf();
                lastPinchDist = activePointers.size >= 2 ? pinchDist() : null;
            }
        };
        viewport.addEventListener('pointerup', endPointer);
        viewport.addEventListener('pointercancel', endPointer);

        // Wheel zoom around the cursor.
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = viewport.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newScale = Math.max(0.2, Math.min(3, scale * factor));
            // Keep the world point under the cursor stationary.
            tx = mx - (mx - tx) * (newScale / scale);
            ty = my - (my - ty) * (newScale / scale);
            scale = newScale;
            apply();
        }, { passive: false });

        // Click handling: row-address spans seek to that instruction;
        // operand-level `.ref-target` spans (call targets, data
        // pointers, etc.) seek to the referenced address and trigger
        // function analysis if the ref is a call. Same dispatch as
        // the linear view's per-row handler — kept here so we can
        // delegate via the viewport rather than wiring listeners on
        // every node.
        viewport.addEventListener('click', async (e) => {
            // Breakpoint circles are handled by the shared
            // `data-bp-addr` listener attached to `_container` —
            // the viewport sits inside that container so the event
            // bubbles up there. Skip it here so we don't also seek
            // when toggling a breakpoint.
            if (e.target.closest('.node-bp')) return;
            const refEl = e.target.closest('.ref-target');
            if (refEl) {
                e.stopPropagation();
                const targetAddr = refEl.dataset.target;
                const isCallTarget = refEl.dataset.isCall === 'true';
                if (!targetAddr) return;
                if (isCallTarget && this._api) {
                    try {
                        this._api.session.analyze_function(BigInt(targetAddr));
                    } catch (err) {
                        console.warn('[disassembly] analyze_function failed', err);
                    }
                }
                this.seekTo(targetAddr);
                return;
            }
            const addrEl = e.target.closest('.node-addr');
            if (!addrEl) return;
            const addr = addrEl.dataset.addr;
            if (addr) this.seekTo(addr);
        });
    }

    _seekAsBigInt() {
        const a = this._currentAddress;
        if (a === null || a === undefined || a === '') return null;
        if (typeof a === 'bigint') return a;
        try {
            return BigInt(a);
        } catch {
            return null;
        }
    }

    _normalizeAddrHex(addr) {
        if (typeof addr === 'number' || typeof addr === 'bigint') {
            return '0x' + addr.toString(16);
        }
        const s = String(addr).toLowerCase();
        if (s.startsWith('0x')) {
            const stripped = s.slice(2).replace(/^0+/, '') || '0';
            return '0x' + stripped;
        }
        // Decimal or other — fall back to BigInt parse.
        try {
            return '0x' + BigInt(s).toString(16);
        } catch {
            return s;
        }
    }
}

customElements.define('bint-disassembly', BintDisassembly);

export default BintDisassembly;
