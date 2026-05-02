/**
 * Event bus for inter-component communication.
 *
 * Usage:
 *   import { events } from './events.js';
 *
 *   // Subscribe to an event
 *   events.on('seek', (addr) => console.log('Seeked to', addr));
 *
 *   // Emit an event
 *   events.emit('seek', 0x1000);
 *
 *   // Unsubscribe
 *   const unsub = events.on('seek', handler);
 *   unsub();
 */

class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(event);
            if (callbacks) {
                callbacks.delete(callback);
            }
        };
    }

    /**
     * Subscribe to an event, but only fire once.
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    once(event, callback) {
        const unsub = this.on(event, (...args) => {
            unsub();
            callback(...args);
        });
        return unsub;
    }

    /**
     * Emit an event to all subscribers.
     * @param {string} event - Event name
     * @param {...any} args - Arguments to pass to handlers
     */
    emit(event, ...args) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            for (const callback of callbacks) {
                try {
                    callback(...args);
                } catch (e) {
                    console.error(`Error in event handler for '${event}':`, e);
                }
            }
        }
    }

    /**
     * Remove all listeners for an event, or all events.
     * @param {string} [event] - Optional event name
     */
    off(event) {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }
}

// Singleton instance
export const events = new EventBus();

// Event names as constants for consistency
export const Events = {
    // Binary loading
    BINARY_LOADED: 'binary:loaded',
    BINARY_UNLOADED: 'binary:unloaded',

    // Navigation
    SEEK: 'seek',
    SEEK_CHANGED: 'seek:changed',

    // Analysis
    ANALYSIS_STARTED: 'analysis:started',
    ANALYSIS_COMPLETE: 'analysis:complete',
    FUNCTION_DISCOVERED: 'function:discovered',

    // UI state
    PANEL_OPENED: 'panel:opened',
    PANEL_CLOSED: 'panel:closed',
    PANEL_FOCUSED: 'panel:focused',

    // Commands
    COMMAND_EXECUTED: 'command:executed',
    COMMAND_ERROR: 'command:error',

    // Selection
    SELECTION_CHANGED: 'selection:changed',

    // Memory modifications
    MEMORY_MODIFIED: 'memory:modified',

    // Symex breakpoints — payload: { halts: string[], avoids: string[] }
    // (lowercase 0x-prefixed hex). Emitted whenever the user toggles
    // a breakpoint circle in the disassembly view; the Emulation
    // panel listens to keep its halt/avoid input boxes in sync.
    BREAKPOINTS_CHANGED: 'breakpoints:changed',

    // Active memory-view source. Payload: { stateIndex: number|null }.
    // null means the session memory layer (default); a number is an
    // emulation state index. Emitted by the Emulation panel when
    // the user picks a state in the dropdown; the hex view listens
    // and threads the index through `session.hex_dump` so reads
    // dispatch through the layered Session::memory_view dispatcher.
    MEMORY_VIEW_TARGET_CHANGED: 'memory_view:target_changed',

    // Whether the hex view should solve symbolic bytes against the
    // active emulation state's path constraints when rendering.
    // Payload: { solve: boolean }. Emitted by the Emulation panel's
    // "Solve hex" checkbox; the hex view passes the flag straight
    // through to `session.hex_dump`.
    HEX_SOLVE_TOGGLED: 'memory_view:solve_toggled',
};

export default events;
