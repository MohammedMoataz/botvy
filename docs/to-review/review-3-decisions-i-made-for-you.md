# 📖 R3 — Judgement calls I made on your behalf

## ☐ Read?

```
READ:              (yes)
REVERSE ANY?
```

---

Each of these had no single right answer, each is reversible, and each says what
reversing costs. If you disagree with one, this is the file to argue with.

| Decision | Why | If you disagree |
|---|---|---|
| **One CI file, five jobs** — not four workflow files as the blueprint listed | The requirement is a job per surface, not a file per surface. Five jobs give the same "one surface red, the others still report" guarantee with less to keep in step | Split `ci.yml`; nothing depends on it being one file |
| **`sqlite3` and `drift_flutter` upgraded** by `flutter pub upgrade --major-versions` | Dependencies did not resolve at all — `sqlite3` was pinned below drift's requirement | Pin the set by hand in `mobile/pubspec.yaml` |
| **API-client codegen switched off** in `mobile/build.yaml` | It reads `packages/contracts/openapi.json` and aborts the whole codegen run on a fresh clone, taking drift's generation down with it | Enable it in the same change that starts committing generated contracts |
| **`@nestjs/swagger` upgraded to 12**, moved to runtime dependencies | Version 8 could not resolve NestJS 12, and it was in `devDependencies` while being imported at runtime | — |
| **`@nestjs/graphql` and `@nestjs/apollo` to 14**, `@apollo/server` to 5 | The blueprint pinned 13.x, which peers on Nest 11 and fails at runtime on Nest 12 | Nothing to reverse — 13.x does not work |
| **zod→JSON-Schema written by hand** (~40 lines) rather than a dependency | Two event payloads and one envelope. A library to convert three schemas is something to keep current, review and upgrade | Swap in `zod-to-json-schema` when a phase needs unions or refinements |
| **Tokens in `sessionStorage`** on the web, not `localStorage` | Closing the tab should end the session on a machine that might be shared, and the refresh token is a credential | One line in `frontend/stores/root.ts` |
| **v1 data not migrated** | The blueprint's own assumption. Reminders, chats and coaching rows do not carry over | A one-shot script, scoped in P11. The dump is at `backups/pre-v2-identity-20260908T181658Z.dump` |
| **`AuditPort` moved to the shared kernel** | Four consumers in three contexts, past the constitution's own "move it on the third copy". The `audit_log` collection stays Operations' | Move the declaration back and give Identity an event instead |
| **No DataLoader in the GraphQL edge** | P1's reads have no N+1 to solve, and a loader for none is a dependency bought on speculation | Add it with the first query that needs one |
| **The phone's server screen saves without a successful test** | Somebody setting the address up before the tunnel is running has a legitimate reason; refusing would strand them | Make the test a gate in `server_page.dart` |
