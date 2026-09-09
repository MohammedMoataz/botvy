# Pre-016 review: what was found, what is fixed, what is left

Identity & Profile (P1) and Foundation (P0), reviewed in a fresh context before
phase 016 begins. Twenty-six findings. This file records all of them, what state
each is in, and which ones need a decision from the Owner. Thirteen are fixed.

The review's own headline is worth repeating: **the two most severe defects were
invisible to all 483 passing tests**, because nothing in the repository ever
asked Nest to assemble the application or dispatched a domain event. A test that
cannot be written is a defect that cannot be found.

---

## Fixed

### Critical

**1. The backend could not boot, in either role.** `IdentityModule` declared no
`imports:` while four providers injected `AuditPort`, `SettingsService` and an
Operations feature handler. `OperationsModule` already imports `IdentityModule`,
so the reverse was a cycle. Shared-kernel services moved to a `@Global()`
`PlatformModule`; the default-password check moved to `OperationsBootstrap`,
which asks Identity rather than Identity calling Operations. The worker also
never imported `AuthModule`.

**2. No domain event could reach a handler.** The relay's dispatch was a
three-case switch and `identity.UserRegistered` was not one of them, so **every
account created got no profile and no preferences** and every deletion left the
photo bytes on the volume. Two cases added.

**3. A refresh token could be accepted twice.** `rotate` blind-wrote the old row,
so two concurrent refreshes both succeeded and replay detection died for that
family. It claims conditionally now; a lost race is treated as a replay, because
it cannot be told from a theft.

### High

**4. Google sign-in could take over an account by email**, overwriting an
existing `googleSub`. Refused now, with its own error.

**5a. A banned administrator could un-ban themselves.** `unban` had no
self-check while `ban` and `setRole` did. *(5b is open — see below.)*

**6. The SDK deadlocked permanently on a refused refresh**, which is the normal
case. The spec that claimed to cover it built two token stores so the re-entrant
path never ran.

**7. `@IsEmail()` rejected the documented `admin` login** with a 400 before the
handler ran — the second half of a fix already made once in `env.schema.ts`.

**8. `GET /profile/photo` returned JSON**, because Nest's Express adapter
`res.json`s any object and a Buffer is one.

**9. `/api/v1/admin/settings` did not exist**, so the Overview page's
`Promise.all` rejected and the default-password warning never rendered either.
It also meant no registry key was retunable at runtime at all.

**21. Every 404 became "not available in this build yet"** in the SDK, including
"no such profile" and "no such service client".

### The two missing pieces

Not defects in written code but capabilities the phase claimed and did not
build, so they are recorded apart from the bugs above.

**A4's migration closed the other half of 10.** The edge existed and nothing
called it; every read on all four surfaces now goes to `/graphql`, and the six
REST read routes are gone rather than left beside the resolvers. Two GET
operations remain in `openapi.json` and both belong on REST: the binary photo
and the public `/health`. Constitution X is met at the client, not only at the
server.

It turned up three things worth naming. **`GET /auth/devices` had been handing
every device's push token to the browser** — the GraphQL `Device` reports
`hasPush` instead, so the leak closed with the migration. The two edges were
about to disagree about the photo field, one serving `photoUrl` and the other
`photoPath`, which would have given a store a profile whose photo key changed
name depending on which call filled it last. And `client.query` reported
failures in a shape no store branched on, so a refused read would have read as
an empty success.

**10. GraphQL and the WebSocket gateway were never built**, though P0 marked
T025, T026, T031 and T117 done. `src/graphql/` held `scalars.ts` and nothing
else; `src/ws/` held a `NudgeService` and a `WsAuthGuard` that **no module
provided**, so `attached` was false in both roles, every nudge in the
application went nowhere, and all three clients connected to a path that
answered nothing.

Built now: nine queries (`me`, `myDevices`, `devicesOf`, `profile`,
`bodyMetrics`, `preferences`, `users`, `settings`), each a thin adapter over the
query handler its REST read already uses, and a gateway that authenticates in
Socket.IO middleware, joins `user:<id>` and `ops`, stamps the install the alert
sweep reads, and warns then closes on token expiry. 24 specs.

