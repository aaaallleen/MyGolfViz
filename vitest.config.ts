import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      ...['packages/domain', 'packages/csv-parser', 'packages/analytics', 'tests', 'scripts'].map((dir) => ({
        test: { name: dir, root: dir, environment: 'node' as const, include: ['**/*.test.{ts,tsx}'] },
      })),
      ...['packages/ui', 'packages/visualizations', 'apps/web'].map((dir) => ({
        test: {
          name: dir,
          root: dir,
          environment: 'jsdom' as const,
          include: ['**/*.test.{ts,tsx}'],
          setupFiles: [new URL('./vitest.setup.ts', import.meta.url).pathname],
        },
      })),
    ],
  },
});
