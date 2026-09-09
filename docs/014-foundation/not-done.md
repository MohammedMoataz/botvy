# What is not done

Foundation phase (P0), `specs/014-foundation`.

Work this phase does not contain, stated plainly so no later phase assumes it exists. A capability every phase credits to another phase is a capability nobody builds.

---

- **The backend's HTTP edge is built, and `tasks.md` was wrong before it was.**
  `T024` and `T029` were marked done while `health.controller.ts`, the
  `/internal/*` controllers, `operations.module.ts`, `identity.module.ts` and
  the `patch-setting` / `health-query` / `settings-query` features were all
  absent — `AppModule` imported config, auth and CQRS only, so even the `ping`
  command was unregistered. That wiring now exists (commit `5264295`). The
  marks were the problem, not the plan: everything underneath — domain,
  persistence, outbox, settings, health, LLM, push, media, auth, contract
  generation — was real and tested the whole time.
- **GraphQL and the WebSocket gateway are still not built**, and the Caddyfile
  routes `/graphql` and `/ws*` to a backend that serves neither, while
  `plan.md:77` credits P0 with both. P0 has no queries to serve, so this is a
  deferral rather than a gap — but it has to be P1's task, not P1's assumption.
- **There is no way to obtain a user token**, so `POST /api/v1/ping` is
  `@UsersOnly()` and unreachable, and `quickstart.md:58` documents a `curl`
  nobody can run. The consequence worth naming: command → outbox → relay →
  handler → heartbeat is the one path that would prove the relay works
  end-to-end, and it cannot be exercised until sign-in lands in P1.
- **`T092` — the gate evidence.** It cannot pass until the route above exists,
  because `verify.mjs` asks for `/health ok` and for every container healthy.
  Once it does, the recorded output of
  `docker compose up -d --build && node infra/bootstrap.mjs && node infra/verify.mjs`
  goes into `specs/014-foundation/tasks.md` and the phase is closed.
- **A second Claude session is working on this branch with me.** It announced
  itself mid-run and we split the work rather than collide: it takes
  `apps/backend/src` and `workflows/` (the wiring above), I take `infra/`,
  `.env`, the image build and the gate run. Its plan is at `.harness/plan.md`
  and the `.harness/` line in `.gitignore` is its uncommitted change, not mine.
  If you did not start that session, say so and I will stop deferring to it.
- **Backup retention is configured twice.** `backup.retentionDays` is a
  settings-registry key, and the backup sidecar cannot read the registry from
  outside the API, so it takes `BACKUP_RETENTION_DAYS` from the environment
  instead. Both default to 14 and they have to be changed together. The clean
  fix is an internal endpoint the sidecar reads the number from; that is a
  later phase's work, not something to bolt on during a gate run.
- **The end-to-end spine spec has never run.** `apps/backend/test/spine.e2e.spec.ts`
  needs `E2E=1` and a live stack with n8n reachable. It is written; it is
  unproven.
- **Store-backed halves of the repository contract are skipped locally.** They
  run when `MONGO_URL` and `DATABASE_URL` are set, which CI does. Declared and
  skipped rather than silently absent, so the report says why.
- **GraphQL and WebSocket edges are scaffolded, not wired.** Scalars, the nudge
  service and the guards exist with specs; there are no resolvers or a gateway
  class yet, because P0 has no queries to serve. The `schema.graphql` artefact is
  therefore absent, which the contract generator now treats as normal rather
  than as a half-finished run.

---
