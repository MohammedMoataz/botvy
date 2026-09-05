# Implementation Plan: Web — Admin Portal & Public Site (P10)

**Branch**: `024-web-admin-public` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/024-web-admin-public/spec.md`; blueprint
`graphql.schema.graphql` (admin queries), `rest-commands.md` (admin commands),
`internal.md` (health), research R-19, R-25.

## Summary

Turn the Next.js skeleton into the operator's console and the product's front door.
Almost no new backend work: the admin queries and commands were specified in the
blueprint and mostly shipped alongside their contexts. This phase is the interface, the
audit surface, the two guard rails (last administrator, self-ban) and the public pages.

## Technical Context

**Primary Dependencies**: Next.js 16 App Router, MobX, PrimeReact (pinned MIT line),
`next-intl` for English and Arabic, `@botvy/sdk`, `@botvy/tokens`; Playwright for the
smoke suite; no charting library — usage is a table plus a small hand-drawn bar strip

**Storage**: none of its own; reads through GraphQL, writes through REST commands

**Testing**: Playwright — login, promote, ban, change a setting, run a workflow, retry
a link, sign out; vitest for the two guard rails in the backend; an accessibility and
performance audit on the public pages

**Performance Goals**: overview interactive in under 1.5 s on the reference machine;
public pages score ≥ 90

**Constraints**: MobX stores per request, never module-level; PrimeReact components
are client components; no analytics or third-party scripts on the public site

**Scale/Scope**: ~45 frontend files, ~8 backend files (audit query, guard rails,
subscriptions editor endpoint)

## Constitution Check (v2.1.0)

| Principle | Status | How |
|---|---|---|
| I. API owns data | PASS | The portal holds nothing; every read is a query, every write a command |
| II. n8n | PASS | The workflows page proxies the automation tool through the API; the browser never talks to it |
| III. Local-first LLM | PASS | Usage is reported, not generated |
| IV. Forward-only migrations | PASS | One small `migrate-mongo` script if the audit index is missing |
| V. Single public surface | PASS | Both route groups sit behind the same edge |
| VI. Multi-user, principals | PASS | Admin routes require the role; the two guard rails prevent lockout and self-ban |
| VII. Test-then-verify | PASS | Playwright covers each operator act; the guard rails have backend specs |
| VIII. YAGNI | PASS | No charts library, no analytics, no member-data editing |
| IX. Contexts, slices, ports | PASS | Backend additions are slices in Operations and Identity |
| X. Commands / queries / streams | PASS | Reads GraphQL, writes REST, live heartbeats over the `ops` socket room |
| XI. Times belong to the user | PASS | Operator screens show the Owner's browser zone with the zone named, since they are operational rather than personal |
| XII. Configuration | PASS | The settings page is the registry rendered from its own schema, so a new key needs no interface work |

## Design

### Route groups

```text
apps/frontend/app/
├── (marketing)/
│   ├── page.tsx                 # what Botvy is, in one sentence and three sections
│   ├── features/page.tsx        # the capability list with screenshots
│   ├── download/page.tsx        # app and extension, pointing at release artefacts
│   └── privacy/page.tsx         # what runs where, what leaves the machine (nothing)
└── (admin)/
    ├── layout.tsx               # rail, auth guard, locale switch
    ├── page.tsx                 # overview
    ├── users/ · devices/ · settings/ · automation/ · ingestion/ · usage/ · audit/ · service-clients/
```

### The settings page renders itself

`settings` returns each key with its schema, default, current value and description.
The page maps a schema kind to a control (boolean → switch, enum → dropdown, time →
time picker, number → spinner with bounds, array of strings → chips, object → JSON
editor with validation). A key added in a later phase appears with a usable control
and no interface change — the point of the registry (FR-006).

### Live operational state

The admin socket joins the `ops` room from P0 and receives `ops.heartbeat`; the
overview updates without polling, and falls back to a 30-second refresh when the socket
is unavailable. Health itself is the same endpoint the compose healthcheck uses, so
there is one truth.

### Guard rails (backend, small)

`admin-set-role` refuses to demote the last administrator; `admin-ban` refuses when
the target is the caller. Both return a named error the interface shows inline. Specs
live with the Identity slices.

### Audit

`audit_log` has been written since P1; this phase adds the query (filter by actor,
action, target, range) and the page. Every administrative command already writes a
row through the Operations port, so SC-002 is a matter of asserting it in the
Playwright suite rather than adding writes.

### Public site

Static by default (`export const dynamic = 'force-static'`), so it loads when the API
is down (spec edge case). Content in `next-intl` message files for English and
Arabic; `dir` switches from the locale. Downloads link to the GitHub release assets
built in P0's release workflow. No third-party scripts at all, which is most of how
SC-005 is met.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Schema-driven settings form | A new registry key must not require interface work, or operators will stop adding keys and hard-code values again | A hand-written form per key drifts from the registry the first time someone is in a hurry |
| Live heartbeats over the socket in addition to polling | A stalled job should surface immediately on a screen the Owner already has open | Polling only (a minute of blindness on the one screen that exists to show blindness) |

## Verification gate

```powershell
pnpm --filter @botvy/frontend build
pnpm --filter @botvy/frontend test:e2e     # login, promote, ban, setting, workflow, retry, sign out
pnpm --filter @botvy/backend test          # last-administrator and self-ban guard rails
# manual: stop the scheduler → the overview names the stale job within 15 minutes;
#         change a default → a new member starts with it; Lighthouse on the public pages ≥ 90
```
