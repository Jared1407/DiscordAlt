/**
 * Generate a consistent color from a string (username/room name)
 */
const AVATAR_COLORS = [
    '#7c5cfc', '#c084fc', '#6ea8fe', '#3edd97',
    '#f5c542', '#f35a5a', '#ff8a65', '#4dd0e1',
    '#ab47bc', '#66bb6a', '#ef5350', '#42a5f5',
];

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

/**
 * Get a deterministic color for a given name
 */
export function getAvatarColor(name) {
    return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length];
}

/**
 * Get the initial letter(s) for a display name
 */
export function getInitials(name) {
    if (!name) return '?';
    // Remove the @user:server format prefix
    const clean = name.replace(/^@/, '').split(':')[0];
    return clean.charAt(0).toUpperCase();
}

/**
 * Create an avatar DOM element with a colored letter
 */
export function createAvatarElement(name, size = 40) {
    const el = document.createElement('div');
    el.className = 'avatar-letter';
    el.style.backgroundColor = getAvatarColor(name);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.fontSize = `${Math.round(size * 0.4)}px`;
    el.textContent = getInitials(name);
    return el;
}
