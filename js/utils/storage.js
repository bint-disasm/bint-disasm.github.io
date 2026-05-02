/**
 * localStorage wrapper for persisting UI state.
 */

const PREFIX = 'bint:';

/**
 * Get a value from storage.
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Stored value or default
 */
export function get(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(PREFIX + key);
        if (value === null) return defaultValue;
        return JSON.parse(value);
    } catch {
        return defaultValue;
    }
}

/**
 * Set a value in storage.
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON serialized)
 */
export function set(key, value) {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
    }
}

/**
 * Remove a value from storage.
 * @param {string} key - Storage key
 */
export function remove(key) {
    try {
        localStorage.removeItem(PREFIX + key);
    } catch {
        // Ignore errors
    }
}

/**
 * Clear all bint-related storage.
 */
export function clear() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch {
        // Ignore errors
    }
}

// Storage keys as constants
export const Keys = {
    LAYOUT: 'layout',
    THEME: 'theme',
    RECENT_FILES: 'recent_files',
    COMMAND_HISTORY: 'command_history',
    PANEL_STATES: 'panel_states',
    OPTIONS: 'options',
};

export default { get, set, remove, clear, Keys };
