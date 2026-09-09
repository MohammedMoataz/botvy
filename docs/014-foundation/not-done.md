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
- ~~**GraphQL and WebSocket edges are scaffolded, not wired.**~~ **Built in the
  pre-016 review pass.** This entry was honest about the resolvers and the
  gateway being absent while `tasks.md` marked T025, T026, T031 and T117 done —
  the paperwork and the task list disagreed, and the task list was the one being
  read. Nine queries, a gateway that authenticates in Socket.IO middleware, and
  `schema.graphql` all exist now, and every read on all four surfaces goes
  through the edge. The `NudgeService` and `WsAuthGuard` mentioned here as
  "existing with specs" were provided by no module at all, so nothing they did
  could ever have reached anybody.

## Measured, not estimated

The `chown -R botvy:botvy /app` both runtime images ran turned out to cost more
than the minutes it spent: removing it took the backend image from **1.24 GB to
173 MB**. It was rewriting every file of the build output into a second layer,
so the image carried two copies of `/out` — one root-owned, one botvy-owned.
Neither application writes its own code, so the chown bought nothing at all.

## Deferred by the Owner, on the record

Answered on 9 September; the reasoning is in
[`../015-identity-profile/decisions-answered.md`](../015-identity-profile/decisions-answered.md).

- **No rate limiting on any credential endpoint** (A2 → P11). `/auth/login` is
  public and unthrottled, and this installation's administrator login is
  published in `SETUP.md`. Worth re-reading if this becomes reachable from the
  internet before P11.
- **A banned or deleted member keeps API access until their token expires**
  (A3 → P11), up to `JWT_ACCESS_TTL`. The escalation path is closed — a banned
  administrator cannot un-ban themselves — but the window is open. Deliberately
  not patched with a shorter TTL either: the answer was P11, and a half-measure
  nobody asked for is worse than a recorded gap.
- **Backup retention stays configured twice** (A6 → accept). See the entry
  above; it is a principle-XII wart rather than a bug.
- **Google sign-in has no button on any surface** (A1 → P9). Endpoints, the
  audience check and the cubits are built and tested; `GOOGLE_CLIENT_IDS` is
  empty, and a control that always fails teaches people the app is broken.

---
