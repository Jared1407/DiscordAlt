/**
 * Shared formatting utilities
 * Centralizes escapeHtml and formatName to avoid duplication across components.
 */

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape a string for use inside an HTML attribute
 */
export function escapeAttr(text) {
    return (text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Format a Matrix user ID (@user:server) or display name into a clean label
 */
export function formatName(name) {
    if (!name) return 'Unknown';
    if (name.startsWith('@')) {
        return name.slice(1).split(':')[0];
    }
    return name;
}
