/**
 * Shared formatting utilities
 * Centralizes escapeHtml, formatName, and safe Markdown rendering.
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

/**
 * Format byte size into human-readable string
 */
export function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Convert raw message text into XSS-safe HTML with basic Markdown:
 * - Fenced code blocks (```lang\ncode```)
 * - Inline code (`code`)
 * - Bold (**text**)
 * - Italic (*text*)
 * - Auto-linked URLs (https://...)
 */
export function formatMessageBody(text) {
    let safe = escapeHtml(text || '');
    const codeBlocks = [];

    // 1. Extract fenced code blocks into placeholders
    safe = safe.replace(/```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```/g, (_match, _lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push(`<pre class="message-code-block"><code>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`);
        return `\u0000CODEBLOCK_${idx}\u0000`;
    });

    // 2. Extract inline code into placeholders
    const inlineCodes = [];
    safe = safe.replace(/`([^`\n]+)`/g, (_match, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(`<code>${code}</code>`);
        return `\u0000INLINECODE_${idx}\u0000`;
    });

    // 3. Auto-link URLs
    safe = safe.replace(/\b(https?:\/\/[^\s<]+)/g, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    // 4. Bold (**text**) and Italic (*text*)
    safe = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

    // 5. Restore inline code and fenced code blocks
    safe = safe.replace(/\u0000INLINECODE_(\d+)\u0000/g, (_m, i) => inlineCodes[Number(i)]);
    safe = safe.replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_m, i) => codeBlocks[Number(i)]);

    return safe;
}
