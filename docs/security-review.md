# Security review — Botvy v2

Item by item, against the system as it stands on the `025-hardening-release`
branch. Each item says what is true, how it was checked, and — where something
is not closed — what was decided and why.

This is a **self-hosted personal system**: one Owner, a handful of members they
know, on a machine they control. That shapes several of the trades below, and
where it does, it is said out loud rather than left as an unexamined assumption.

---

## 1. One published port

| Service | `ports:` | Reachable from |
|---|---|---|
| `caddy` | `${EDGE_PORT:-80}:80` | anywhere the host is |
| `n8n` | `${N8N_BIND:-127.0.0.1:5679}:5678` | the host's loopback only |
| everything else | none | the compose network only |

`postgres`, `mongo`, `backend`, `worker`, `frontend` and `backups` publish
nothing. Constitution V holds.

**The automation editor is not on the internet.** n8n binds to `127.0.0.1`, so
the Owner reaches it through an SSH tunnel and nothing outside the host can. It
is not proxied by Caddy — the `@api` matcher lists `/api/*`, `/graphql`,
`/health`, `/media*` and `/docs*`, and everything else goes to the web app, so
there is no route to `n8n:5678` through the edge at all.

Checked: `infra/docker-compose.yml`, `infra/Caddyfile`, and `infra/verify.mjs`,
which counts non-loopback published ports on every run and fails the gate at
anything but one.

## 2. Browser origin policy

`app.enableCors({ origin: origins.length > 0 ? origins : false, credentials: true })`.

An empty `CORS_ORIGINS` means **same-origin only**, which is what running behind
the edge gives you, and it is never widened to a wildcard — credentials ride on
these requests, and `*` with credentials is the combination browsers refuse
anyway. An installation that serves the web app from a second hostname names
that hostname and nothing else.

## 3. Response headers

Set by `helmet` in the API and by Caddy at the edge.

| Header | Where | Value |
|---|---|---|
| `X-Content-Type-Options` | edge + helmet | `nosniff` |
| `X-Frame-Options` | edge + helmet | `DENY` |
| `Referrer-Policy` | edge + helmet | `strict-origin-when-cross-origin` |
| `Server` | edge | removed |
| `Strict-Transport-Security` | helmet | set by default on HTTPS responses |
| `Content-Security-Policy` | web app only | report-only by default; see below |

### Finding — no content security policy · **closed, and enforced**

`contentSecurityPolicy: false` in helmet stays, and that is not the gap: `/api/*`,
`/graphql` and `/media` are JSON and images, where a script-source directive has
nothing to act on, and turning it on there restores a broken Swagger UI and
GraphQL playground while covering no page at all.

The pages are the thing a policy protects, and they come from Next.js. The
policy now ships with them:

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | |
| `script-src` | `'self' 'nonce-…' 'strict-dynamic'` | the App Router emits an inline bootstrap script in every document, so it is a nonce or `'unsafe-inline'`, and `'unsafe-inline'` permits the attack. `'strict-dynamic'` lets the bootstrap's own chunks inherit its trust and denies it to an injected same-origin `<script src>`. `'unsafe-eval'` is added under `next dev` only |
| `style-src` | `'self' 'unsafe-inline'` | **deliberately not nonce'd** — a nonce here would disable the `'unsafe-inline'` beside it, and inline `style` attributes are how React's server render and PrimeReact's overlays position themselves. See below |
| `img-src` | `'self' data: blob:` | |
| `font-src` | `'self'` | PrimeIcons ships its own woff |
| `connect-src` | `'self'` | the API, GraphQL and the socket are same-origin behind the edge; `'self'` covers `wss://` to the same host |
| `frame-ancestors` | `'none'` | the same statement `X-Frame-Options: DENY` makes, to browsers that read the newer one |
| `base-uri`, `form-action` | `'self'` | |
| `object-src` | `'none'` | |

