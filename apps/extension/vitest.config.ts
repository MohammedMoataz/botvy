import { defineConfig } from 'vitest/config';

/**
 * The extension's own unit tests.
 *
 * `node` rather than a DOM environment, deliberately: what is tested here is the
 * logic a browser context happens to run — the token lock, the sign-out order,
 * the capture trim — and none of it touches a document. The flows that do are
 * Playwright's, against a built extension in a real browser, because a jsdom
 * side panel is not a side panel.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    /*
     * A real IndexedDB, in memory.
     *
     * `session.clearAll()` deletes the Dexie database and reopens it, and the
     * thing worth testing about sign-out is that it actually clears — so the
     * store is real and only the browser around it is fake. Mocking Dexie here
     * would leave the one assertion that matters ("nothing of the previous
     * member remains") asserting a mock.
     */
    setupFiles: ['fake-indexeddb/auto'],
  },
});
