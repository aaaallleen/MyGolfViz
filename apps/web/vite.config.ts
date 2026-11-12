import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE ?? '/',
  build: { modulePreload: { polyfill: false } },
});
