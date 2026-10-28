import { defineConfig } from 'vite';

export default defineConfig({
    define: {
        global: 'globalThis',
    },
    server: {
        port: 5173,
        open: true,
        proxy: {
            '/_matrix': {
                target: process.env.VITE_DEV_MATRIX_TARGET || 'http://localhost:8008',
                changeOrigin: true,
            },
            '/_synapse': {
                target: process.env.VITE_DEV_MATRIX_TARGET || 'http://localhost:8008',
                changeOrigin: true,
            },
            '/api': {
                target: process.env.VITE_DEV_TOKEN_TARGET || 'http://localhost:3001',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
            },
            '/livekit': {
                target: process.env.VITE_DEV_LIVEKIT_TARGET || 'ws://localhost:7880',
                ws: true,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/livekit/, ''),
            },
        },
    },
    build: {
        target: 'esnext',
    },
});
