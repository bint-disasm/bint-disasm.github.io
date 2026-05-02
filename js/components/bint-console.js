/**
 * Command console component for executing bint commands.
 *
 * Features:
 * - Command input with history (up/down arrows)
 * - Output display with syntax highlighting
 * - Auto-scroll to bottom
 */

import { events, Events } from '../core/events.js';
import { escapeHtml } from '../utils/format.js';
import * as storage from '../utils/storage.js';

const MAX_HISTORY = 100;

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
            height: 100%;
            min-height: 0;
            font-family: var(--font-mono);
            font-size: var(--font-size-sm);
        }

        .output {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: var(--space-sm);
            background: var(--bg-primary);
        }

        .output-line {
            white-space: pre-wrap;
            word-break: break-all;
            margin: 0;
            line-height: 1.4;
        }

        .output-line.command {
            color: var(--accent-primary);
        }

        .output-line.command::before {
            content: '> ';
            color: var(--text-muted);
        }

        .output-line.error {
            color: var(--accent-error);
        }

        .output-line.info {
            color: var(--text-secondary);
        }

        .input-area {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
            padding: var(--space-xs) var(--space-sm);
            background: var(--bg-secondary);
            border-top: 1px solid var(--border-color);
        }

        .prompt {
            color: var(--text-muted);
            user-select: none;
        }

        input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-family: inherit;
            font-size: inherit;
            outline: none;
        }

        input::placeholder {
            color: var(--text-muted);
        }
    </style>

    <div class="output"></div>
    <div class="input-area">
        <span class="prompt">&gt;</span>
        <input type="text" placeholder="Enter command..." autocomplete="off" spellcheck="false">
    </div>
`;

export class BintConsole extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._output = this.shadowRoot.querySelector('.output');
        this._input = this.shadowRoot.querySelector('input');

        this._history = storage.get(storage.Keys.COMMAND_HISTORY, []);
        this._historyIndex = -1;
        this._currentInput = '';

        this._api = null;

        this._input.addEventListener('keydown', (e) => this._onKeyDown(e));

        // Run 'info' command when binary is loaded for a nice welcome display
        events.on(Events.BINARY_LOADED, () => this._onBinaryLoaded());
    }

    async _onBinaryLoaded() {
        if (!this._api) return;

        try {
            this.appendOutput('info', 'command');
            const result = await this._api.execute('info');
            if (result) {
                this.appendOutput(result);
            }
        } catch (e) {
            this.appendOutput(String(e), 'error');
        }
    }

    connectedCallback() {
        this._input.focus();
    }

    /**
     * Set the API instance to use for executing commands.
     * @param {BintAPI} api
     */
    setAPI(api) {
        this._api = api;
    }

    /**
     * Strips ANSI escape codes from text.
     * @param {string} text
     * @returns {string}
     */
    _stripAnsi(text) {
        // Match ANSI escape sequences: ESC[ followed by params and command letter
        // Also handles ESC followed by other sequences
        return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                   .replace(/\x1b\][^\x07]*\x07/g, '')  // OSC sequences
                   .replace(/\x1b[^[\]]/g, '');         // Other escape sequences
    }

    /**
     * Append a line to the output.
     * @param {string} text - Text to append
     * @param {string} [type] - Line type: 'command', 'error', 'info', or default
     */
    appendOutput(text, type = '') {
        const line = document.createElement('pre');
        line.className = 'output-line' + (type ? ` ${type}` : '');
        // Strip ANSI escape codes before displaying
        line.innerHTML = escapeHtml(this._stripAnsi(text));
        this._output.appendChild(line);
        this._scrollToBottom();
    }

    /**
     * Clear the output.
     */
    clear() {
        this._output.innerHTML = '';
    }

    _scrollToBottom() {
        this._output.scrollTop = this._output.scrollHeight;
    }

    async _onKeyDown(e) {
        switch (e.key) {
            case 'Enter':
                await this._executeCommand();
                break;

            case 'ArrowUp':
                e.preventDefault();
                this._navigateHistory(-1);
                break;

            case 'ArrowDown':
                e.preventDefault();
                this._navigateHistory(1);
                break;

            case 'Escape':
                this._input.value = '';
                this._historyIndex = -1;
                break;

            case 'l':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.clear();
                }
                break;
        }
    }

    async _executeCommand() {
        const command = this._input.value.trim();
        if (!command) return;

        // Add to history
        if (this._history[0] !== command) {
            this._history.unshift(command);
            if (this._history.length > MAX_HISTORY) {
                this._history.pop();
            }
            storage.set(storage.Keys.COMMAND_HISTORY, this._history);
        }
        this._historyIndex = -1;

        // Show command in output
        this.appendOutput(command, 'command');

        // Clear input
        this._input.value = '';

        // Execute command
        if (!this._api) {
            this.appendOutput('No API connected', 'error');
            return;
        }

        // Handle built-in commands
        if (command === 'clear') {
            this.clear();
            return;
        }

        try {
            const result = await this._api.execute(command);
            if (result) {
                this.appendOutput(result);
            }
        } catch (e) {
            this.appendOutput(String(e), 'error');
        }
    }

    _navigateHistory(direction) {
        if (this._history.length === 0) return;

        // Save current input when starting history navigation
        if (this._historyIndex === -1 && direction === -1) {
            this._currentInput = this._input.value;
        }

        const newIndex = this._historyIndex + direction;

        if (newIndex < -1) return;
        if (newIndex >= this._history.length) return;

        this._historyIndex = newIndex;

        if (this._historyIndex === -1) {
            this._input.value = this._currentInput;
        } else {
            this._input.value = this._history[this._historyIndex];
        }

        // Move cursor to end
        this._input.setSelectionRange(this._input.value.length, this._input.value.length);
    }
}

customElements.define('bint-console', BintConsole);

export default BintConsole;
