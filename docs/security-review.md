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
| `Content-Security-Policy` | **off** | `helmet({ contentSecurityPolicy: false })` |

### Finding — no content security policy · **accepted, with the reason**

`contentSecurityPolicy: false` was set in P0 because helmet's default policy
breaks the Swagger UI and the GraphQL playground, both of which load inline
script. Those are development surfaces — `/docs` is only mounted when
`NODE_ENV !== 'production'` — so a production installation is running without a
CSP for no benefit.

The web app is the thing a policy would protect, and it is served by Next.js
behind Caddy rather than by the API, so the policy belongs on the **edge**
rather than in helmet. It is not added in this phase: Next's App Router emits
inline bootstrap script, so a correct policy needs nonce propagation through the
document, and getting it wrong ships a blank page rather than an error. Recorded
in `enhancements/` with what it would take.

What holds in the meantime: the public page loads **no third-party resource at
all**, and that is asserted rather than promised — `apps/frontend/e2e/public.spec.ts`
fails if any request leaves the origin.

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

Specs: `apps/backend/src/shared/rate-limit/rate-limit.spec.ts` (14), and the
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

> **Not yet run.** The sample needs a day of logs from a running stack, and the
> engine was unavailable while this phase was written. The grep set and the
> planted-sentence method are settled; the run and its findings belong here.

## 9. Dependencies

`pnpm audit` on every workspace, recorded per release rather than once.

> **Not yet run** — same blocker as §8.

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

## 11. The inherited exposed key

A Google service-account key was committed to the v1 repository. The Owner chose
to defer rotation.

**A service-account key stays valid until it is deleted at the provider** —
removing it from the repository, rewriting history and revoking nothing all
leave it live. Until `T1113` is done, treat that key as known to whoever has
ever cloned the repository, and assume anything it can do can be done by them.

Status: **deferred at the Owner's explicit instruction.** Not closed, not
accepted — deferred, which is a different thing and is why it stays in this
document until the key is deleted.
