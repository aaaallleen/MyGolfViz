import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const token = process.env.MYGOLFVIZ_TOKEN;
  return {
    plugins: [react()],
    base: process.env.PAGES_BASE ?? '/',
    build: { modulePreload: { polyfill: false } },
    server:
      mode === 'localapp'
        ? {
            proxy: {
              '/api': {
                target: `http://127.0.0.1:${process.env.MYGOLFVIZ_PORT ?? 8765}`,
                changeOrigin: false,
                ...(token ? { headers: { 'X-MyGolfViz-Token': token } } : {}),
              },
            },
          }
        : undefined,
  };
});
