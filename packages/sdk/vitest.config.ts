import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Browser-safe package: the specs must not reach for Node built-ins either.
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
