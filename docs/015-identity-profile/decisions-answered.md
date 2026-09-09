# What the Owner decided, and what it cost

The six calls put in `docs/for-you/` before phase 016, with the answers given on
9 September 2026. Recorded here because that folder is emptied as it is
answered, and a decision needs somewhere permanent to live.

---

## A1. Google sign-in — **defer to P9**

Endpoints, the audience check, the three-case fork, the SDK's
`GoogleLinkRequired` and the phone's cubit stay as they are: built, tested, and
reachable by no button, because `GOOGLE_CLIENT_IDS` is empty and a control that
always fails teaches people the app is broken.

P9 is the extension phase, which has to solve
`chrome.identity.launchWebAuthFlow` anyway — doing all four surfaces at once is
cheaper than three now and one later. Nothing to build until then.

## A2. Rate limiting on `/auth/login` — **leave to P11**

`/auth/login` stays public and unthrottled, and this installation's
administrator login is published in `SETUP.md`. Recorded in
[`not-done.md`](../014-foundation/not-done.md) and picked up with the rest of
the hardening in `specs/025-hardening-release`.

Worth re-reading if this ever becomes reachable from the internet before P11.

## A3. The banned-member window — **leave to P11**

A banned or deleted member keeps API access until their access token expires, up
to `JWT_ACCESS_TTL` (15 minutes). The escalation path is already closed — a
banned administrator cannot un-ban themselves — but the window stays open.

Deliberately not patched with a shorter TTL either, which was the middle option:
the answer was P11, and shortening it would have been a half-measure nobody
asked for. It goes in with the rate limiting, and both want the same cross-role
revocation store — which would also close the settings-cache gap where the relay
runs in the worker and an invalidation never reaches the backend role.

## A4. When the clients move to GraphQL — **migrate now**

Done. Six reads in the SDK and three on the phone moved to `/graphql`, and the
six REST read routes were removed rather than left beside the resolvers. Two GET
operations remain, and both belong on REST: the binary photo and the public
`/health`.

Three things it turned up, all now fixed: `GET /auth/devices` had been handing
every device's push token to the browser; the two edges were about to disagree
about the photo field; and `client.query` reported failures in a shape no store
branched on, so a refused read would have read as success.

## A5. One `.env` or two — **one file**

Done. The four values `.env.v2` existed to override are folded into `.env`, each
keeping what v1 wanted in the comment above it, and both `.env.v2` and the
unreferenced `.env.v2gate` are gone.

The cost the decision named is real: **v1 no longer runs from this file.** Its
own original is at `.env.backup-before-v2-20260907T200952Z`, and the immediately
previous one is backed up beside `.env`. v1's *data* is untouched either way —
v2 is a separate compose project on its own volumes.

## A6. Backup retention in two places — **accept**

`backup.retentionDays` stays a registry key the portal can retune, and
`BACKUP_RETENTION_DAYS` stays the environment variable the backup container
actually reads, because that container runs outside the API and cannot read the
registry. Both default to 14; change them together. Already noted in `SETUP.md`.

A principle-XII wart rather than a bug. The clean fix — an internal endpoint
serving the number — is P11's.

---

## The things only the Owner can do

| | Answer | State |
|---|---|---|
| `corepack enable` | done | `pnpm 9.15.0` resolves from `C:\Program Files\nodejs` |
| Free disk space | partly | `D:` went 4.6 GB → 22.8 GB, and **Docker starts now** |
| Rotate the Firebase key | later | still tracked as `T1113` in `specs/025-hardening-release` |
| Push a branch | attempted | it could not have worked — see below |
| GHCR visibility | not deploying yet | — |
| Google OAuth ids | not doing this yet | consistent with A1 |

### Why the push failed, for both of us

`specs/014-foundation/tasks.md` was corrupted by a cp1252/UTF-8 round trip that
ran once per commit, doubling the file each time: 27 KB, then 28, 31, 36, 48,
76, 138 KB … 335 MB, 746 MB, **1.58 GB**, across nineteen commits.
`1aaf6ed` ("restore tasks.md, corrupted by an encoding") fixed the working file,
but git keeps every version, and GitHub refuses any file over 100 MB.

It was repaired in history rather than squashed away. The corruption is not
perfectly reversible — deep mojibake lands on cp1252's five undefined slots, so
the original round trip lost information — but the task marks are ASCII and
survive at any depth, so each of those commits was rebuilt as the
correctly-encoded text carrying **its own** marks, read back out of its own
blob. The mark counts climb 12 → 32 across the nineteen, exactly matching the
commit order, which is how we know it is faithful rather than nineteen copies of
one version.

The repository went from 206 MiB of loose objects to 54 MiB packed, and then to
what it should always have been.
