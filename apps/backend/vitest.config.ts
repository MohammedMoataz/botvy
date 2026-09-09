import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC rather than vitest's default esbuild, for one reason: esbuild does not
  // implement `emitDecoratorMetadata`, so a Nest provider declared as a bare
  // class has no reflected constructor types and every dependency resolves to
  // `undefined`. Under esbuild, `app.module.spec.ts` cannot tell a broken
  // dependency graph from a working one — it reports both as broken.
  //
  // That mattered: three phases shipped with a graph that did not resolve in
  // either role, and the only reason nothing caught it is that no test ever
  // asked Nest to assemble the application. A test that cannot be written is a
  // defect that cannot be found.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
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
});
