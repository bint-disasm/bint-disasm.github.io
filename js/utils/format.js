/**
 * Formatting utilities for addresses, hex values, etc.
 */

/**
 * Format an address as a hex string with 0x prefix.
 * @param {number|bigint} addr - Address value
 * @param {number} [width=8] - Minimum width (padded with zeros)
 * @returns {string} Formatted address
 */
export function formatAddress(addr, width = 8) {
    const hex = BigInt(addr).toString(16);
    return '0x' + hex.padStart(width, '0');
}

/**
 * Format a size/offset value.
 * @param {number|bigint} value - Value
 * @returns {string} Formatted value
 */
export function formatSize(value) {
    return '0x' + BigInt(value).toString(16);
}

/**
 * Format bytes as a hex string.
 * @param {Uint8Array|number[]} bytes - Byte array
 * @param {string} [separator=' '] - Separator between bytes
 * @returns {string} Hex string
 */
export function formatBytes(bytes, separator = ' ') {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(separator);
}

/**
 * Format a file size in human-readable form.
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return unitIndex === 0
        ? `${size} ${units[unitIndex]}`
        : `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Parse a number from string, supporting hex and decimal.
 * @param {string} str - Number string (e.g., "0x1000", "4096")
 * @returns {number|null} Parsed number or null if invalid
 */
export function parseNumber(str) {
    str = str.trim();
    if (str.startsWith('0x') || str.startsWith('0X')) {
        const parsed = parseInt(str.slice(2), 16);
        return isNaN(parsed) ? null : parsed;
    }
    const parsed = parseInt(str, 10);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Parse an address as a BigInt, accepting any reasonable input shape:
 * hex string ("0x100000530"), decimal string ("4294968112"), Number,
 * or BigInt (passed through).
 *
 * Use this anywhere an address might cross > 2^53. JS's Number type and
 * its bitwise operators silently truncate at 32/53 bits — for example
 * `0x100000530 & ~0xfff` evaluates to 0. BigInt is the only safe
 * representation for 64-bit virtual addresses.
 *
 * @param {string|number|bigint|null|undefined} input
 * @returns {bigint|null} Parsed BigInt, or null if the input is empty
 *   or unparseable.
 */
export function parseAddress(input) {
    if (input === null || input === undefined || input === '') return null;
    if (typeof input === 'bigint') return input;
    if (typeof input === 'number') {
        if (!Number.isFinite(input)) return null;
        // Reject non-integers; truncating silently would mask bugs.
        if (!Number.isInteger(input)) return null;
        return BigInt(input);
    }
    if (typeof input === 'string') {
        const s = input.trim();
        try {
            // BigInt() understands "0x.." prefixed strings AND plain
            // decimal strings; throws on anything else.
            return BigInt(s);
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Escape HTML special characters.
 * @param {string} str - Raw string
 * @returns {string} HTML-safe string
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Truncate a string with ellipsis.
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated string
 */
export function truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '\u2026';
}

/**
 * Format an instruction for display with syntax highlighting classes.
 * @param {string} mnemonic - Instruction mnemonic
 * @param {string} operands - Operand string
 * @returns {string} HTML string with highlighting classes
 */
export function formatInstruction(mnemonic, operands) {
    let html = `<span class="mnemonic">${escapeHtml(mnemonic)}</span>`;

    if (operands) {
        // Simple operand highlighting - apply all replacements to the raw text
        const highlighted = operands.replace(
            /\b(0x[0-9a-fA-F]+)\b/g,
            '<span class="number">$1</span>'
        ).replace(
            /\b(\d+)\b/g,
            '<span class="number">$1</span>'
        ).replace(
            /\b(rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|r\d+|eax|ebx|ecx|edx|esi|edi|esp|ebp|ax|bx|cx|dx|al|ah|bl|bh|cl|ch|dl|dh|x\d+|w\d+|sp|lr|pc)\b/gi,
            '<span class="register">$1</span>'
        );
        html += ` ${highlighted}`;
    }

    return html;
}