Three things it turned up on the way. `@nestjs/graphql@13` peers on Nest 11 and
deep-imports a path Nest 12's exports map rewrites to a file that does not
exist — a **runtime** failure, so the blueprint's pin was unusable and both it
and `@nestjs/apollo` went to 14. `autoSchemaFile` writes its file as a side
effect of *serving*, so generation mode wrote none and reported nothing; the
schema comes from `GraphQLSchemaFactory` instead. And the SDK's
`connect_error` handler compared `String(payload)` against `'token_expired'`
where Socket.IO hands over an `Error` — so every refused handshake signed the
member out instead of refreshing.

**12. Domain events were not written in the same transaction as the aggregate.**
Every repository comment claimed they were; no handler opened a transaction, and
`IdentityModule` bound no `UnitOfWork` at all. Each save was a row and an outbox
entry as two independent statements — at-most-once delivery wearing an outbox.

Wrapped where writes belong together: register, sign-in, Google, the admin seed,
change-password, delete-account, ban, the profile bootstrap, the purge. Hashing
stays outside (scrypt against Prisma's five-second transaction timeout), and so
does the audit entry — it is in MongoDB and the member is in PostgreSQL, and
constitution I forbids inventing a transaction across the two.

`InMemoryUnitOfWork.collect` now refuses events raised with no transaction open,
so a handler that forgets fails its own spec. It found the admin seed
immediately, and `app.module.spec.ts` found the next one: `PrismaUnitOfWork`
imported `PrismaService` with `import type`, which emits no runtime token, so
Nest reported index [0] undefined at boot while tsc stayed green.

**11. Identity imported Operations' `AuditPort` directly**, and no rule
refused it. `AuditPort` moves to `shared/audit/` — four consumers in three
contexts is well past the constitution's own "move it on the third copy" — with
the Mongo adapter and the `audit_log` collection staying where they were.
`OperationsBootstrap` was also importing Identity's `AdminSeedService`: the
permitted direction reaching for the wrong thing, since a feature service is
private to its context. Identity publishes `AdminCredentialsQueryHandler` now,
and Operations binds a port to it in its own `infrastructure/`, which is where
`SeededAdminDeviceLookup` already does the same job.

Then the rule: `no-restricted-imports` refuses a cross-context relative import
from any `domain/` or `features/` file, at every depth it can be spelled.
`infrastructure/` is deliberately exempt — it is the sanctioned seam.

Writing it found that **the driver half of that rule had never run**. oxlint
ignores `patterns` outright when `paths` is also present, and the config had
both — so `mongoose/*`, `mongodb/*` and `@prisma/client/*` were checked by
nothing since P0, and a handler could import `mongodb/lib/db.js` freely. This
review had probed that rule and found it live, because it probed a bare
`import 'mongoose'`, which `paths` does catch. Both halves are probed now.

**15. Mobile had no way to set the gateway URL.** `readBaseUrl`, `writeBaseUrl`,
the `origin` setter and the `BOTVY_BASE_URL` build define were all written, and
nothing let a person change the value — so every real handset ran against
`http://10.0.2.2:8080`, the Android emulator's loopback to its own host. A
self-hosted platform whose premise is your own hostname could not be pointed at
one without building a new APK. There was even a translated `serverUrl` string,
used nowhere.

There is a screen now, reachable from the sign-in page and exempt from the
session redirect — a settings screen behind sign-in would be behind the thing it
exists to fix. It tests before it saves, against public `GET /health`, and tells
three outcomes apart: nothing answered, something answered that is not this
application, and connected with a version. Saving updates the live client and
drops the socket, not only secure storage.

### And the guard against the recurrence

`app.module.spec.ts` compiles both roles' dependency graphs. It found a fourth
defect on its first run — `IdentityModule` did not export `AdminSeedService`, so
the fix for finding 1 was itself incomplete.

It needed `unplugin-swc`: vitest's default esbuild does not implement
`emitDecoratorMetadata`, so every Nest provider declared as a bare class
resolves to `undefined` and the spec cannot tell a broken graph from a working
one.

---

## Needs your decision

Both are in [`../for-you/`](../for-you/) with options and costs:
[A3](../for-you/decide-3-ban-window.md) and
[A2](../for-you/decide-2-rate-limiting.md).

**5b. A banned or deleted member keeps API access until their access token
expires** — up to 15 minutes. `JwtAuthGuard` verifies the signature and nothing
else; ban and delete revoke refresh families only.

Not fixed rather than half-fixed, because the correct version needs a revocation
store that both roles agree on, and it collides with an existing gap: the relay
runs in the *worker*, so an event that invalidates a cache never reaches the
backend role. That affects the settings cache today and would affect this. It is
one design decision covering both, not a patch.

**13. No rate limiting on any credential endpoint.** Unlimited online password
guessing against a portal whose administrator login is published.

---

## Open, and honest about it

These are recorded rather than fixed, in rough order of how much they matter.

**14. Both generated-type re-exports are still commented out** with
`CONTRACTS_GENERATED = false`, so `packages/sdk` is hand-written and nothing
enforces agreement — which is the root cause of findings 6, 9, 15 and 17. The
stale `openapi.json` half is fixed: it was 26 of 30 operations behind, and both
it and `schema.graphql` are regenerated and now describe a REST surface of
commands plus two reads that belong there.

The cost of leaving it has gone down rather than up. The hand-written half is
now mostly GraphQL documents, and a wrong field name in one of those fails at
the server with a named error instead of arriving as `undefined` — which is what
made findings 6 and 9 invisible. Turning the flag on still means generating
clients on four surfaces, and still wants its own task.

**16–20, 22–25.** Onboarding "Skip" is a redirect trap; the ladder's
catch-all cannot catch a forgotten step at the *next* bump; the Socket.IO wire
shapes still disagree between the three clients, though the server side of them
now exists and the SDK's `connect_error` reading is fixed; event payloads
disagree with the catalogue and two events
are uncatalogued; a scatter of unreachable mobile wiring (push never starts,
notification permission never requested, no settings route for the password
change); and a list of bare literals that principle XII arguably wants as
registry keys.

**T140 and T141 are marked done without a named deliverable** — the Google
button (agreed, deliberate) and the photo picker (not agreed, simply absent:
`ApiClient` has no `uploadPhoto` and `photoPath` is written by nobody).

---

## What the review found clean

Worth recording, because it is what the next phase can rely on:

- **Guards.** A service token cannot reach a member route and a member token
  cannot reach `/internal/*`, in both directions; a member cannot reach an admin
  route; global guard order is authenticate → service-token → kind → role; no
  `@Public()` route leaks.
- **The replay rule itself** (`session-chain.ts`) is correct and judges replay
  before expiry. The Google **audience check is enforced** and unverified
  addresses are refused.
- **Principle XI on the backend**: no `process.env.TZ`, no server-local date
  arithmetic, every `Intl.DateTimeFormat` inside `shared/time` with an explicit
  zone.
- **Principle XII's `readOnly` trap is avoided** — refused on the entry's own
  flag, never a key prefix.
- **No context opens another context's store**, and the driver-import lint rule
  is live rather than decorative (probed).
- **Cross-surface field names agree** across the backend, the SDK, mobile and
  both web surfaces — including the v1 `/devices` defect being genuinely fixed.
- **The drift 1→2 ladder is correct** and its test opens a genuinely v1-shaped
  file and asserts the pre-existing row survived.
- **`multer` ships with `@nestjs/platform-express` 12** and `sharp`'s musl
  prebuilts are in the lockfile, so neither is the first-run failure it could
  have been.
- **The guards were already written for three transports.** `principalFrom` and
  `CurrentPrincipal` each handle REST, GraphQL and the socket, which is why the
  read edge needed no `GqlAuthGuard` of its own — the global guards covered it
  the moment resolvers existed. `JwtAuthGuard` needed one line to skip `ws`,
  where the handshake has already authenticated and there is no bearer header to
  read.

---

## One thing to correct in the blueprint

`contracts/graphql.schema.graphql` calls a body metric's timestamp `at`. The
aggregate, the REST read, the phone and the portal all call it `recordedAt`, and
the generated schema follows the code — giving one transport a different name
for the same field is how a member's weight chart works on one surface and is
empty on another. The document is the thing to change.
