# Decisions I made on your behalf

Foundation phase (P0), `specs/014-foundation`.

Judgement calls that had no single right answer. Each one is reversible, and each says what reversing it costs. If you disagree with one, this is the file to argue with.

---

| Decision | Why | If you disagree |
|---|---|---|
| **One CI file, five jobs** — not four workflow files as the blueprint listed | The requirement is a job per surface, not a file per surface; five jobs give the same "one surface red, others still report" guarantee with less to keep in step | Split `ci.yml`; nothing depends on it being one file |
| **`sqlite3` and `drift_flutter` upgraded** by `flutter pub upgrade --major-versions` | Dependencies did not resolve at all — `sqlite3` was pinned below drift's requirement and `drift_flutter` 0.2.7 could not satisfy either | Pin the set by hand in `apps/mobile/pubspec.yaml` |
| **API-client codegen switched off** in `apps/mobile/build.yaml` | It runs by default, reads `packages/contracts/openapi.json`, and aborts the whole codegen run on a fresh clone — taking drift's generation down with it | Enable it in the same change that starts committing the generated contract |
| **`@nestjs/swagger` upgraded to 12** and moved to runtime dependencies | Version 8 could not resolve NestJS 12, and it was in `devDependencies` while being imported at runtime | — |
| **zod→JSON-Schema written by hand** (about 40 lines) rather than a dependency | P0 emits two event payloads and one envelope; a library to convert three schemas is something to keep current, review and upgrade | Swap in `zod-to-json-schema` when a phase needs unions or refinements |
| **Tokens in `sessionStorage`** on the web, not `localStorage` | Closing the tab should end the session on a machine that might be shared, and the refresh token is a credential | One line in `apps/frontend/stores/root.ts` |
| **`v1` data not migrated** | The blueprint's own assumption; accounts carry over because both versions share PostgreSQL, but reminders, chats and coaching rows do not | A one-shot script, scoped in P11 |

---