No `upgrade-insecure-requests`: the default installation serves plain HTTP
behind a tunnel that terminates TLS, and upgrading there asks the browser for a
scheme the edge does not answer on. No `report-uri`: nothing collects reports,
so the collector is the browser console and the Playwright case below.

**On `style-src`.** PrimeReact injects `<style>` elements at runtime from five
places — `Dialog` (and so `ConfirmDialog`), `DataTable`, `VirtualScroller`,
`Ripple` and `FocusTrap`, all through the `useStyle` hook; `ComponentBase` adds
four more, but only in unstyled mode, which this portal does not use. All of
them honour a nonce (`PrimeReactProvider`'s `nonce`, or `PrimeReact.nonce`), so
nonce-ing them is *possible*. It is not *useful*: a nonce on `style-src` voids
the `'unsafe-inline'` token in the same directive, and every server-rendered
`style="…"` attribute in the document then fails. The result would be an
unstyled portal, which is the quiet CSS-looking breakage this directive is known
for. `'unsafe-inline'` for styles and a nonce for scripts is the trade.

**Where it comes from.** `frontend/middleware.ts` mints a nonce per request,
puts the policy on the response *and* on the request it forwards — Next reads
the nonce back out of that copy, under either header name, and threads it onto
its own script tags. The edge does not set a policy of its own: two headers of
the same name are intersected, so a nonce-less copy from Caddy would forbid the
inline bootstrap the app's copy allows and the portal would render blank.

#### The switch · **report-only today**

It ships as `Content-Security-Policy-Report-Only`. Nothing has been verified
against a running stack — the engine was unavailable while this was written —
and a wrong policy on the App Router ships a blank page rather than an error, so
report-only is where it stays until somebody has watched the console on a real
one.

Turning it on is one line:

```
# .env
CSP_ENFORCE=on
```

then `docker compose up -d caddy`. The Caddyfile passes it to the web app as
`X-Botvy-Csp-Enforce` on the proxied request (`header_up`, so a client cannot
send its own), and the middleware picks the header name from it. It is a request
header rather than a frontend environment variable because `process.env` in
Next middleware is inlined at build time, and a rebuild is exactly what an
operator backing out a bad policy cannot wait for.

Flip `ENFORCED` to `true` at the top of `frontend/e2e/csp.spec.ts` in the same
change. That is the whole of it on the test side.

#### What is pinned

`frontend/e2e/csp.spec.ts`, against a running stack:

- the web app sends the expected header, the other name is absent, `script-src`
  carries a nonce and no `'unsafe-inline'`, and the page still renders an `h1`
  — a wrong policy here produces a blank document, not an error page;
- the nonce in the header is on at least one `<script>` in the document — a
  nonce nothing carries blocks everything the moment it is enforced, and
  report-only says nothing about it;
- `/health` carries **no** policy in either form, which is the "not the API's"
  half;
- `/` and `/login` raise **no** `securitypolicyviolation` events. That is the
  case that stops the rollout parking in report-only: it is green exactly when
  flipping the switch is safe.

What also still holds: the public page loads **no third-party resource at all**,
asserted in `frontend/e2e/public.spec.ts`, which fails if any request leaves the
origin.

## 4. Every credential, and what it alone would let somebody do

| Credential | Held by | Alone, an attacker could |
|---|---|---|
| `JWT_ACCESS_SECRET` | API | mint access tokens for any member, including an administrator. **The worst one.** |
| `JWT_REFRESH_SECRET` | API | nothing on its own: refresh tokens are checked against a row in PostgreSQL, so a forged one is unknown and is reported as invalid |
| `INTERNAL_SERVICE_TOKEN` | API, n8n, `backups` | call `/internal/*` — run the sweep, the tick, an ingest, report a heartbeat. No member data is readable through any of them |
| `AUTOMATION_WEBHOOK_SECRET` | API | forge a delivery to a subscriber, which would be believed by whatever the Owner subscribed |
| `MEDIA_SIGNING_SECRET` | API | mint media URLs — but `checkTarget` still applies, so the proxy is no more reachable than it is for anybody |
| `N8N_API_KEY` | API | drive the automation tool: list, activate and run workflows |
| `N8N_ENCRYPTION_KEY` | n8n | decrypt every credential n8n stores, which on this installation is the service token |
| `DATABASE_URL` / `MONGO_URL` password | API, worker, backups | everything, if they can also reach the port — which from outside the host they cannot |
| `ADMIN_PASSWORD` | seeded once | the portal, if it is still the seeded value |

Two consequences worth stating:

- **The refresh secret is not the access secret's equal.** A stolen access
  secret is a full compromise; a stolen refresh secret is nearly worthless
  because the token is also a database row. That asymmetry is why rotation
  urgency differs between them.
- **The service token is the one shared across processes**, so replacing it is
  the case the procedure below exists for.

### Replacing a machine credential without downtime

n8n and `backups` both authenticate with `INTERNAL_SERVICE_TOKEN`, so changing
it in one place breaks the other. The steps, in order:

1. Issue a **second** service client with the same scopes from the portal
   (Service clients → New). The secret is shown once.
2. Put the new secret into the callers — `.env` for `backups`, and the n8n
   credential for the workflows — and restart only those.
3. Confirm: the next `/health` shows every job fresh, and the audit trail shows
   the new client's name on the calls.
4. Revoke the first client from the portal.
5. Confirm the revoked one is refused: call `/internal/ops/heartbeat` with the
   old token and read a 401.

Step 5 is not optional. A revocation nobody tested is a revocation you find out
about the next time you need one.

## 5. Rate limits · **added in this phase**

Nothing limited anything before P11. Now every entry point does, with the limits
as registry keys so an operator retunes them from the portal:

| Bucket | Counted by | Default | Why that number |
|---|---|---|---|
| anonymous | client address | 20/min | sign-in, registration, refresh — the credential-stuffing surface. Far more than a person typing a password, far less than a word list |
| rest | member id | 300/min | a signed-in command |
| graphql | member id | 600/min | a signed-in read; one screen is several |
| internal | service client id | 1200/min | our own scheduled jobs; a limit that stopped the nightly sweep would be worse than what it prevents |
| socket | **socket id** | 600/min | per socket, not per member: a member with a phone, a browser and the extension legitimately sends three times as much |

Zero means unlimited, which is how somebody chasing a problem takes the limiter
out of the picture from the portal instead of by redeploying.

The limiter **fails open** if the settings store cannot be read. That is
deliberate and is the one place in the system where a security control does:
refusing every request when the database hiccups turns a slow store into a total
outage, and this is a ceiling on abuse rather than an authorisation decision.
The guards that decide *who may do what* run before it and fail closed.

Known limits of the limiter, stated rather than discovered later:

- A **fixed window**, so a caller who spends a whole window at the end of one
  and a whole one at the start of the next gets twice the limit across those two
  minutes. Irrelevant at these numbers.
- **Per process.** One API process serves the edge, so the per-process count is
  the whole count. Run the API twice behind a balancer and the effective limit
  multiplies by the instance count.
- The client address is read from `X-Forwarded-For`, **trusting one hop**, which
  is sound only because constitution V puts exactly one edge in front of
  everything. Anything else reaching the API directly could spoof it.

Specs: `backend/src/shared/rate-limit/rate-limit.spec.ts` (14), and the
socket's own case in `socket.gateway.spec.ts`.

## 6. The media proxy and the link fetcher

Both are things that fetch a URL somebody else chose, which is an open proxy
unless something says what they may reach. Both go through **the same**
`checkTarget`, deliberately — two guards are two chances to disagree about what
a private address is, and the wrong one is the one nobody is looking at.

Refused: any scheme but http/https; `localhost`, `*.localhost`, `*.internal`;
any bare name with no dot (which is what a compose service is called — `n8n`,
`mongo`, `postgres`); and every private, loopback, link-local and
carrier-grade-NAT range, IPv4 and IPv6 including v4-mapped forms.
`169.254.169.254` — the cloud metadata address — is covered by the link-local
rule and is pinned by its own test.

Redirects are followed **by hand**, one hop at a time, with the guard applied to
each destination *before* the request is made. `redirect: 'follow'` would check
`response.url`, which is after the request to `http://n8n:5678` has been made
and answered: the hole is the request, not the reply.

### Finding — a public name could point at a private address · **fixed**

`checkTarget` reads the URL, so it refused every private literal and did not
refuse `http://evil.example/` with an A record pointing at `10.0.0.5`.
Registering such a name costs nothing and is the standard way past a
string-only guard.

`checkResolvedTarget` now resolves the name and checks **every** address it
gives, and both callers use it. A failed lookup is not a refusal — DNS being
unreachable is our problem, and reading it as the source's would spend one of a
link's retry attempts on an outage of ours.

**Residual, accepted: DNS rebinding.** Between the lookup and the socket the
runtime opens, a hostile resolver can answer differently. Closing it needs the
check at connect time — an undici dispatcher with a custom `lookup`, which means
a direct dependency on undici kept in step with the version Node bundles, or two
HTTP stacks in one process. What remains is a race against a resolver the
attacker controls, to reach a service on a compose network, on an installation
whose outbound fetches are links its own owner saved. Not worth a second HTTP
stack.

## 7. Principals and guards

Constitution VI's three kinds, each with a spec:

| Rule | Where it is pinned |
|---|---|
| A refresh token replayed after rotation is detected and the whole family revoked | `identity.domain.spec.ts`, `register.spec.ts` — including that the legitimately-issued successor dies too |
| A service token in the socket handshake is refused **at the handshake** | `socket.gateway.spec.ts` — and asserts nothing was written to the socket: no principal, no rooms joined, nothing emitted |
| `/internal/*` refuses a member's access token | `auth.spec.ts` |
| An admin route refuses a member, and refuses a machine caller however trusted | `auth.spec.ts` |

The last is worth its own line: a service token carries scopes, never a role, so
`@Roles('admin')` refuses it by construction. n8n cannot ban a member.

## 8. Logs

Pass: `T1112`, against a full day from every container.

Searched for a JWT's three dot-separated base64url segments; `Bearer ` followed
by anything; `password`, `refreshToken`, `accessToken`, `serviceToken`,
`token=`; email addresses; a push registration token's shape; and a sentence
planted in a seeded conversation before the sample began — which is how member
*content* is searched for rather than guessed at.

**Run on 18 September 2026**, against every container the compose project has,
with the sentence *"the brass kettle on the third shelf whistles at dawn"*
written into a task's title and notes and a conversation's title by a member
registered for the purpose, before the sample window opened. The pass is
`node infra/scan-logs.mjs --since <window> --canary "<sentence>"`, and it asks
compose for the service list rather than carrying one — the first version named
the blueprint's `edge` and `api`, which compose calls `caddy` and `backend`, so
it reported cleanly on four containers and silently skipped the two loudest.

### Finding — MongoDB's slow-query log printed member content · **fixed**

Six hits, all in the `mongo` container, none anywhere else: the canary in a task
title and its notes, and a member's email address inside an outbox payload.
Every one came from the same line — `"msg":"Slow query"`, log id 51803 — which
prints the **command document** of any operation over `slowms`, and on this
host's disk an ordinary task write takes 400 ms.

So a member's own words were in a log, and the log is the one place this phase
promises they will not be.

MongoDB Community cannot redact log contents — `redactClientLogData` is an
Enterprise parameter — so the fix is the threshold: `mongod` now runs with
`--quiet --slowms 30000`. Re-run afterwards with a fresh canary planted the same
way: **0 hits across every container**, with the canary present in the corpus,
which is what makes the zero mean something.

**The residual, stated rather than implied:** an operation slower than thirty
seconds still logs its command, and that command may carry member content. It is
on the Owner's own host, readable by whoever can already read the volume, and it
cannot be redacted without Enterprise. If that becomes unacceptable the answer is
a log driver that filters, not a higher number.

`gate-logs/T1112-scrub-*.log` holds both runs — the finding and the clean pass.
The three allow rules in `infra/scan-logs.allow.txt` are the gate's own
`@example.test` accounts, `alice`/`bob` seeds, and systemd unit names in build
output (`getty@tty1.service`); each is a shape that cannot hide a real address.

## 9. Dependencies

`pnpm audit` on every workspace, recorded per release rather than once.

**Run on 18 September 2026: 24 advisories, of which 9 were runtime and are
closed.** The runtime ones were all transitive — `multer` (four, through
`@nestjs/platform-express`), `qs` (two), `uuid`, `js-yaml` and `deepmerge-ts` —
and `pnpm.overrides` in the root package now pins each to its patched range.
The backend suite (1690), both typecheck projects, the build and
`infra/verify-esm.mjs` are green on the pinned tree, which is the evidence that
the pins are not a paper fix.

### Accepted, with reasons

**The dev toolchain: `vitest`, `vite`, `esbuild`, `@vitest/mocker`.** None of
them is in either image — they are test and build tooling, and the critical one
(arbitrary file read through the Vitest UI server) needs a UI server this
repository never starts. Pinning `vite` to the patched range was *tried* and
broke vitest outright (`__vite_ssr_exportName__ is not defined`, every suite
red), because vitest 4 carries its own vite. So the decision is explicit: they
stay as the tool ships them, and they are re-checked at each vitest major rather
than forced.

**`lodash`, two advisories.** The patched range the advisory names is `>=4.18.0`
and that version does not exist for the package the warning is about — the
affected copies are `4.17.23`, pulled by `@graphql-codegen/plugin-helpers`, a
development dependency. Nothing in this repository imports lodash directly
(grepped across `backend/`, `frontend/`, `extension/` and `packages/`), and
`_.template` — the code-injection path — is not reachable from anything we call.
`migrate-mongo` carries `4.18.1`, which is past the range.

Re-check both lists at the next release; an advisory that has been accepted once
is not accepted for ever.

## 10. The default administrator password

The API seeds `ADMIN_EMAIL` / `ADMIN_PASSWORD` when that account is missing and
never resets an existing one, so a changed password sticks. While it is still
the seeded value:

- `ops.adminPasswordIsDefault` is true in the registry;
- `/health` reports `defaultAdminPassword: true`;
- the portal shows a warning on **every** page load, read from `/health` rather
  than from the sign-in response — the response only knows what this session was
  opened with and says nothing after a reload;
- the API warns on every boot.

This is as loud as it can be made without refusing to start, which would make a
first install unusable.

**On this installation**, the Owner chose a password that is on every breach
word list, on a host reachable through a public quick tunnel. It was raised once
and the choice stands; it is recorded here because a review that omits the
finding its author was overruled on is not a review. The anonymous rate limit
added in §5 is what now stands between that password and an unbounded guessing
attempt.

## 11. The inherited exposed key · **half closed**

A Google service-account key was committed to the v1 repository.

**Rotated on 10 September.** `secrets/firebase-admin.json` now carries key id
ending `424ead`, and that is the credential the backend uses.

**The exposed key ending `c3a2a5` has not been deleted, so it is still live.**
This is the half that matters and it is worth being exact about why: adding a
key revokes nothing. Removing the file from the repository, rewriting history
and making the repository private all leave the key working. A service-account
key is valid until it is **deleted at the provider**, and that has not happened.

So until `T1113` closes, treat `c3a2a5` as known to everybody who has ever
cloned the v1 repository, and assume anything it is authorised to do can be done
by them. What that is depends on the service account's roles, which are worth
narrowing at the same time — Firebase Cloud Messaging needs very little.

Status: **open.** Not accepted and not deferred any longer — the remaining step
is a deletion in a console, and this section stays until it is done.
