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
- [ ] T006 Verify live against n8n: list shows a next-run for the 5-minute
      sweep and none for the error handler; deactivate is reflected in n8n;
      run-now produces an execution (SC-001, SC-002, SC-003).
      **Blocked: Docker is down while its WSL storage is relocated.**

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
- [ ] T011 Verify `/admin` and a deep link both load from the gateway, and
      that the development CORS allowance is no longer needed (SC-005).
      **Blocked on Docker** (the gateway needs Postgres to start).

## Deferred / blocked

Everything requiring a running stack (T006, T011) is blocked only on Docker
being unavailable during the WSL storage move — not on any design question.
The code builds and its pure logic is unit-tested.
