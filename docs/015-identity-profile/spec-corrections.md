# Where the P1 spec was wrong

Identity & Profile (P1), `specs/015-identity-profile`.

Places the phase's own task list said something the code could not honour, or
that a decision made after it was written has overtaken. Recorded because the
next phase reads those tasks, and an uncorrected one gets inherited.

---

## T127 — importing v1 profiles is now obsolete

The task called for a one-off `migrate-mongo` script to copy time zones, body
facts, foods, allergies and training days out of v1's `coaching_profiles` table
for every member without a `profiles` document.

There is nothing to copy. The Owner chose a clean start
(`docs/014-foundation/answered-inputs.md`, A1), so v2 runs as its own compose
project on its own volumes and cannot see v1's PostgreSQL at all. Every member
registers again, and `bootstrap-on-registered` (T122) gives them the registry
defaults — which is the path the task described as the fallback anyway.

Marked `[~]` rather than `[X]` in `tasks.md`, so it reads as retired rather than
delivered. If a v1 import is ever wanted, the data is in
`backups/pre-v2-identity-20260908T181658Z.dump`.

## T111 and T114 were partly built in P0

Sign-in and password change landed in the foundation phase, because the
administrator seed had been warning on every boot that the Owner should change
the default password at an endpoint that did not exist and could not have been
reached. See `docs/014-foundation/auth-in-p0.md`.

P1 did not rebuild them. It extended them: sign-in now registers a device and
opens a refresh family bound to it, and a password change revokes every family
the member holds. The tasks are marked done on that basis.

## T102's Google verifier uses a different library than the plan named

The task specified `google-auth-library` with the audience from env, and that is
what was built — but v1 verified Google tokens through `firebase-admin`, which
is already a dependency here for push, so the cheaper-looking option was to
reuse it.

It would have been wrong. `firebase-admin`'s verifier expects a *Firebase Auth*
token, while Flutter's `google_sign_in` and the extension's `chrome.identity`
flow produce a raw Google id token whose audience is an OAuth client id. And
push is optional in this platform while sign-in is not: routing authentication
through the Firebase SDK would leave an installation with no FCM credentials
unable to let anyone in.

The plan was right and the reasoning was not written down anywhere. It is now,
in `infrastructure/google-id-token.verifier.ts`.

## `GOOGLE_CLIENT_IDS` was not in the environment contract

The phase needs it and no spec mentioned it. Added to `env.schema.ts` as an
optional value, to `infra/.env.example`, and to the compose `x-backend-env`
anchor. Optional matters: unset refuses Google sign-in and leaves password
sign-in working, rather than failing the process at boot for a feature the
installation may not use.

It is a list because each surface has its own client id — Android, iOS, the web
app and the extension are four — and a token minted for any of them came from
this installation.

## The Profile context was marked done with no HTTP surface

T120–T126 were all marked `[X]`, and the aggregates, adapters, handlers and
forty specs behind them were real. There was no controller and no module, so
none of it was registered in either role and nothing could reach any of it.

Found while writing the SDK's `ProfileStore` against `/profile` — that is, by
trying to *use* it, not by reading the task list. It is the same failure P0 had,
where `T024` and `T029` were marked done while `health.controller.ts` did not
exist and the compose healthcheck therefore never passed.

The habit that produces it is marking a task on the strength of its handler.
A slice is not done until something can call it.

Fixed in the same commit as T150: `ProfileController` plus `ProfileModule`, with
the providers in the module and the controller declared by the backend role, so
the worker gets the two event handlers without the routes.

## The SDK was typed against Node, not the browser

`packages/sdk/tsconfig.json` inherited `lib: ["ES2023"]` and set no `types`, so
a package whose own docstring promises "no Node built-ins" was resolving `fetch`,
`Response`, `FormData` and `Blob` from `@types/node`. The two `Response`
definitions differ by a method, which surfaced as a type error in a test fake
that looked like the fake's fault.

Now `lib: ["ES2023", "DOM"]` with `types: []`. Besides fixing the error without
a cast, it makes the promise enforceable: an accidental `node:fs` import stops
compiling rather than shipping to a browser and failing there.
