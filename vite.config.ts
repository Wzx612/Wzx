import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/anthropic-proxy': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/anthropic-proxy/, ''),
      },
      '/deepseek-proxy': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/deepseek-proxy/, ''),
      },
      // Local dev proxies /api to the running docker stack's gateway (nginx on
      // :80, which routes /api/* to the backend services). Run `docker compose
      // up -d` first. (Standalone `uvicorn app.main:app --port 8001` also works
      // — point this at 127.0.0.1:8001 if you run the backend that way.)
      '/api': {
        target: 'http://127.0.0.1:80',
        changeOrigin: true,
      },
    },
  },
});
