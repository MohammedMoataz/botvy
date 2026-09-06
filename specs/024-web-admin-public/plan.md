# Implementation Plan: Web — Admin Portal & Public Site (P10)

**Branch**: `024-web-admin-public` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/024-web-admin-public/spec.md`; blueprint
`graphql.schema.graphql` (admin queries), `rest-commands.md` (admin commands),
`internal.md` (health), research R-19, R-25.

## Summary

Turn the Next.js skeleton into the operator's console and the product's front door.
Almost no new backend work: the admin queries and commands were specified in the
blueprint and mostly shipped alongside their contexts. Several screens exist already —
P1's users, devices, service clients and default-password warning, P7's ingestion
queue — so this phase extends them rather than building them again. What is genuinely
new is the settings page, the workflows page, usage, the audit surface, the two guard
rails (last administrator, self-ban) and the public pages.

## Technical Context

**Primary Dependencies**: Next.js 16 App Router, MobX, PrimeReact (pinned MIT line),
`next-intl` for English and Arabic, `@botvy/sdk`, `@botvy/tokens`; Playwright for the
smoke suite; no charting library — usage is a table plus a small hand-drawn bar strip

**Storage**: none of its own; reads through GraphQL, writes through REST commands

**Testing**: Playwright — login, promote, ban, change a setting, run a workflow, retry
a link, a seeded stale heartbeat, sign out — run in CI against the compose stack;
vitest for the two guard rails and for the registry being read per invocation rather
than cached at boot; an accessibility and performance audit on the public pages

**Performance Goals**: overview interactive in under 1.5 s on the reference machine;
public pages score ≥ 90

**Constraints**: MobX stores per request, never module-level; PrimeReact components
are client components; no analytics or third-party scripts on the public site

**Scale/Scope**: ~45 frontend files, ~5 backend files (the audit resolver, the two
guard rails, the per-member grouping on usage)

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. API owns data | PASS | The portal holds nothing; every read is a query, every write a command |
| II. n8n | PASS | The workflows page proxies the automation tool through the API; the browser never talks to it |
| III. Local-first LLM | PASS | Usage is reported, not generated |
| IV. Forward-only migrations | PASS | One small `migrate-mongo` script if the audit index is missing |
| V. Single public surface | PASS | Both route groups sit behind the same edge |
| VI. Multi-user, principals | PASS | Admin routes require the role; the two guard rails prevent lockout and self-ban |
| VII. Test-then-verify | PASS | Playwright covers each operator act and the stale-heartbeat display; the guard rails and the no-restart reload have backend specs |
| VIII. YAGNI | PASS | No charts library, no analytics, no member-data editing; event forwarding is a registry key, not a second store |
| IX. Contexts, slices, ports | PASS | Backend additions are slices in Operations and Identity |
| X. Commands / queries / streams | PASS | Reads GraphQL, writes REST, live heartbeats over the `ops` socket room |
| XI. Times belong to the user | PASS | Every time on an operator screen is resolved against the signed-in administrator's own profile zone through `shared/time`, with the zone named beside it; the browser zone is never read |
| XII. Configuration | PASS | The settings page is the registry rendered from each entry's own `schema`, so a new key needs no interface work |

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
    ├── login/page.tsx           # from P0, extended in P1; outside the role guard, and the
    │                            #   only admin route that is — the guard runs after sign-in
    ├── page.tsx                 # overview
    ├── users/ · devices/ · settings/ · workflows/ · ingestion/ · usage/ · audit/ · service-clients/
```

### One name per surface

The spec speaks the operator's language; the routes follow the blueprint's tree. They
line up as: the **reading queue** is `ingestion/`; **automation** — the workflows and
the events forwarded to them — is `workflows/`; the **administrative record** is
`audit/`. Prose in this phase uses the spec's word, code uses the route's.

### The settings page renders itself

`Setting` carries `key`, `value`, `default`, `schema`, `readOnly` and `description`,
so the page has everything it needs from one read. It maps the kind in `schema` to a
control (boolean → switch, enum → dropdown, time → time picker, number → spinner with
bounds, array of strings → chips, object → JSON editor with validation), and renders a
`readOnly: true` entry as a value with no control and a line saying the system writes
it. A key added in a later phase appears with a usable control and no interface change
— the point of the registry (FR-006).

The forwarding list the workflows page toggles is one of those keys,
`automation.subscriptions`, edited through `PATCH /admin/settings/:key` with the same
control the settings page builds for it. There is no second read or write path for it:
a registry key with an interface of its own would be the duplication principle VIII
exists to prevent (FR-009).

`PATCH /admin/settings/:key` refuses a `readOnly` key on the server as well, so the
interface's omission of a control is a courtesy, not the guard (FR-007).

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

`audit_log` has been written since P1; the blueprint contract already declares
`AuditEntry`, `AuditConnection` and the `audit(actor, action, targetType, from, to,
first, after)` query, so this phase adds the resolver behind it and the page in front.
Every administrative command already writes a row through the Operations port, so
SC-002 is a matter of asserting it in the Playwright suite rather than adding writes.

### Public site

Static by default (`export const dynamic = 'force-static'`), so it loads when the API
is down (spec edge case). Content in `next-intl` message files for English and
Arabic; `dir` switches from the locale. Downloads link to the GitHub release assets
built in P0's release workflow. No third-party scripts at all, which is most of how
SC-005 is met.

### Two things this phase decided not to own

Service clients were finished in P1 — the create dialog that shows the secret once and
the revoke action — and nothing here changes them, so the page is left alone and has no
requirement of its own in this spec.

A banned member also stops receiving notifications; that follows from Notifications
handling `identity.UserBanned`, which belongs to P2 and cannot be asserted from this
phase's screens. The clause left US2 rather than becoming a promise nothing here tests.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Schema-driven settings form | A new registry key must not require interface work, or operators will stop adding keys and hard-code values again | A hand-written form per key drifts from the registry the first time someone is in a hurry |
| Live heartbeats over the socket in addition to polling | A stalled job should surface immediately on a screen the Owner already has open | Polling only (a minute of blindness on the one screen that exists to show blindness) |

## Verification gate

```powershell
pnpm --filter @botvy/frontend build
pnpm --filter @botvy/frontend test:e2e     # login, promote, ban, setting, workflow, retry, stale job, sign out
pnpm --filter @botvy/backend test          # guard rails; registry read per invocation
# CI runs test:e2e in a `frontend-e2e` job against the compose stack, gated like P0's spine suite
# manual: stop the scheduler → the overview names the stale job within 15 minutes;
#         change a default → a new member starts with it; Lighthouse on the public pages ≥ 90
```
