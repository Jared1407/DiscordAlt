/**
 * Centralized configuration for server URLs.
 *
 * Resolution order:
 * 1. Explicit Vite environment variables (VITE_MATRIX_URL, VITE_LIVEKIT_URL, VITE_TOKEN_SERVER_URL)
 * 2. Dynamic derivation from `window.location` when running in the browser behind the reverse proxy
 */
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const hasWindow = typeof window !== 'undefined' && Boolean(window.location);

const origin = hasWindow ? window.location.origin : '';
const wsOrigin = hasWindow
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : '';

export const config = {
    /** Matrix Synapse / Conduwuit homeserver URL */
    matrixUrl: env.VITE_MATRIX_URL?.trim() || origin,

    /** LiveKit SFU WebSocket URL */
    livekitUrl: env.VITE_LIVEKIT_URL?.trim() || (wsOrigin ? `${wsOrigin}/livekit` : ''),

    /** Token server URL (issues LiveKit access tokens) */
    tokenServerUrl: env.VITE_TOKEN_SERVER_URL?.trim() || (origin ? `${origin}/api` : ''),
};
