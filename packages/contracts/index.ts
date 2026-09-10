/**
 * @botvy/contracts — the generated view of the API's own contracts.
 *
 * `src/openapi.ts` and `src/graphql.ts` are written by `pnpm gen:contracts`:
 * the backend's generation mode writes `openapi.json` and `schema.graphql`, and
 * `scripts/generate.mjs` turns each into types. Both outputs are committed, so
 * a fresh clone type-checks without running the backend — and a change to a
 * route or a resolver that nobody regenerated shows up as a diff in review
 * rather than as a client typed against last month's API.
 *
 * `schema.graphql` only arrived once there was a resolver to describe, which is
 * why the two re-exports below spent P0 and P1 commented out. They are live
 * now; the flag underneath is what a caller checks when it wants to know
 * whether generation has ever run.
 *
 * Types only. There is nothing to execute here, and `export type *` is what
 * says so — a value export from a generated module would put the generator's
 * output in every bundle that imports a type from it.
 */

export type * from './src/openapi.js';
export type * from './src/graphql.js';

/** True once the generated modules above are re-exported. */
export const CONTRACTS_GENERATED = true;
