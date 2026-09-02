# Tasks: A Way In, and a Coach That Knows You

**Spec**: [spec.md](./spec.md) · **Status**: Implemented

## Getting in

- [x] **T001** `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the env schema, defaulting to
      `admin` / `admin`, and documented in `.env.example` with why to change it.
- [x] **T002** `AdminSeedService`, on `OnApplicationBootstrap`: creates the
      account when it does not exist, promotes it when it exists as an ordinary
      user, and does nothing otherwise — so a changed password survives a
      restart. Never throws the boot.
- [x] **T003** Keyed on the account existing, not on "the database has no
      admin". The safe-looking guard meant an install that already had an admin
      never got these credentials, so the documented default did not work there.
- [x] **T004** `LoginDto.email` accepts a bare string, so `admin` can be typed.
      `RegisterDto` still requires a real address.
- [x] **T005** A boot warning while the shipped password is in use. The admin
      portal is served by the gateway, which is the one deliberately public
      thing in the stack.
- [x] **T006** 9 tests in `admin-seed.spec.ts`, including that the password is
      stored as an argon2 hash and never reset, and that a failure does not stop
      the gateway.

## Being able to change it

- [x] **T007** `POST /auth/password`. Shipping a default credential with no
      supported way to change it is worse than shipping no default — nothing in
      the gateway could change a password before this.
- [x] **T008** Requires the current password *and* an access token, and revokes
      every refresh token for that user: a password is usually changed because
      someone else may know the old one, and leaving their session alive makes
      the change cosmetic.
- [x] **T009** 4 tests in `change-password.spec.ts`, including that a wrong
      current password changes nothing at all.

## The coach knowing who it coaches

- [x] **T010** `profileLine()`: weight, height, BMI, goal, experience, training
      days by name, gym time, liked and disliked foods, and allergies as a
      prohibition. Empty fields omitted rather than sent as "unknown".
- [x] **T011** BMI computed in code — a 3B model doing that arithmetic
      mid-sentence gets it wrong often enough to matter.
- [x] **T012** Fed into `prompts/coaching.md` **and** `prompts/search.md`, so a
      searched answer about protein or a split is scaled to this person and an
      allergen a result recommends is not passed on.
- [x] **T013** 5 tests in `chat-conversation.spec.ts` covering both prompts, the
      BMI value, the allergy wording, and the omit-when-empty rule.

## The time bomb this uncovered

- [x] **T014** `reminders-service.spec.ts` pinned fixtures to
      `2026-09-02T17:00Z`. The clock reached it mid-session, a lead time that had
      been in the future became past, `planNotifications` dropped it, and a test
      that had passed for days started failing for reasons unrelated to any
      change. Fixtures are relative to `Date.now()` now, matching `sync.spec.ts`.

## Verification

- [x] **T015** Gateway 285 tests / 23 files. Mobile 148, analyzer clean.
- [x] **T016** End to end against the live stack, 7 checks: `admin`/`admin` gets
      in; it really is an admin; a wrong password is refused; the password can be
      changed and the old one stops working; **the change survives a restart and
      the default does not come back**; a password under 8 characters is refused;
      deleting the account reseeds it.
- [x] **T017** The v0.3.0 → v0.6.0 e2e suites all re-run unchanged, and the
      intent fixture still passes 23/23.

## What went wrong on the way

- The quick tunnel's hostname rotated **twice** during this work, and the second
  one was already dead by the time the APK build read it — cloudflared was in a
  reconnect loop while still reporting the URL it had last announced. Recreating
  the container produced a working one. This is the argument for the named
  tunnel, not a bug in the build script.

## Left undone, deliberately

- Forcing a password change on first login.
- A change-password screen in the admin portal; the route is there for it.
- Any account recovery.
