/**
 * Centralized configuration for server URLs
 * Change these when deploying to a different host.
 */
export const config = {
    /** Matrix Synapse homeserver URL */
    matrixUrl: 'http://localhost:8008',

    /** LiveKit SFU WebSocket URL */
    livekitUrl: 'ws://localhost:7880',

    /** Token server URL (issues LiveKit access tokens) */
    tokenServerUrl: 'http://localhost:3001',
};
