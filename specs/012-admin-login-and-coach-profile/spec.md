# Feature Specification: A Way In, and a Coach That Knows You

**Feature Branch**: `012-admin-login-and-coach-profile`

**Created**: 2026-09-02

**Status**: Implemented

**Input**: User description: "make the default admin credentials is username
admin, pass: admin" and "the coaching chat should know the user info like weight
and height and everything and consider these data while searching."

## Why this feature exists

**There was no way into the admin portal.** The first account registered was an
ordinary user, and promoting it meant a hand-written
`UPDATE users SET role='admin'` against Postgres — a step easy to miss, and
impossible to perform from the portal itself because you could not get in.

**The coach did not know who it was coaching.** `CoachingProfile` has carried
weight, height, goal, experience, training days, liked and disliked foods and
allergies since v0.2, and the only thing that read them was the nightly
programme generator. A question asked in the coaching chat was answered from a
streak count and nothing else, and a web search about protein or a training
split came back with whatever general figure a result happened to quote.

## What was found while building it

| Assumption | What was actually true |
|---|---|
| Seeding an admin is enough | Shipping a default credential with **no supported way to change it** is worse than no default. Nothing in the gateway could change a password — not the portal, not the API. `POST /auth/password` had to exist first. |
| Seed only when the database holds no admin | That is the safe-looking guard, and it meant an install that already had an admin never got this account — so the documented default credentials did not work there, which is the opposite of a default. Keyed on the account existing instead. |
| `@IsEmail()` on login is fine | "admin" is not an email, so the requested username could never be typed. Login now accepts a bare string; registration still requires a real address. |
| A test suite that passed yesterday passes today | `reminders-service.spec.ts` pinned a fixture to `2026-09-02T17:00Z`. The clock reached it mid-session and a lead time that had been in the future became past, so `planNotifications` dropped it. Fixtures here are relative now. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log in to a fresh install (Priority: P1)

**Acceptance**: a new install accepts `admin` / `admin` and that account can
read the admin-only routes.

### User Story 2 - Change the password, and have it stay changed (Priority: P1)

**Acceptance**: the password can be changed through the API; the old one stops
working, every other session is signed out, and a gateway restart does not
reset it back to the default.

### User Story 3 - The coach knows my body (Priority: P1)

**Acceptance**: a coaching turn is answered with the user's weight, height,
BMI, goal, experience and training days available to it, and never suggests a
food they are allergic to.

### User Story 4 - A search is answered for me (Priority: P1)

**Acceptance**: a web search on a training or nutrition question carries the
same profile, so the answer is scaled to this person rather than repeating a
figure from a result — and an allergen a result recommends is not passed on.

## Requirements *(mandatory)*

- **FR-001** The gateway MUST seed the account named by `ADMIN_EMAIL` when that
  account does not exist, and promote it if it exists as an ordinary user.
- **FR-002** It MUST NOT reset an existing account's password, so a change
  survives every restart.
- **FR-003** It MUST NOT prevent the gateway starting when it fails.
- **FR-004** `ADMIN_EMAIL` MUST be matched literally, so a bare username works.
- **FR-005** `POST /auth/password` MUST exist, MUST require both the current
  password and a valid access token, and MUST revoke every refresh token for
  that user.
- **FR-006** A new password MUST be at least 8 characters, the same rule
  registration uses.
- **FR-007** The gateway MUST warn on every boot while the shipped default
  password is still in use, because the admin portal is on the public surface.
- **FR-008** The coaching prompt MUST carry the profile, and MUST state an
  allergy as a prohibition rather than a preference.
- **FR-009** BMI MUST be computed in code. A 3B model doing that arithmetic
  mid-sentence gets it wrong often enough to matter.
- **FR-010** A field that has not been filled in MUST be omitted, never sent as
  "unknown" — a model told that asks for it again mid-answer.
- **FR-011** The search prompt MUST carry the profile too.

## Assumptions

- Deleting the seeded account brings it back on the next boot, because it is a
  *default*. Point `ADMIN_EMAIL` elsewhere if that is not wanted.
- There is no route back to a 5-character password through the API. Deleting the
  account and letting the seeder run is the only way, which is fine.
- The profile is sent as one line of prose rather than structured fields. A
  small model follows prose better than JSON here, and it costs fewer tokens.
- `admin`/`admin` on a publicly-reachable portal is a real risk and is accepted
  deliberately: it is what makes a fresh install usable, and the boot warning
  plus the change-password route are the mitigation.

## Out of scope

- Forcing a password change on first login.
- A password-change screen in the admin portal. The route exists; the UI can
  follow.
- Password reset by email, or any account recovery.
- Editing the coaching profile from the admin portal.
