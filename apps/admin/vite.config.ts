import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VERBAKIT_API_URL ?? 'http://127.0.0.1:8787';

// Admin dilayani di bawah /admin baik di dev maupun produksi, supaya
// SPA fallback dan base path selalu sama.
const BASE = '/admin/';

export default defineConfig({
  base: BASE,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/sitemap.xml': { target: API_TARGET, changeOrigin: true },
      '/robots.txt': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
