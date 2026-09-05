# Feature Specification: A way in, and a member the coach can know

**Feature Branch**: `015-identity-profile`

**Created**: 2026-09-05

**Status**: Draft (phase P1 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P1 — "register (confirm password), login, Google, refresh
rotation, roles, devices, profile + photo, preferences, admin seed."

## Why this feature exists

The foundation stands up empty: it can prove a command travels the system, but no
one can sign in and nothing knows who a member is. Every later phase reads the
member's time zone, language, body facts and preferences — the daily rhythm fires at
*their* 22:00, the coach must never suggest a food they are allergic to, the phone
must know which defaults to show. This phase creates the member, the ways in, and
the record of who they are.

It also closes a v1 gap: the platform had no way to change a password until the very
last release, and no way to edit a member's profile from anywhere but the phone.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Create an account (Priority: P1)

A visitor registers with an email address, a password and a matching confirmation,
or with their Google account. They land in the app already set up: their time zone
detected from the device and confirmable, their language chosen, two pinned chats
waiting, and every default visible and editable.

**Independent Test**: register on the phone → sign out → sign in → the same name,
photo, time zone and preferences appear.

**Acceptance Scenarios**:

1. **Given** the registration form, **When** the two password fields differ, **Then**
   the form blocks submission and says so; nothing is sent.
2. **Given** a password shorter than 8 characters, **When** it is submitted anyway,
   **Then** the server refuses with a message naming the rule.
3. **Given** an email already registered, **When** registration is attempted,
   **Then** it is refused without revealing whether that address exists to an
   unauthenticated caller beyond a generic conflict.
4. **Given** registration is closed by the Owner, **When** a visitor tries to
   register or to sign in with Google for the first time, **Then** both are refused
   with the same message.
5. **Given** a successful registration, **When** the member opens the app, **Then**
   their profile, preferences and two pinned chats already exist.
6. **Given** a first sign-in, **When** the walkthrough runs, **Then** it asks only for
   a name, an optional photo, the time zone (detected, confirmable) and the language,
   previews the three daily times, finishes in under a minute, and can be skipped
   and resumed from Settings.

---

### User Story 2 — Sign in, stay signed in, sign out everywhere (Priority: P1)

A member signs in with email or username and password, or with Google. The session
survives closing the app and restarting the phone. Changing the password signs out
every other device. A stolen and replayed session token is detected and kills the
whole chain it belongs to.

**Independent Test**: sign in on two devices → change the password on one → the
other is signed out on its next request; replay an old refresh token → refused and
the family is revoked.

**Acceptance Scenarios**:

1. **Given** the seeded administrator, **When** they sign in with `admin` / `admin`,
   **Then** they are admitted and warned to change the password.
2. **Given** a valid session, **When** the access token expires, **Then** the client
   refreshes silently and the member notices nothing.
3. **Given** a refresh token that was already exchanged, **When** it is presented
   again, **Then** it is refused and every token in its family is revoked.
4. **Given** a Google account not yet known, **When** the member signs in with
   Google and registration is open, **Then** an account is created and no password
   is set; signing in with a password later is impossible until one is set.
5. **Given** a banned member, **When** they try to sign in, **Then** they are refused
   and their devices stop receiving notifications.

---

### User Story 3 — Be recognised on this device (Priority: P1)

Each phone, browser and extension registers itself once. The member can see their
devices and remove one. The system remembers when each was last in touch, which is
what keeps a reminder from arriving twice later.

**Acceptance Scenarios**:

1. **Given** an app installed twice on the same phone, **When** it registers,
   **Then** one device record exists, not two.
2. **Given** a device removed by the member, **When** a notification is sent,
   **Then** that device receives nothing.

---

### User Story 4 — Tell the coach who I am (Priority: P1)

A member sets a display name and photo, confirms time zone and language, and records
optional body facts (height, weight — kept as a history so change is visible),
symptoms, foods they like and dislike, and allergies. Every field may be left empty.

**Independent Test**: record two weights a week apart → the profile shows the latest
and the history; add an allergy → it is listed as a prohibition, not a preference.

**Acceptance Scenarios**:

1. **Given** a photo taken on the phone, **When** it is uploaded, **Then** it appears
   on the profile within seconds and is not readable by another member.
2. **Given** a height and a weight, **When** the profile is read, **Then** the body
   mass index is present and correct without the member calculating it.
3. **Given** an empty field, **When** the profile is used elsewhere, **Then** it is
   omitted entirely rather than sent as "unknown".

---

### User Story 5 — Make the defaults mine (Priority: P1)

A member opens preferences and changes the plan-prompt time, the end-of-day time, the morning
briefing time, the next-practice cut-off, the default reminder lead times, the meal
mode, whether background suggestions run, quiet hours, the first day of the week and
their language. The Owner can change what new members start with.

**Acceptance Scenarios**:

1. **Given** the end-of-day time changed to 21:30, **When** the next evening comes,
   **Then** the summary arrives at 21:30 in the member's time zone.
2. **Given** the Owner changes the default morning time, **When** a new member
   registers, **Then** they start with the new value and existing members keep theirs.
3. **Given** quiet hours set, **When** an alert would fire inside them, **Then** it
   is held until the window ends (except an alert the member explicitly scheduled).

---

### User Story 6 — The Owner manages people (Priority: P2)

From the admin portal the Owner sees members, their devices and their last sign-in,
promotes or demotes an administrator, bans and unbans, and creates the credentials
other machines use. Every such action is recorded.

**Acceptance Scenarios**:

1. **Given** a member promoted to administrator, **When** they reload, **Then** the
   admin screens are reachable for them.
2. **Given** a machine credential created, **When** its secret is shown, **Then** it
   is shown exactly once and never retrievable again.

### Edge Cases

- A member travels: changing the time zone reschedules their local alarms and moves
  their prompts; nothing is fired twice for the same day.
- Google returns an email that already has a password account: the accounts are
  linked after the member proves the password once, never silently.
- A photo larger than the limit, or not an image: refused with the reason.
- The same registration submitted twice by a flaky network: one account.
- Deleting an account removes the member's data everywhere within the system.
- The seeded administrator password is still the default: a warning appears on every
  start and on the admin overview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-000** A first-run walkthrough MUST collect only name, optional photo, time zone
  and language, MUST preview the daily times, MUST be skippable and resumable, and
  MUST accept later steps from other features (sports, when training exists).
- **FR-001** Registration MUST require an email, a password of at least 8 characters
  and a matching confirmation; the confirmation MUST be checked on the client and the
  password rule on the server.
- **FR-002** Sign-in MUST accept an email or a bare username, so the seeded
  administrator account works.
- **FR-003** Google sign-in MUST verify the credential with Google on the server;
  a client-supplied identity MUST never be trusted.
- **FR-004** Sessions MUST be short-lived and refreshable; a refresh MUST rotate,
  and re-use of a rotated credential MUST revoke the whole chain.
- **FR-005** Changing the password MUST require the current one and MUST end every
  other session.
- **FR-006** Registration MUST be closable by the Owner; when closed it MUST also
  block first-time Google sign-ins.
- **FR-007** Each installation MUST register once and be listable and removable by
  its owner; the system MUST record when each device was last in touch.
- **FR-008** A member MUST be able to set display name, photo, time zone, language;
  and optionally height, weight (with history), symptoms, liked and disliked foods,
  and allergies. Any field MAY be empty and an empty field MUST be omitted, never
  sent as "unknown".
- **FR-009** Body mass index MUST be computed by the system, not by a person or a
  language model.
- **FR-010** A member's photo MUST be readable only by that member and the Owner.
- **FR-011** Every default named in the blueprint MUST be an editable preference,
  seeded per member from an Owner-level default at registration.
- **FR-012** Creating a member MUST create their profile, preferences and the two
  pinned chats; deleting a member MUST remove all of it.
- **FR-013** The Owner MUST be able to change roles, ban and unban, and create and
  revoke machine credentials, and each action MUST be recorded with who did it.
- **FR-014** A banned member MUST be refused sign-in and MUST stop receiving
  notifications.
- **FR-015** The system MUST warn on every start while the shipped default
  administrator password is unchanged.

### Key Entities

**Member** (identity, credentials, role, status), **Session chain** (rotating
credentials with reuse detection), **Device**, **Machine credential**,
**Profile** (display, locale, body-metric history, foods, allergies),
**Preferences**, **Audit entry**.

## Success Criteria *(mandatory)*

- **SC-001** Registration through to a usable profile takes under 3 minutes.
- **SC-002** A member signing in on a second device sees identical profile and
  preferences within 10 seconds.
- **SC-003** 100% of replayed session credentials are refused and revoke their chain.
- **SC-004** A password change signs out every other device within one request.
- **SC-005** Zero profile fields are transmitted as "unknown" in any prompt or API
  response.
- **SC-006** Arabic screens for registration, sign-in, profile and preferences pass
  right-to-left review.

## Assumptions

- Accounts already in the identity store from v1 keep working; their profiles are
  created lazily on first sign-in from the v1 coaching profile where one exists.
- Password reset by email is out of scope until the platform has a mail sender.
- One photo per member, replacing the previous one.
- Linking a Google identity to an existing password account requires the password.

## Out of scope

- Two-factor authentication, passkeys, single sign-on providers other than Google.
- Password reset / account recovery by email.
- Member-to-member visibility of any kind.
