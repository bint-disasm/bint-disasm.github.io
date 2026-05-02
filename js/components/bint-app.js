/**
 * Root application shell component.
 *
 * Handles:
 * - WASM initialization
 * - File loading (drag & drop, file picker)
 * - Layout management
 */

import { events, Events } from '../core/events.js';
import { getWasmAPI } from '../core/wasm-api.js';
import { formatAddress, formatFileSize } from '../utils/format.js';

// Import all components
import './bint-panel.js';
import './bint-console.js';
import './bint-disassembly.js';
import './bint-hex-view.js';
import './bint-decompile-view.js';
import './bint-names-list.js';
import './bint-xrefs.js';
import './bint-strings.js';
import './bint-emulation.js';

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
            height: 100vh;
            background: var(--bg-primary);
        }

        /* Header bar */
        .header {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            padding: var(--space-xs) var(--space-md);
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            user-select: none;
        }

        /* Logo glitch effect (synced with css/components/logo.css) */
        .logo {
            font-family: 'JetBrains Mono', monospace;
            font-weight: bold;
            color: #ff8c00;
            font-size: var(--font-size-lg);
            letter-spacing: 1px;
            position: relative;
            cursor: default;
        }

        .logo.animate-triggered {
            animation: logo-glitch 200ms steps(2) forwards;
        }

        .logo.animate-triggered::before,
        .logo.animate-triggered::after {
            content: "bin't";
            position: absolute;
            left: 0;
            top: 0;
            opacity: 0.8;
        }

        .logo.animate-triggered::before {
            color: #ffffff;
            animation: logo-glitch-shift 200ms steps(2) forwards;
            clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%);
        }

        .logo.animate-triggered::after {
            color: #ff6600;
            animation: logo-glitch-shift-reverse 200ms steps(2) forwards;
            clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%);
        }

        @keyframes logo-glitch {
            0% { transform: translate(0); }
            20% { transform: translate(-2px, 1px); }
            40% { transform: translate(2px, -1px); }
            60% { transform: translate(-1px, -1px); }
            80% { transform: translate(1px, 1px); }
            100% { transform: translate(0); }
        }

        @keyframes logo-glitch-shift {
            0% { transform: translate(0); }
            20% { transform: translate(2px, -1px); }
            40% { transform: translate(-3px, 1px); }
            60% { transform: translate(1px, 0); }
            80% { transform: translate(-2px, -1px); }
            100% { transform: translate(0); }
        }

        @keyframes logo-glitch-shift-reverse {
            0% { transform: translate(0); }
            20% { transform: translate(-2px, 1px); }
            40% { transform: translate(3px, 0); }
            60% { transform: translate(-1px, 1px); }
            80% { transform: translate(2px, -1px); }
            100% { transform: translate(0); }
        }

        .file-path {
            font-weight: 600;
            color: #58a6ff;
            font-size: var(--font-size-sm);
            margin-left: var(--space-lg);
            margin-right: var(--space-lg);
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .file-info {
            flex: 1;
            display: flex;
            align-items: center;
            gap: var(--space-md);
            color: var(--text-secondary);
            font-size: var(--font-size-sm);
            padding-left: var(--space-md);
            border-left: 1px solid var(--border-color);
        }

        .file-format {
            color: var(--text-primary);
        }

        .file-meta {
            color: var(--text-secondary);
        }

        .seek {
            color: var(--color-address);
            font-family: var(--font-mono);
        }

        .toolbar {
            display: flex;
            gap: var(--space-xs);
        }

        .toolbar button {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: var(--space-xs) var(--space-sm);
            font-family: var(--font-mono);
            font-size: var(--font-size-sm);
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .toolbar button:hover:not(:disabled) {
            background: var(--bg-hover);
            border-color: var(--accent-primary);
        }

        .toolbar button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .nav-buttons {
            display: flex;
            gap: 2px;
        }

        .nav-buttons button {
            padding: var(--space-xs);
            min-width: 28px;
        }

        /* Main content area - 5-column / 3-row grid with explicit
         * splitter tracks at each panel boundary. Splitters get a
         * 6px visible/hit track — wide enough to grab without a
         * separate invisible hit-area pseudo (which previously
         * overlapped the strings panel's sticky section header
         * and made it look like the divider was sitting on top of
         * panel content). */
        .main {
            --splitter-w: 6px;
            /* Sidebar default width. The mobile media query below
             * narrows this so phones don't lose half the screen to
             * the names panel before any user interaction. */
            --sidebar-w: 420px;
            flex: 1;
            display: grid;
            grid-template-columns:
                var(--sidebar-w) var(--splitter-w) minmax(0, 1fr) var(--splitter-w) minmax(0, 1fr);
            grid-template-rows:
                minmax(0, 1fr) var(--splitter-w) 300px;
            background: var(--bg-primary);
            overflow: hidden;
            min-height: 0;
        }

        @media (max-width: 768px) {
            .main {
                --sidebar-w: 200px;
            }
        }

        /* Coarse pointer = touchscreen / stylus. A 6px-wide splitter
         * is essentially impossible to land a fingertip on, so widen
         * it (and the corresponding grid track via --splitter-w) to
         * a finger-friendly hit target. The visible track is the
         * same size as the hit area so the user can see what they
         * grabbed. Mouse users still get the slim 6px line. */
        @media (pointer: coarse) {
            .main {
                --splitter-w: 10px;
            }
        }

        /* When hex panel is collapsed: drop the splitter and right
         * column from the grid template; the rest still resolves. */
        .main.hex-collapsed {
            grid-template-columns:
                var(--sidebar-w) var(--splitter-w) minmax(0, 1fr);
        }

        .main.hex-collapsed .right,
        .main.hex-collapsed .splitter-right {
            display: none;
        }

        .splitter {
            background: var(--border-subtle);
            user-select: none;
            /* Block native touch gestures (scroll/pinch) on the
             * splitter so a finger drag stays a drag instead of
             * scrolling the page on mobile. */
            touch-action: none;
        }
        .splitter:hover,
        .splitter.dragging {
            background: var(--accent-primary);
        }
        .splitter.col {
            cursor: col-resize;
            grid-row: 1 / -1;
        }
        .splitter.row {
            cursor: row-resize;
        }
        /* Splitter placement in the grid. */
        .splitter-sidebar { grid-column: 2; }
        .splitter-right   { grid-column: 4; grid-row: 1; }
        .splitter-bottom  { grid-column: 3 / -1; grid-row: 2; }

        /* Collapsed hex panel tab on the right edge */
        .hex-collapsed-tab {
            position: fixed;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            background: var(--bg-secondary);
            border: 1px solid var(--panel-border);
            border-right: none;
            border-radius: 4px 0 0 4px;
            padding: var(--space-sm) var(--space-xs);
            cursor: pointer;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
            display: none;
            z-index: var(--z-panel);
            gap: var(--space-xs);
        }

        .hex-collapsed-tab:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
        }

        .hex-collapsed-tab .tab-icon {
            font-weight: bold;
        }

        .hex-collapsed-tab.visible {
            display: flex;
            align-items: center;
        }

        .sidebar {
            grid-column: 1;
            grid-row: 1 / -1;
            background: var(--bg-primary);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            min-height: 0;
            gap: 1px;
        }

        .sidebar > bint-panel {
            flex: 1;
            min-height: 100px;
        }

        .sidebar > bint-panel[collapsed] {
            flex: 0 0 auto;
            min-height: auto;
        }

        .center {
            grid-column: 3;
            grid-row: 1;
            background: var(--bg-primary);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .center > bint-panel {
            flex: 1;
            min-height: 0;
        }

        .right {
            grid-column: 5;
            grid-row: 1;
            background: var(--bg-primary);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .right > bint-panel {
            flex: 1;
            min-height: 0;
        }

        /* Tab strip + view switcher inside the right panel.
           Lives in bint-app's shadow DOM (passed into bint-panel's
           slot), so styling it here is fine. bint-panel applies
           flex:1 to every slotted element, so we wrap the tabs+body
           in a single slotted container that expands, then lay out
           its children as flex internally. Without the wrapper, tabs
           and body would each get flex:1 and steal half the panel.  */
        .view-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 0;
            overflow: hidden;
        }
        .view-tabs {
            display: flex;
            gap: 0;
            border-bottom: 1px solid var(--border-subtle);
            background: var(--bg-secondary);
            flex-shrink: 0;
        }
        .view-tabs button {
            font-family: var(--font-mono);
            font-size: var(--font-size-xs);
            background: transparent;
            color: var(--text-secondary);
            border: none;
            border-bottom: 2px solid transparent;
            padding: var(--space-xs) var(--space-md);
            cursor: pointer;
        }
        .view-tabs button:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
        }
        .view-tabs button.active {
            color: var(--text-primary);
            border-bottom-color: var(--accent-primary);
        }

        /* Inline-tabs: same buttons but rendered into a panel
         * header slot rather than their own row. Drop the
         * background + bottom border so they sit cleanly next to
         * the title. */
        .view-tabs.inline-tabs {
            background: transparent;
            border-bottom: none;
        }
        .view-tabs.inline-tabs button {
            padding: 2px var(--space-sm);
        }
        .view-body {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .view-slot {
            flex: 1;
            min-height: 0;
            overflow: auto;
        }
        .view-slot[hidden] { display: none; }

        .bottom {
            grid-column: 3 / -1;
            grid-row: 3;
            background: var(--bg-primary);
            overflow: hidden;
            display: flex;
            flex-direction: row;
            min-height: 0;
            gap: 1px;
        }

        .bottom > bint-panel {
            flex: 1;
            min-height: 0;
        }

        .bottom > bint-panel[collapsed] {
            flex: 0 0 auto;
            min-width: auto;
        }

        /* Drop zone overlay */
        .drop-zone {
            position: fixed;
            inset: 0;
            background: rgba(88, 166, 255, 0.1);
            border: 3px dashed var(--accent-primary);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: var(--z-modal);
        }

        .drop-zone.active {
            display: flex;
        }

        .drop-message {
            background: var(--bg-secondary);
            padding: var(--space-xl);
            border-radius: 8px;
            text-align: center;
            color: var(--text-primary);
        }

        .drop-icon {
            font-size: 48px;
            margin-bottom: var(--space-md);
        }

        /* Loading overlay */
        .loading-overlay {
            position: fixed;
            inset: 0;
            background: rgba(13, 17, 23, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: var(--z-modal);
        }

        .loading-content {
            text-align: center;
            color: var(--text-primary);
        }

        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--border-color);
            border-top-color: var(--accent-primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto var(--space-md);
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* Status bar */
        .statusbar {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            padding: 2px var(--space-md);
            background: var(--bg-tertiary);
            border-top: 1px solid var(--border-color);
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
        }

        /* Mobile bottom tab bar — replaces the statusbar on phone-sized
         * screens. Hidden by default; the @media block below flips it
         * on. Each button maps to one of the four mobile views and
         * sets data-mobile-view on .main. */
        .mobile-tabs {
            display: none;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border-color);
        }
        .mobile-tabs button {
            flex: 1;
            background: none;
            border: none;
            color: var(--text-secondary);
            padding: 10px 4px;
            font-family: inherit;
            font-size: var(--font-size-xs);
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            border-top: 2px solid transparent;
        }
        .mobile-tabs button.active {
            color: var(--text-primary);
            border-top-color: var(--accent-primary);
            background: var(--bg-primary);
        }
        .mobile-tabs button .tab-icon {
            font-weight: bold;
            font-size: var(--font-size-sm);
            color: inherit;
        }

        /* ======================================================
         * Mobile single-panel layout. The desktop split-pane grid
         * is unusable on a phone — instead, show one panel at a
         * time and let the user switch via the bottom tab bar. The
         * .main element gets a data-mobile-view attribute set by JS
         * to pick which container is shown.
         * ====================================================== */
        @media (max-width: 768px) {
            /* Tighten the header — file metadata can wrap or wash
             * out, and the toolbar buttons are the only critical
             * controls. */
            .header {
                gap: var(--space-sm);
                padding: var(--space-xs);
                flex-wrap: wrap;
            }
            .file-path,
            .file-info {
                display: none;
            }

            /* Splitters and the desktop hex-collapsed-tab are
             * meaningless when each panel is its own page. */
            .splitter,
            .hex-collapsed-tab {
                display: none !important;
            }

            /* Replace the desktop statusbar with the mobile tab bar. */
            .statusbar { display: none; }
            .mobile-tabs { display: flex; }

            /* Drop the grid — each panel container floats over .main
             * and only the active one is visible. */
            .main {
                display: block;
                position: relative;
            }
            .main > .sidebar,
            .main > .center,
            .main > .right,
            .main > .bottom {
                position: absolute;
                inset: 0;
                display: none;
            }
            .main[data-mobile-view="names"] > .sidebar,
            .main[data-mobile-view="disasm"] > .center,
            .main[data-mobile-view="view"] > .right,
            .main[data-mobile-view="tools"] > .bottom {
                display: flex;
            }

            /* The desktop .main.hex-collapsed .right { display:none }
             * rule would otherwise hide the View tab — override it. */
            .main.hex-collapsed > .right {
                display: none;
            }
            .main.hex-collapsed[data-mobile-view="view"] > .right {
                display: flex;
            }

            /* Tools view: hide the Console (always the first panel
             * in .bottom) so only the Strings/Emulation tabbed
             * panel takes the screen. */
            .main[data-mobile-view="tools"] > .bottom > bint-panel:first-of-type {
                display: none;
            }
        }

        /* Modal overlay */
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            display: none;
            align-items: flex-start;
            justify-content: center;
            padding-top: 20vh;
            z-index: var(--z-modal);
        }

        .modal-overlay.active {
            display: flex;
        }

        .modal {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            min-width: 300px;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-sm) var(--space-md);
            border-bottom: 1px solid var(--border-color);
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
        }

        .modal-title {
            font-weight: 500;
            color: var(--text-primary);
        }

        .modal-shortcut {
            font-family: var(--font-mono);
            font-size: var(--font-size-xs);
            color: var(--text-muted);
        }

        .modal-body {
            padding: var(--space-md);
        }

        .modal-input {
            width: 100%;
            padding: var(--space-sm) var(--space-md);
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--text-primary);
            font-family: var(--font-mono);
            font-size: var(--font-size-sm);
            outline: none;
            box-sizing: border-box;
        }

        .modal-input:focus {
            border-color: var(--accent-primary);
        }

        .modal-input::placeholder {
            color: var(--text-muted);
        }

        .modal-hint {
            margin-top: var(--space-xs);
            font-size: var(--font-size-xs);
            color: var(--text-muted);
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
        }

        /* Help button */
        .btn-help {
            width: 24px;
            height: 24px;
            padding: 0;
            font-size: var(--font-size-sm);
            font-weight: bold;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Inserts a small gap between the file-action group
         * (Open / Save / Analyze) and the per-session controls
         * (Options / Help) at the right of the toolbar. */
        .toolbar-spacer {
            width: var(--space-md);
        }

        /* Options modal: wider than the default seek/rename modals
         * since option names are long (e.g. analysis.prescan_max_
         * total_instructions) and the per-row layout has both a
         * label and a control column. */
        #modal-options .modal {
            max-width: 720px;
            width: 90vw;
        }
        .options-list {
            display: flex;
            flex-direction: column;
            gap: var(--space-sm);
            max-height: 60vh;
            overflow-y: auto;
            padding: 0 var(--space-xs);
        }
        /* Two-column row: label flexes to fill the row, control
         * sits in a fixed 200px lane on the right so inputs and
         * checkboxes line up consistently across all rows.
         * Description spans the full row underneath. */
        .option-row {
            display: grid;
            grid-template-columns: 1fr 200px;
            grid-template-rows: auto auto;
            column-gap: var(--space-md);
            row-gap: 2px;
            align-items: center;
        }
        .option-row .option-name {
            font-family: var(--font-mono);
            color: var(--text-primary);
            word-break: break-word;
        }
        .option-row .option-control {
            display: flex;
            align-items: center;
            justify-content: flex-start;
        }
        .option-row .option-control input[type="text"],
        .option-row .option-control input[type="number"] {
            width: 100%;
            background: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            padding: 2px var(--space-xs);
            font-family: var(--font-mono);
            font-size: var(--font-size-sm);
        }
        .option-row .option-control input.dirty {
            border-color: var(--accent-warning);
        }
        .option-row .option-desc {
            grid-column: 1 / -1;
            color: var(--text-muted);
            font-size: var(--font-size-xs);
            padding-bottom: var(--space-xs);
            border-bottom: 1px solid var(--border-subtle);
        }

        /* Help modal specific styles */
        .help-content {
            max-height: 60vh;
            overflow-y: auto;
        }

        .shortcut-list {
            display: flex;
            flex-direction: column;
            gap: var(--space-sm);
        }

        .shortcut-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-xs) 0;
            border-bottom: 1px solid var(--border-subtle);
        }

        .shortcut-item:last-child {
            border-bottom: none;
        }

        .shortcut-desc {
            color: var(--text-primary);
            font-size: var(--font-size-sm);
        }

        .shortcut-key {
            font-family: var(--font-mono);
            font-size: var(--font-size-xs);
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: 3px;
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
        }
    </style>

    <div class="header">
        <span class="logo">bin't</span>
        <span class="file-path"></span>
        <div class="file-info">
            <span class="file-format"></span>
            <span class="file-meta"></span>
            <span class="seek"></span>
        </div>
        <div class="toolbar">
            <div class="nav-buttons">
                <button class="btn-back" disabled title="Go back (Alt+Left)">&lt;</button>
                <button class="btn-forward" disabled title="Go forward (Alt+Right)">&gt;</button>
            </div>
            <button class="btn-open">Open</button>
            <button class="btn-save" disabled>Save</button>
            <button class="btn-analyze" disabled>Analyze</button>
            <span class="toolbar-spacer"></span>
            <button class="btn-options" title="Configure options">Options</button>
            <button class="btn-help" title="Keyboard Shortcuts (?)">?</button>
        </div>
    </div>

    <div class="main">
        <div class="sidebar">
            <bint-panel panel-title="Names" icon="n" collapsible="true" closable="false">
                <bint-names-list></bint-names-list>
            </bint-panel>
            <bint-panel panel-title="Xrefs" icon="x" collapsible="true" closable="false" collapsed="true">
                <bint-xrefs></bint-xrefs>
            </bint-panel>
        </div>
        <div class="splitter col splitter-sidebar" data-resize="sidebar"></div>
        <div class="center">
            <bint-panel panel-title="Disassembly" icon="<>" collapsible="false" closable="false">
                <div class="view-tabs inline-tabs" slot="header" id="disasm-tabs">
                    <button type="button" data-disasm-mode="linear" class="active">Linear</button>
                    <button type="button" data-disasm-mode="graph">Graph</button>
                </div>
                <bint-disassembly></bint-disassembly>
            </bint-panel>
        </div>
        <div class="splitter col splitter-right" data-resize="right"></div>
        <div class="right">
            <bint-panel panel-title="View" icon="#" collapsible="true" closable="false" id="hex-panel">
                <div class="view-tabs inline-tabs" slot="header" id="view-tabs">
                    <button type="button" data-view="hex" class="active">Hex</button>
                    <button type="button" data-view="decompile">Decompile</button>
                </div>
                <div class="view-container">
                    <div class="view-body">
                        <div class="view-slot" data-view="hex">
                            <bint-hex-view></bint-hex-view>
                        </div>
                        <div class="view-slot" data-view="decompile" hidden>
                            <bint-decompile-view></bint-decompile-view>
                        </div>
                    </div>
                </div>
            </bint-panel>
        </div>
        <div class="splitter row splitter-bottom" data-resize="bottom"></div>
        <div class="bottom">
            <bint-panel panel-title="Console" icon=">" collapsible="true" closable="false">
                <bint-console></bint-console>
            </bint-panel>
            <bint-panel panel-title="Tools" icon="s" collapsible="true" closable="false" id="tools-panel">
                <div class="view-tabs inline-tabs" slot="header" id="tools-tabs">
                    <button type="button" data-tools-view="strings" class="active">Strings</button>
                    <button type="button" data-tools-view="emulation">Emulation</button>
                </div>
                <div class="view-container">
                    <div class="view-body">
                        <div class="view-slot" data-tools-view="strings">
                            <bint-strings></bint-strings>
                        </div>
                        <div class="view-slot" data-tools-view="emulation" hidden>
                            <bint-emulation></bint-emulation>
                        </div>
                    </div>
                </div>
            </bint-panel>
        </div>
    </div>

    <div class="hex-collapsed-tab" title="Show Hex View">
        <span class="tab-icon">#</span>
        <span>Hex</span>
    </div>

    <div class="statusbar">
        <span class="status-item status-mode">WASM</span>
        <span class="status-item status-arch">-</span>
        <span class="status-item status-version"></span>
    </div>

    <div class="mobile-tabs">
        <button type="button" data-mobile-view="disasm" class="active">
            <span class="tab-icon">&lt;&gt;</span>
            <span>Disasm</span>
        </button>
        <button type="button" data-mobile-view="names">
            <span class="tab-icon">n</span>
            <span>Names</span>
        </button>
        <button type="button" data-mobile-view="view">
            <span class="tab-icon">#</span>
            <span>View</span>
        </button>
        <button type="button" data-mobile-view="tools">
            <span class="tab-icon">s</span>
            <span>Tools</span>
        </button>
    </div>

    <div class="drop-zone">
        <div class="drop-message">
            <div class="drop-icon">+</div>
            <div>Drop binary file to load</div>
        </div>
    </div>

    <div class="loading-overlay">
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div>Initializing bin't...</div>
        </div>
    </div>

    <div class="modal-overlay" id="modal-seek">
        <div class="modal">
            <div class="modal-header">
                <span class="modal-title">Go to Address</span>
                <span class="modal-shortcut">Alt+G</span>
            </div>
            <div class="modal-body">
                <input type="text" class="modal-input" placeholder="0x..." autofocus>
                <div class="modal-hint">Enter address or symbol name</div>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="modal-rename">
        <div class="modal">
            <div class="modal-header">
                <span class="modal-title">Rename Function</span>
                <span class="modal-shortcut">Alt+N</span>
            </div>
            <div class="modal-body">
                <input type="text" class="modal-input" placeholder="function name" autofocus>
                <div class="modal-hint">Enter new name for function at current address</div>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="modal-help">
        <div class="modal">
            <div class="modal-header">
                <span class="modal-title">Keyboard Shortcuts</span>
                <span class="modal-shortcut">?</span>
            </div>
            <div class="modal-body help-content">
                <div class="shortcut-list"></div>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="modal-options">
        <div class="modal">
            <div class="modal-header">
                <span class="modal-title">Options</span>
            </div>
            <div class="modal-body">
                <div class="options-list"></div>
                <div class="modal-hint">Changes are applied immediately.</div>
            </div>
        </div>
    </div>
