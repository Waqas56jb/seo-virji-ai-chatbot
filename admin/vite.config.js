import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Dev/preview: /api is proxied to the local backend (same-origin → secure cookies just work).
  server: { port: 5174, proxy: { '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4100', changeOrigin: true } } },
  preview: { port: 4175, proxy: { '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4100', changeOrigin: true } } },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
});
