import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // The end-to-end spine spec talks to a running compose stack, so it stays out
    // of the default run and is opted into with E2E=1 (task T074).
    exclude: ['**/node_modules/**', '**/dist/**', ...(process.env.E2E ? [] : ['**/*.e2e.spec.ts'])],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
  esbuild: {
    target: 'es2023',
  },
});