`;

export class BintApp extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        // UI elements
        this._logo = this.shadowRoot.querySelector('.logo');
        this._filePath = this.shadowRoot.querySelector('.file-path');
        this._fileFormat = this.shadowRoot.querySelector('.file-format');
        this._fileMeta = this.shadowRoot.querySelector('.file-meta');
        this._seek = this.shadowRoot.querySelector('.seek');
        this._btnBack = this.shadowRoot.querySelector('.btn-back');
        this._btnForward = this.shadowRoot.querySelector('.btn-forward');
        this._btnOpen = this.shadowRoot.querySelector('.btn-open');
        this._btnSave = this.shadowRoot.querySelector('.btn-save');
        this._btnAnalyze = this.shadowRoot.querySelector('.btn-analyze');
        this._dropZone = this.shadowRoot.querySelector('.drop-zone');
        this._loadingOverlay = this.shadowRoot.querySelector('.loading-overlay');
        this._statusArch = this.shadowRoot.querySelector('.status-arch');
        this._statusVersion = this.shadowRoot.querySelector('.status-version');

        // Track whether we're handling browser navigation (to avoid loops)
        this._handlingPopState = false;

        // Start logo glitch effect
        this._startLogoGlitch();

        // Components
        this._console = this.shadowRoot.querySelector('bint-console');
        this._disassembly = this.shadowRoot.querySelector('bint-disassembly');
        this._hexView = this.shadowRoot.querySelector('bint-hex-view');
        this._decompileView = this.shadowRoot.querySelector('bint-decompile-view');
        this._namesList = this.shadowRoot.querySelector('bint-names-list');
        this._xrefs = this.shadowRoot.querySelector('bint-xrefs');
        this._strings = this.shadowRoot.querySelector('bint-strings');
        this._emulation = this.shadowRoot.querySelector('bint-emulation');

        // Right-panel tab strip (Hex | Decompile).
        this._viewTabs = this.shadowRoot.getElementById('view-tabs');
        this._viewTabs.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-view]');
            if (!btn) return;
            this._selectRightView(btn.dataset.view);
        });

        // Bottom-right tools tab strip (Strings | Emulation).
        this._toolsTabs = this.shadowRoot.getElementById('tools-tabs');
        this._toolsTabs.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-tools-view]');
            if (!btn) return;
            this._selectToolsView(btn.dataset.toolsView);
        });

        // Center-panel disassembly mode tabs (Linear | Graph). The
        // tabs live in the panel header now; clicking one drives
        // the disassembly component's public `setMode()` method.
        this._disasmTabs = this.shadowRoot.getElementById('disasm-tabs');
        this._disasmTabs.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-disasm-mode]');
            if (!btn) return;
            this._selectDisasmMode(btn.dataset.disasmMode);
        });

        // Layout elements
        this._main = this.shadowRoot.querySelector('.main');
        this._hexPanel = this.shadowRoot.querySelector('#hex-panel');
        this._hexCollapsedTab = this.shadowRoot.querySelector('.hex-collapsed-tab');

        // Wire panel-resize splitters (sidebar/center boundary,
        // center/right boundary, top-row/bottom boundary). Must run
        // after `this._main` is grabbed.
        this._wireSplitters();

        // Modal elements
        this._modalSeek = this.shadowRoot.querySelector('#modal-seek');
        this._modalSeekInput = this._modalSeek.querySelector('.modal-input');
        this._modalRename = this.shadowRoot.querySelector('#modal-rename');
        this._modalRenameInput = this._modalRename.querySelector('.modal-input');
        this._modalHelp = this.shadowRoot.querySelector('#modal-help');
        this._shortcutList = this._modalHelp.querySelector('.shortcut-list');
        this._btnHelp = this.shadowRoot.querySelector('.btn-help');
        this._modalOptions = this.shadowRoot.querySelector('#modal-options');
        this._optionsList = this._modalOptions.querySelector('.options-list');
        this._btnOptions = this.shadowRoot.querySelector('.btn-options');
        this._activeModal = null;

        // API
        this._api = null;

        // Store filename from File object (since backend doesn't provide it)
        this._loadedFilename = null;

        // Keyboard shortcuts registry (for future customization)
        this._shortcuts = [
            { key: 'ArrowLeft', alt: true, action: () => this._navigateBack(), description: 'Go back in history' },
            { key: 'ArrowRight', alt: true, action: () => this._navigateForward(), description: 'Go forward in history' },
            { key: 'g', alt: true, action: () => this._openSeekModal(), description: 'Go to address' },
            { key: 'n', alt: true, action: () => this._openRenameModal(), description: 'Rename function' },
            { key: '?', action: () => this._openHelpModal(), description: 'Show keyboard shortcuts' },
        ];

        // Listen for panel collapse events to adjust layout
        this.shadowRoot.addEventListener('panel-collapse-changed', (e) => {
            this._onPanelCollapseChanged(e);
        });

        // Mobile single-panel mode. The desktop split-pane layout is
        // unusable on a phone, so swap in a "one panel + bottom tab
        // bar" view via CSS. JS just maintains the data-mobile-view
        // attribute on `.main` and the `.active` class on the
        // matching tab button — the rest is media-query-driven.
        this._mobileTabs = this.shadowRoot.querySelector('.mobile-tabs');
        this._mobileTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-mobile-view]');
            if (!btn) return;
            this._setMobileView(btn.dataset.mobileView);
        });
        // Always seed the attribute — the CSS only acts on it under
        // the mobile @media query, but a viewport rotation that
        // crosses the breakpoint would otherwise land on a blank
        // .main with no container marked visible.
        this._setMobileView('disasm');

        // Click on collapsed hex tab to restore it
        this._hexCollapsedTab.addEventListener('click', () => {
            if (this._hexPanel && this._hexPanel.collapsed) {
                this._hexPanel.toggleCollapse();
            }
        });

        // Event handlers
        this._btnBack.addEventListener('click', () => this._navigateBack());
        this._btnForward.addEventListener('click', () => this._navigateForward());
        this._btnOpen.addEventListener('click', () => this._openFilePicker());
        this._btnSave.addEventListener('click', () => this._saveFile());
        if (this._btnAnalyze) {
            this._btnAnalyze.addEventListener('click', () => this._analyzeAll());
        }
        this._btnHelp.addEventListener('click', () => this._openHelpModal());
        this._btnOptions.addEventListener('click', () => this._openOptionsModal());

        // Keyboard shortcuts handler
        document.addEventListener('keydown', (e) => this._handleKeydown(e));

        // Modal event handlers
        this._setupModalHandlers();

        // Browser back/forward button handling
        window.addEventListener('popstate', (e) => this._onPopState(e));

        // Warn before leaving page if there's session state
        window.addEventListener('beforeunload', (e) => this._onBeforeUnload(e));

        // Drag and drop
        document.addEventListener('dragover', (e) => this._onDragOver(e));
        document.addEventListener('dragleave', (e) => this._onDragLeave(e));
        document.addEventListener('drop', (e) => this._onDrop(e));

        // Event subscriptions
        events.on(Events.SEEK_CHANGED, (addr) => this._onSeekChanged(addr));
        events.on(Events.BINARY_LOADED, (meta) => this._onBinaryLoaded(meta));
    }

    async connectedCallback() {
        await this._initWasm();
    }

    async _initWasm() {
        try {
            this._api = getWasmAPI();
            await this._api.init();

            // Connect API to components
            this._console.setAPI(this._api);
            this._disassembly.setAPI(this._api);
            if (this._hexView) this._hexView.setAPI(this._api);
            this._namesList.setAPI(this._api);
            if (this._xrefs) this._xrefs.setAPI(this._api);
            if (this._strings) this._strings.setAPI(this._api);
            if (this._emulation) this._emulation.setAPI(this._api);

            // Update status
            const version = await this._api.getVersion();
            this._statusVersion.textContent = `v${version}`;

            // Hide loading overlay
            this._loadingOverlay.style.display = 'none';

            // Showcase: if the page was opened with `?example=NAME[#addr]`,
            // fetch web/examples/NAME, load it, and seek to the hash addr.
            await this._maybeLoadExample();

        } catch (e) {
            console.error('Failed to initialize WASM:', e);
            this._loadingOverlay.querySelector('.loading-content').innerHTML = `
                <div style="color: var(--accent-error)">Failed to initialize bin't WASM</div>
                <div style="margin-top: var(--space-md)">${e}</div>
            `;
        }
    }

    _openFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this._loadFile(file);
            }
        };
        input.click();
    }

    /**
     * Wire the three panel splitters in the `.main` grid. Each
     * splitter listens for `mousedown`, captures the current track
     * sizes from `getComputedStyle(...).gridTemplateColumns/Rows`,
     * then on `mousemove` recomputes the affected tracks and writes
     * a fresh template back. `mouseup` stops the drag.
     *
     * Track layout (5 cols × 3 rows):
     *   columns: [sidebar | sp-side | center | sp-right | right]
     *   rows:    [top | sp-bottom | bottom]
     *
     * The three splitters drive different track adjustments:
     *   - sidebar splitter: column 0 (sidebar width)
     *   - right splitter:   columns 2 + 4 (center grows, right shrinks
     *     by the same amount; both kept fixed-px after first drag)
     *   - bottom splitter:  row 0 (top-row height) + row 2 (bottom)
     *
     * Min sizes (`MIN_PX`) keep panels from collapsing to nothing.
     */
    _wireSplitters() {
        const MIN_PX = 200;
        const main = this._main;
        if (!main) return;

        // Read current grid track sizes as numbers (parsed from
        // `getComputedStyle().gridTemplateColumns/Rows`).
        const readTracks = (axis) => {
            const cs = getComputedStyle(main);
            const value = axis === 'col'
                ? cs.gridTemplateColumns
                : cs.gridTemplateRows;
            return value.split(' ').map((v) => parseFloat(v));
        };

        // Write track sizes back as CSS, keeping the *fluid* track
        // expressed as `minmax(MIN_PX, 1fr)` so the grid reflows on
        // window resize. The fluid track differs per axis: for cols
        // it's the right panel (track 4 — last), for rows it's the
        // top panel (track 0 — first), since the bottom row is the
        // resizable fixed-height one. A fixed-px fluid track would
        // freeze the trailing panel at whatever size it had at drag
        // time and leave it clipped after a window resize.
        const writeTracks = (axis, tracks) => {
            const fluidIdx = axis === 'col' ? tracks.length - 1 : 0;
            const css = tracks
                .map((v, i) => (i === fluidIdx ? `minmax(${MIN_PX}px, 1fr)` : `${v}px`))
                .join(' ');
            if (axis === 'col') main.style.gridTemplateColumns = css;
            else main.style.gridTemplateRows = css;
        };

        const splitters = main.querySelectorAll('.splitter');
        for (const sp of splitters) {
            // Pointer events unify mouse + touch + pen. Capturing the
            // pointer on the splitter element means subsequent
            // pointermove/pointerup fire on the splitter even after
            // the finger/cursor leaves it — no need for window-level
            // listeners or a separate touch-event code path.
            sp.addEventListener('pointerdown', (e) => {
                if (e.button !== undefined && e.button !== 0) return;
                e.preventDefault();
                sp.setPointerCapture(e.pointerId);
                const which = sp.dataset.resize;
                const axis = sp.classList.contains('col') ? 'col' : 'row';
                const startX = e.clientX;
                const startY = e.clientY;
                const startTracks = readTracks(axis);
                sp.classList.add('dragging');
                document.body.style.cursor = axis === 'col' ? 'col-resize' : 'row-resize';

                const onMove = (ev) => {
                    // Each drag adjusts only the *fixed* tracks; the
                    // last track is held as 1fr by writeTracks and
                    // naturally absorbs whatever space is left. That
                    // means we just clamp the fixed track against the
                    // current container size — no manual partner
                    // bookkeeping, and the grid reflows on window
                    // resize because the trailing track is fluid.
                    const tracks = [...startTracks];
                    const splitter = tracks[1] || 6;
                    if (which === 'sidebar') {
                        const dx = ev.clientX - startX;
                        const W = main.clientWidth;
                        // Reserve splitters + center + at least MIN_PX
                        // for the right column.
                        const maxSidebar = W - 2 * splitter - tracks[2] - MIN_PX;
                        tracks[0] = Math.max(MIN_PX, Math.min(maxSidebar, startTracks[0] + dx));
                    } else if (which === 'right') {
                        const dx = ev.clientX - startX;
                        const W = main.clientWidth;
                        const maxCenter = W - tracks[0] - 2 * splitter - MIN_PX;
                        tracks[2] = Math.max(MIN_PX, Math.min(maxCenter, startTracks[2] + dx));
                    } else if (which === 'bottom') {
                        // Splitter is at the boundary between top
                        // (1fr) and bottom (fixed). Drag down → bottom
                        // shrinks; drag up → bottom grows.
                        const dy = ev.clientY - startY;
                        const H = main.clientHeight;
                        const maxBottom = H - splitter - MIN_PX;
                        tracks[2] = Math.max(MIN_PX, Math.min(maxBottom, startTracks[2] - dy));
                    }
                    writeTracks(axis, tracks);
                };

                const onUp = (ev) => {
                    sp.removeEventListener('pointermove', onMove);
                    sp.removeEventListener('pointerup', onUp);
                    sp.removeEventListener('pointercancel', onUp);
                    if (sp.hasPointerCapture(ev.pointerId)) {
                        sp.releasePointerCapture(ev.pointerId);
                    }
                    sp.classList.remove('dragging');
                    document.body.style.cursor = '';
                };
                sp.addEventListener('pointermove', onMove);
                sp.addEventListener('pointerup', onUp);
                sp.addEventListener('pointercancel', onUp);
            });
        }
    }

    /**
     * Pick which mobile container is visible. Toggles the
     * data-mobile-view attribute on .main (CSS does the actual
     * show/hide) and the .active class on the matching tab button.
     * On desktop, all tabs are hidden via media query — this is a
     * no-op visually so it's safe to call regardless of viewport.
     *
     * Notifies the decompile view when "view" is selected with the
     * decompile sub-tab active so it doesn't sit idle, and the
     * emulation panel similarly when "tools" is selected.
     */
    _setMobileView(view) {
        if (!this._main || !this._mobileTabs) return;
        this._main.dataset.mobileView = view;
        this._mobileTabs.querySelectorAll('button[data-mobile-view]').forEach((b) => {
            b.classList.toggle('active', b.dataset.mobileView === view);
        });
        // Wake the decompile / emulation panels when their slot
        // becomes visible, so they don't stay frozen on a stale
        // (or empty) render.
        if (view === 'view' && this._decompileView) {
            const decompActive = this.shadowRoot
                .querySelector('button[data-view="decompile"]')?.classList.contains('active');
            this._decompileView.setActive(!!decompActive);
        }
        if (view === 'tools' && this._emulation) {
            const emuActive = this.shadowRoot
                .querySelector('button[data-tools-view="emulation"]')?.classList.contains('active');
            this._emulation.setActive(!!emuActive);
        }
    }

    /**
     * Switch the right-panel tab between 'hex' and 'decompile'.
     * Notifies the decompile view via setActive() so it can kick off
     * (or suppress) decompilation work based on visibility.
     */
    _selectRightView(view) {
        const buttons = this._viewTabs.querySelectorAll('button[data-view]');
        buttons.forEach((b) => {
            b.classList.toggle('active', b.dataset.view === view);
        });
        const slots = this.shadowRoot.querySelectorAll('.view-slot[data-view]');
        slots.forEach((s) => {
            s.hidden = s.dataset.view !== view;
        });
        if (this._decompileView) {
            this._decompileView.setActive(view === 'decompile');
        }
    }

    /**
     * Switch the disassembly view between 'linear' and 'graph'.
     * The buttons live in the panel header; this both updates the
     * active state on them and calls the component's public
     * `setMode()` to re-render.
     */
    _selectDisasmMode(mode) {
        if (!this._disasmTabs) return;
        const buttons = this._disasmTabs.querySelectorAll('button[data-disasm-mode]');
        buttons.forEach((b) => {
            b.classList.toggle('active', b.dataset.disasmMode === mode);
        });
        if (this._disassembly && typeof this._disassembly.setMode === 'function') {
            this._disassembly.setMode(mode);
        }
    }

    /**
     * Switch the bottom-right tools tab between 'strings' and
     * 'emulation'. Notifies the emulation panel via setActive() so
     * it can refresh registers/states only while it's visible.
     */
    _selectToolsView(view) {
        const buttons = this._toolsTabs.querySelectorAll('button[data-tools-view]');
        buttons.forEach((b) => {
            b.classList.toggle('active', b.dataset.toolsView === view);
        });
        const slots = this.shadowRoot.querySelectorAll('.view-slot[data-tools-view]');
        slots.forEach((s) => {
            s.hidden = s.dataset.toolsView !== view;
        });
        if (this._emulation) {
            this._emulation.setActive(view === 'emulation');
        }
    }

    /**
     * If the URL carries `?example=NAME`, fetch `examples/NAME`
     * (relative to the page) and load it as if the user had
     * dropped it on the window. A `#0xADDR` fragment, if present,
     * triggers a seek after load completes. The name is restricted
     * to a single path component so a stray query param can't
     * coerce a fetch outside the examples dir.
     */
    async _maybeLoadExample() {
        const name = new URLSearchParams(window.location.search).get('example');
        if (!name) return;
        if (name.includes('/') || name.includes('\\') || name.startsWith('.')) {
            console.warn(`Refusing to load example with invalid name: ${name}`);
            return;
        }

        // Capture the hash *before* loading: BINARY_LOADED fires
        // _onSeekChanged(entry_point), which overwrites the URL hash
        // via pushState before this method's await on _loadFile resolves.
        const requestedHash = window.location.hash;

        try {
            const response = await fetch(`examples/${name}`);
            if (!response.ok) {
                console.warn(`Failed to fetch example ${name}: ${response.status}`);
                return;
            }
            const file = new File([await response.arrayBuffer()], name);
            await this._loadFile(file);

            if (requestedHash.startsWith('#0x')) {
                try {
                    await this._api.setSeek(requestedHash.slice(1));
                } catch (e) {
                    console.warn(`Example seek to ${requestedHash} failed: ${e}`);
                }
            }
        } catch (e) {
            console.error(`Failed to load example ${name}:`, e);
        }
    }

    async _loadFile(file) {
        if (!this._api) return;

        console.log(`Loading ${file.name}...`);

        // Strip query (e.g. `?example=ais3_crackme`) and hash so the URL
        // reflects the binary the user is *now* working with — otherwise
        // a reload after opening a different file would re-trigger the
        // example preloader. The BINARY_LOADED handler pushes a fresh
        // `#<entry_point>` hash a moment later via _onSeekChanged.
        history.replaceState(null, '', window.location.pathname);

        // If a binary is already loaded, swap in a fresh wasm Session so
        // the new file starts from a clean slate — no leftover analysis,
        // names, xrefs, or seek history. Multi-binary support will
        // replace this with proper isolation later.
        if (this._api.getCurrentMetadata()) {
            this._api.resetSession();
            // Tell components their cached state is gone so they clear
            // their views before the new BINARY_LOADED arrives.
            events.emit(Events.BINARY_UNLOADED);
        }

        // Store filename before loading (backend doesn't provide it back)
        this._loadedFilename = file.name;

        try {
            const data = new Uint8Array(await file.arrayBuffer());
            const metadata = await this._api.loadBinary(data, file.name);

            console.log(`Loaded: ${file.name} (${formatFileSize(file.size)})`);

        } catch (e) {
            console.error(`Failed to load file: ${e}`);
            // Clear filename on failure
            this._loadedFilename = null;
        }
    }

    async _analyzeAll() {
        if (!this._api) return;

        this._btnAnalyze.disabled = true;
        console.log('Analyzing binary...');

        try {
            const result = this._api.session.analyze_all();
            console.log('Analysis result:', result);

            // Refresh function list
            this._namesList.refresh();

            events.emit(Events.ANALYSIS_COMPLETE);

        } catch (e) {
            console.error(`Analysis failed: ${e}`);
        } finally {
            this._btnAnalyze.disabled = false;
        }
    }

    async _saveFile() {
        if (!this._api) return;

        try {
            // Get binary data with modifications via 'file data' command
            const fileData = await this._api.getFileData();
            if (!fileData || !fileData.data) {
                console.error('No binary data available');
                return;
            }

            // Determine filename - add _modified suffix
            let filename = fileData.filename || 'binary';
            const dotIndex = filename.lastIndexOf('.');
            if (dotIndex > 0) {
                filename = filename.substring(0, dotIndex) + '_modified' + filename.substring(dotIndex);
            } else {
                filename = filename + '_modified';
            }

            // `fileData.data` arrives as a Uint8Array (typed return)
            // or as a number-Array fallback from serde-wasm-bindgen
            // depending on the serializer config — handle either.
            // Earlier this path round-tripped through base64 (`atob`),
            // but the wasm side hands us raw bytes now so the
            // intermediate decode was wrong.
            const raw = fileData.data;
            const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);

            // Create blob and download
            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();

            URL.revokeObjectURL(url);

            console.log(`Saved file: ${filename} (${formatFileSize(fileData.size)})`);
        } catch (e) {
            console.error(`Failed to save file: ${e}`);
        }
    }

    _onBinaryLoaded(metadata) {
        // Show file path (use stored filename from File object, fallback to metadata)
        const filename = this._loadedFilename || metadata.filename || metadata.path || 'unknown';
        this._filePath.textContent = filename;
        this._filePath.title = filename; // Full path on hover

        // Show format and architecture info
        this._fileFormat.textContent = metadata.format;
        this._fileMeta.textContent = `${metadata.architecture} | ${metadata.is_64_bit ? '64-bit' : '32-bit'}`;
        this._statusArch.textContent = metadata.architecture;
        this._btnSave.disabled = false;
        if (this._btnAnalyze) {
            this._btnAnalyze.disabled = false;
        }

        // Update seek display and URL hash
        if (metadata.entry_point) {
            this._onSeekChanged(metadata.entry_point);
        }

        // Refresh views
        this._disassembly.refresh();
        this._namesList.refresh();
        if (this._hexView) this._hexView.refresh();
        if (this._strings) this._strings.refresh();
    }

    _onPanelCollapseChanged(e) {
        const panel = e.detail?.panel || e.target;
        const collapsed = e.detail?.collapsed;
        // If it's the hex panel, toggle the grid layout and show/hide the collapsed tab
        if (panel === this._hexPanel || e.target === this._hexPanel) {
            // Inline `grid-template-columns` written by a previous
            // splitter drag would otherwise win over the
            // `.main.hex-collapsed` rule, leaving the disassembly
            // stuck at its pre-collapse width with empty space
            // where the hex panel was. Clearing it on each toggle
            // hands control back to whichever class rule applies
            // (3-col when collapsed, 5-col when restored), and the
            // user can re-drag from a clean state.
            this._main.style.gridTemplateColumns = '';
            if (collapsed) {
                this._main.classList.add('hex-collapsed');
                this._hexCollapsedTab.classList.add('visible');
            } else {
                this._main.classList.remove('hex-collapsed');
                this._hexCollapsedTab.classList.remove('visible');
            }
        }
    }

    /**
     * Handle seek changes from any source.
     * Updates UI, URL hash, and navigation button state.
     */
    async _onSeekChanged(addr) {
        // Update seek display
        this._seek.textContent = formatAddress(addr);

        // Update URL hash - use pushState to enable browser back/forward
        // But skip if we're handling a popstate event (to avoid loops)
        const newUrl = `#${addr}`;
        if (window.location.hash !== newUrl) {
            if (this._handlingPopState) {
                // Just update URL without adding to history
                history.replaceState({ addr }, '', newUrl);
            } else {
                // Normal navigation - add to browser history
                history.pushState({ addr }, '', newUrl);
            }
        }

        // Update navigation button state
        await this._updateNavButtons();
    }

    /**
     * Update the enabled/disabled state of navigation buttons.
     */
    async _updateNavButtons() {
        if (!this._api) return;

        try {
            const canBack = await this._api.canSeekBack();
            const canForward = await this._api.canSeekForward();
            this._btnBack.disabled = !canBack;
            this._btnForward.disabled = !canForward;
        } catch (e) {
            // Ignore errors, just disable buttons
            this._btnBack.disabled = true;
            this._btnForward.disabled = true;
        }
    }

    /**
     * Navigate back in seek history.
     */
    async _navigateBack() {
        if (!this._api) return;
        await this._api.seekBack();
    }

    /**
     * Navigate forward in seek history.
     */
    async _navigateForward() {
        if (!this._api) return;
        await this._api.seekForward();
    }

    /**
     * Handle keyboard shortcuts.
     */
    _handleKeydown(e) {
        // Ignore if focused on an input element (except for Escape)
        const target = e.target;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

        // If a modal is open, handle modal-specific keys
        if (this._activeModal) {
            if (e.key === 'Escape') {
                e.preventDefault();
                this._closeModal();
            }
            // Don't process other shortcuts while modal is open
            return;
        }

        // Don't process shortcuts if typing in an input (except global ones)
        if (isInput) return;

        // Check registered shortcuts
        for (const shortcut of this._shortcuts) {
            const altMatch = shortcut.alt ? e.altKey : !e.altKey;
            const ctrlMatch = shortcut.ctrl ? e.ctrlKey : !e.ctrlKey;
            const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
            // Check both e.key and e.code for better cross-platform support
            // On macOS, Alt+key produces special characters, so e.key won't match
            // e.code gives the physical key (e.g., 'KeyG' for g key)
            const keyLower = shortcut.key.toLowerCase();
            const codeKey = e.code.replace('Key', '').replace('Arrow', '').toLowerCase();
            const keyMatch = e.key.toLowerCase() === keyLower || codeKey === keyLower;

            if (keyMatch && altMatch && ctrlMatch && shiftMatch) {
                e.preventDefault();
                shortcut.action();
                return;
            }
        }
    }

    /**
     * Set up modal event handlers.
     */
    _setupModalHandlers() {
        // Close modal when clicking overlay background
        for (const modal of [this._modalSeek, this._modalRename, this._modalHelp]) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this._closeModal();
                }
            });
        }

        // Handle seek modal input
        this._modalSeekInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = this._modalSeekInput.value.trim();
                if (value) {
                    await this._seekToAddress(value);
                }
                this._closeModal();
            }
        });

        // Handle rename modal input
        this._modalRenameInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = this._modalRenameInput.value.trim();
                if (value) {
                    await this._renameCurrentFunction(value);
                }
                this._closeModal();
            }
        });
    }

    /**
     * Open the seek/go-to modal.
     */
    _openSeekModal() {
        if (!this._api) return;
        this._modalSeekInput.value = '';
        this._modalSeek.classList.add('active');
        this._activeModal = this._modalSeek;
        // Focus after a brief delay to ensure modal is visible
        setTimeout(() => this._modalSeekInput.focus(), 10);
    }

    /**
     * Open the rename function modal.
     */
    async _openRenameModal() {
        if (!this._api) return;

        // Pre-fill with current function name if available. Resolve
        // through the function entry first — otherwise renaming from
        // mid-body sees no Function name at the seek address and
        // falls back to "" instead of the actual function name.
        try {
            const seek = await this._api.getSeek();
            const entry = this._api.resolveFunctionEntry(seek);
            const out = this._api.session.name_here(entry);
            const entries = out?.entries || [];
            const callable = entries.find((e) =>
                e.kind === 'function' || e.kind === 'import' || e.kind === 'export'
            );
            this._modalRenameInput.value = callable?.name || '';
        } catch {
            this._modalRenameInput.value = '';
        }

        this._modalRename.classList.add('active');
        this._activeModal = this._modalRename;
        setTimeout(() => {
            this._modalRenameInput.focus();
            this._modalRenameInput.select();
        }, 10);
    }

    /**
     * Open the help modal showing keyboard shortcuts.
     */
    _openHelpModal() {
        // Dynamically populate shortcuts from the registry
        this._shortcutList.innerHTML = '';

        for (const shortcut of this._shortcuts) {
            const item = document.createElement('div');
            item.className = 'shortcut-item';

            // Format the key combination
            const keyParts = [];
            if (shortcut.alt) keyParts.push('Alt');
            if (shortcut.ctrl) keyParts.push('Ctrl');
            if (shortcut.shift) keyParts.push('Shift');

            // Format the key name for display
            let keyName = shortcut.key;
            if (keyName === 'ArrowLeft') keyName = 'Left';
            else if (keyName === 'ArrowRight') keyName = 'Right';
            else if (keyName === 'ArrowUp') keyName = 'Up';
            else if (keyName === 'ArrowDown') keyName = 'Down';
            else if (keyName.length === 1) keyName = keyName.toUpperCase();

            keyParts.push(keyName);

            item.innerHTML = `
                <span class="shortcut-desc">${shortcut.description}</span>
                <span class="shortcut-key">${keyParts.join('+')}</span>
            `;

            this._shortcutList.appendChild(item);
        }

        this._modalHelp.classList.add('active');
        this._activeModal = this._modalHelp;
    }

    /**
     * Open the Options modal: pulls every configurable option from
     * the wasm session, renders an appropriate input per option
     * `kind` (checkbox / number / text), and commits each change
     * back through `options_set` immediately on edit. The modal
     * stays open across edits so users can flip several at once.
     */
    _openOptionsModal() {
        if (!this._api?.session?.options_list) return;
        let output;
        try {
            output = this._api.session.options_list();
        } catch (e) {
            console.warn('[options] options_list failed', e);
            return;
        }
        const options = output?.options || [];
        this._optionsList.innerHTML = '';
        for (const opt of options) {
            this._optionsList.appendChild(this._renderOptionRow(opt));
        }
        this._modalOptions.classList.add('active');
        this._activeModal = this._modalOptions;
    }

    /**
     * Build the DOM for a single option row. The control type is
     * picked from `opt.kind`; bool gets a checkbox, int a number
     * input, string a text input. All three commit on `change`
     * (checkbox/number) or Enter/blur (text).
     */
    _renderOptionRow(opt) {
        const row = document.createElement('div');
        row.className = 'option-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'option-name';
        nameEl.textContent = opt.name;

        const ctrlWrap = document.createElement('span');
        ctrlWrap.className = 'option-control';

        const commit = (rawValue) => {
            try {
                this._api.session.options_set(opt.name, String(rawValue));
            } catch (e) {
                console.warn(`[options] set ${opt.name}=${rawValue} failed`, e);
            }
        };

        if (opt.kind === 'bool') {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = (opt.value === 'true');
            cb.addEventListener('change', () => commit(cb.checked));
            ctrlWrap.appendChild(cb);
        } else if (opt.kind === 'int') {
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.value = opt.value;
            const original = opt.value;
            inp.addEventListener('input', () => {
                inp.classList.toggle('dirty', inp.value !== original);
            });
            inp.addEventListener('change', () => {
                commit(inp.value);
                inp.classList.remove('dirty');
            });
            ctrlWrap.appendChild(inp);
        } else {
            // string + any unknown kind — fall back to free-form text.
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = opt.value;
            inp.spellcheck = false;
            const original = opt.value;
            inp.addEventListener('input', () => {
                inp.classList.toggle('dirty', inp.value !== original);
            });
            const doCommit = () => {
                if (inp.value !== original) {
                    commit(inp.value);
                    inp.classList.remove('dirty');
                }
            };
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    doCommit();
                    inp.blur();
                } else if (e.key === 'Escape') {
                    inp.value = original;
                    inp.classList.remove('dirty');
                    inp.blur();
                }
            });
            inp.addEventListener('blur', doCommit);
            ctrlWrap.appendChild(inp);
        }

        const desc = document.createElement('div');
        desc.className = 'option-desc';
        desc.textContent = opt.description;

        row.appendChild(nameEl);
        row.appendChild(ctrlWrap);
        row.appendChild(desc);
        return row;
    }

    /**
     * Close the currently active modal.
     */
    _closeModal() {
        if (this._activeModal) {
            this._activeModal.classList.remove('active');
            this._activeModal = null;
        }
    }

    /**
     * Seek to an address or symbol.
     */
    async _seekToAddress(value) {
        if (!this._api) return;

        try {
            // The seek command handles both hex addresses and symbol names
            await this._api.setSeek(value);
        } catch (e) {
            console.error('Failed to seek:', e);
        }
    }

    /**
     * Rename the function at the current seek address.
     */
    async _renameCurrentFunction(name) {
        if (!this._api) return;

        try {
            // Resolve seek to the enclosing function entry — without
            // this a rename invoked from mid-body silently lands a
            // brand-new Function name at the wrong address and the
            // entry's `func_<hex>` keeps showing in disassembly.
            const seek = await this._api.getSeek();
            const entryBig = this._api.resolveFunctionEntry(seek);

            // Find any callable name at the entry — Function, Import,
            // or Export. Renaming an Import in place is preferable to
            // dropping a parallel Function next to it.
            const out = this._api.session.name_here(entryBig);
            const entries = out?.entries || [];
            const existing = entries.find((e) =>
                e.kind === 'function' || e.kind === 'import' || e.kind === 'export'
            );

            if (existing) {
                this._api.session.name_rename(BigInt(existing.id), name);
            } else {
                this._api.session.name_add('func', entryBig, name);
            }

            // Refresh function list to show updated name
            if (this._namesList) {
                this._namesList.refresh();
            }
            // Refresh disassembly to show label
            if (this._disassembly) {
                this._disassembly.refresh();
            }
        } catch (e) {
            console.error('Failed to rename function:', e);
        }
    }

    /**
     * Handle browser back/forward button navigation.
     * Uses bint's seek history to navigate.
     */
    async _onPopState(e) {
        if (!this._api) return;

        // Get the address from the state or hash
        const addr = e.state?.addr || (window.location.hash ? window.location.hash.slice(1) : null);

        if (addr && addr.startsWith('0x')) {
            this._handlingPopState = true;
            try {
                // Seek to the address from browser history
                // This will trigger SEEK_CHANGED which updates UI
                await this._api.setSeek(addr);
            } finally {
                this._handlingPopState = false;
            }
        } else if (!e.state && await this._hasBinaryLoaded()) {
            // No state means we're about to leave the page (at beginning of history)
            // Push the current state back to prevent leaving
            const currentAddr = await this._api.getSeek();
            if (currentAddr) {
                history.pushState({ addr: currentAddr }, '', `#${currentAddr}`);
            }
        }
    }

    /**
     * Check if a binary is loaded.
     */
    async _hasBinaryLoaded() {
        if (!this._api) return false;
        try {
            return await this._api.hasBinary();
        } catch {
            return false;
        }
    }

    /**
     * Warn before leaving page if there's session state.
     */
    _onBeforeUnload(e) {
        // Only warn if we have a binary loaded (indicating work in progress)
        if (this._api && this._btnSave && !this._btnSave.disabled) {
            // Standard way to trigger the browser's "Leave site?" dialog
            e.preventDefault();
            // For older browsers
            e.returnValue = '';
            return '';
        }
    }

    _onDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this._dropZone.classList.add('active');
    }

    _onDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        // Only hide if leaving the window
        if (e.relatedTarget === null) {
            this._dropZone.classList.remove('active');
        }
    }

    async _onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._dropZone.classList.remove('active');

        const file = e.dataTransfer.files[0];
        if (file) {
            await this._loadFile(file);
        }
    }

    _startLogoGlitch() {
        const triggerGlitch = () => {
            this._logo.classList.add('animate-triggered');
            setTimeout(() => {
                this._logo.classList.remove('animate-triggered');
            }, 200);
        };

        // Glitch every 2-3 seconds randomly
        const scheduleNext = () => {
            const delay = 2000 + Math.random() * 1000;
            setTimeout(() => {
                triggerGlitch();
                scheduleNext();
            }, delay);
        };

        scheduleNext();
    }
}

customElements.define('bint-app', BintApp);

export default BintApp;
