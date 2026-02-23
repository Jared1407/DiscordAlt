/**
 * Format a timestamp into a human-readable relative time
 */
export function formatTime(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);

    // Under 1 min
    if (diffMin < 1) return 'Just now';
    // Under 1 hour
    if (diffMin < 60) return `${diffMin}m ago`;
    // Under 24 hours but same day
    if (diffHr < 24 && d.getDate() === now.getDate()) {
        return `Today at ${formatClock(d)}`;
    }
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.getDate() === yesterday.getDate() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getFullYear() === yesterday.getFullYear()) {
        return `Yesterday at ${formatClock(d)}`;
    }
    // Older
    return `${formatDate(d)} ${formatClock(d)}`;
}

/**
 * Format just the clock portion (12-hour)
 */
export function formatClock(date) {
    let h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}

/**
 * Format a date as MM/DD/YYYY
 */
export function formatDate(date) {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/**
 * Format a date for the date separator in chat
 */
export function formatDateSeparator(date) {
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();

    if (d.toDateString() === now.toDateString()) return 'Today';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
