# Tasks: Workflow Management & Admin Portal Delivery

**Branch**: `004-workflows-admin-ui` | **Input**: `spec.md`

## Phase A — Next-run computation (pure, unit-tested)

- [x] T001 `src/workflows/next-run.ts` — derive the next scheduled run from
      an n8n schedule-trigger definition, and locate a workflow's companion
      webhook path.
- [x] T002 11 vitest cases: no-schedule → null, minute/hour intervals,
      daily-before vs daily-after the current time, earliest across several
      rules and across several trigger nodes, non-schedule nodes ignored,
      and webhook path found/absent.
      Verified: `vitest run` → **36 passed (5 files)**.
      Design note: a cron-expression rule returns null ("unknown") rather
      than a guess — showing a wrong next-run is worse than showing none,
      and evaluating cron correctly needs a real parser with timezone
      support, which is not yet warranted.

## Phase B — Gateway endpoints

- [x] T003 `N8nService` — list (joining each workflow to its most recent
      execution), activate, deactivate, and trigger-via-companion-webhook.
- [x] T004 `WorkflowsController` — `GET /workflows`,
      `POST /workflows/:id/{activate,deactivate,run}`, all `@Roles('admin')`.
- [x] T005 n8n unreachable surfaces as a 503 with the URL that failed, and
      is never conflated with an empty workflow list (FR-007). The
      executions call degrades to an empty list on its own, so a missing
      execution history does not fail the whole listing.
- [x] T006 Verify live against n8n (SC-001, SC-003).
      `GET /workflows` returned:
      ```
      Botvy Error Handler   | active=false | nextRun=—                        | canTrigger=false
      Botvy Reminder Sweep  | active=true  | nextRun=2026-08-29T22:59:18.837Z | canTrigger=true
      Botvy Nightly Coaching| active=false | nextRun=—                        | canTrigger=true
      ```
      Exactly as specified: a next-run for the scheduled sweep, none for the
      error handler (no schedule), and `canTrigger` true only where a
      companion webhook exists.
      Run-now: `POST /workflows/eJ67.../run` →
      `{"triggered":true,"status":200,"webhook":"botvy-sweep"}` (SC-003).
      Role guard (SC-004): a `user`-role token → **403**; the admin → 200.
      Investigated the sweep's `crashed` last-execution: n8n's own log says
      *"Marked executions as crashed … due to … a restart of n8n"* — an
      artifact of the Docker instability, not a node failure.

## Phase C — Admin SPA delivery

- [x] T007 Move the admin API from `/admin/*` to `/api/admin/*`.
      Rationale: the SPA is served at `/admin`, so an API route sharing
      that prefix would depend on middleware ordering to resolve. Making
      the namespaces disjoint removes the ambiguity instead of refereeing
      it with exclude patterns. SPA callers and page labels updated to match.
- [x] T008 `ServeStaticModule` at `/admin` with SPA fallback, registered
      only when a build is actually present so a missing SPA cannot stop
      the API from starting (spec's Edge Cases).
      Verified: path resolution finds `apps/admin/dist` when running from
      the workspace and `/app/admin` inside the image.
- [x] T009 Dockerfile builds the SPA in the builder stage with an empty
      `VITE_API_BASE_URL` (same-origin in production, so no CORS) and
      copies it to `/deploy/admin`.
- [x] T010 Admin SPA Workflows page: table of name, state, next run, last
      execution, with activate/deactivate and a run-now button that is
      disabled (with an explanatory title) for workflows having no webhook.
      Verified: `tsc --noEmit` → exit 0; `vite build` → 94 modules, built.
- [x] T011 Verify `/admin`, deep links, and same-origin operation (SC-005).
      `GET /admin/` → 200 and real HTML; `GET /admin/users` (a client-side
      route) → 200 via the SPA fallback rather than 404;
      `GET /api/admin/stats` without a token → **401**, proving the static
      handler does not shadow the API. The `/api/admin` move (T007) is what
      makes that hold.

## Live browser verification (end to end, same-origin)

Driven through a real browser against the running stack:

- **Login** succeeded from `/admin` with no CORS configuration — the SPA and
  the API share an origin, which was the point of serving it here.
- **Overview** rendered live data: health up, 2 users, 1 device, 11 messages
  today, 1,755 tokens today.
- **Workflows** rendered all three workflows from live n8n, with "Run now"
  **disabled and explained** on the error handler ("no webhook trigger, so it
  cannot be run on demand") and enabled on the two that carry one.
- **SC-002**: clicking Deactivate turned the sweep off *in n8n itself*
  (`active: false` via n8n's own API), the row updated to "inactive", and
  clicking Activate turned it back on (`active: true`).

Every acceptance scenario for this feature is now verified.
