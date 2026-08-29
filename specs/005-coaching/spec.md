# Feature Specification: Coaching Parity

**Feature Branch**: `005-coaching`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "Coaching parity: per-user fitness and nutrition profile, nightly check-in asking whether the user trained and ate as planned, adherence and streak tracking feeding back into prompts, daily workout and meal program generation, and the n8n schedule workflows that drive the nightly cycle"

## Why this feature exists

This is the last capability the predecessor Telegram assistant had that
the new platform does not. Reaching it is what allows the old stack to be
decommissioned. The old system's behaviour is the reference; its known
defects are explicitly *not* carried over (see Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The assistant knows my body and my schedule (Priority: P1)

As a user, I tell the assistant things about myself over time — my weight,
what I can't eat, which days I train — and it remembers them and uses them
when it plans my food and workouts.

**Why this priority**: every generated program depends on the profile.
Without it the assistant produces generic advice, which is what the user
already gets from any chatbot.

**Independent Test**: send messages containing profile facts, then read
the profile back and confirm the fields were captured; confirm a second
user's profile is untouched.

**Acceptance Scenarios**:

1. **Given** a user mentions a profile fact in conversation, **When** the
   message is processed, **Then** the corresponding profile field is
   updated without overwriting unrelated fields that were already set.
2. **Given** a user has a profile, **When** they view or edit it directly,
   **Then** they see and change only their own.
3. **Given** a stated allergy or dislike, **When** a program is generated,
   **Then** the constraint is respected, and if the generated plan
   nonetheless contains it the plan is regenerated or the conflict is
   surfaced — never delivered silently.

---

### User Story 2 - A nightly check-in that actually tracks adherence (Priority: P1)

As a user, each evening the assistant asks whether I trained and ate as
planned; my answer is recorded, and my streak and completion rate inform
how it talks to me from then on.

**Why this priority**: adherence history is what distinguishes a coach
from a generator. It is also the mechanism that made the old system feel
personal.

**Independent Test**: trigger the check-in, answer in natural language,
and confirm exactly one check-in row exists for that date with the right
outcome; confirm the streak reflects it.

**Acceptance Scenarios**:

1. **Given** the nightly check-in has been sent, **When** the user replies
   in natural language ("yeah did legs, ate clean"), **Then** the reply is
   classified and recorded once for that date.
2. **Given** a check-in already exists for today, **When** another reply
   arrives, **Then** the existing record is updated rather than duplicated.
3. **Given** the user never answers, **When** enough time passes, **Then**
   the pending check-in expires so an unrelated message the next day is
   not mistaken for an answer.
4. **Given** a user reports missing a day, **When** the assistant responds,
   **Then** it is encouraging rather than punitive, and the miss is still
   recorded truthfully.

---

### User Story 3 - A daily program that reflects yesterday (Priority: P2)

As a user, each day I receive a workout and meal plan that accounts for
what I did recently — muscle groups worked, days missed, my schedule — and
rest days are respected.

**Why this priority**: valuable, but the assistant is already useful with
profile and check-ins alone; this builds on both.

**Independent Test**: with a profile and some history in place, generate a
program and confirm it avoids consecutive same-muscle days and honours the
user's configured rest days.

**Acceptance Scenarios**:

1. **Given** a rest day in the user's schedule, **When** the daily program
   runs, **Then** a rest message is sent instead of a workout.
2. **Given** a workout was logged yesterday, **When** today's program is
   generated, **Then** it does not repeat the same primary muscle groups.
3. **Given** a program is generated, **When** it is stored, **Then** it
   does not overwrite a workout the user actually reported doing.

---

### Edge Cases

- A user with an incomplete profile → the assistant asks for what it needs
  rather than inventing values or refusing outright.
- Two program generations for the same day → exactly one stored record.
- A user in a different timezone → "today" and the nightly schedule follow
  the user's timezone, not the server's.
- The model returns a program that violates a declared allergy → treated as
  a generation failure, not delivered with a warning appended.
- A user opts out of coaching → no nightly messages, and the rest of the
  assistant keeps working.
- A user with no devices registered → nothing to push to; the cycle still
  records state rather than erroring.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store a per-user coaching profile covering body
  metrics, dietary constraints (including allergies), training schedule,
  and experience level, with an explicit opt-in flag for coaching.
- **FR-002**: System MUST update profile fields from conversation without
  clobbering fields it did not extract.
- **FR-003**: System MUST expose authenticated profile read and update
  scoped to the owning user.
- **FR-004**: System MUST record at most one check-in per user per date,
  capturing whether the user adhered and the raw reply.
- **FR-005**: System MUST expire a pending check-in after a bounded window
  so a later unrelated message is not classified as an answer.
- **FR-006**: System MUST compute a current streak and a completion ratio
  from check-in history and include them in the coaching prompt context.
- **FR-007**: System MUST record at most one workout record per user per
  date, distinguishing a generated plan from a user-reported session, and
  MUST NOT let a generated plan overwrite a reported session.
- **FR-008**: System MUST generate a daily program honouring the user's
  rest days, recent muscle-group history, and dietary constraints.
- **FR-009**: A generated program that violates a declared allergy MUST NOT
  be delivered as-is.
- **FR-010**: System MUST expose service-token-authenticated internal
  endpoints driving the nightly cycle (ask check-in; push daily program),
  callable by n8n, operating over all opted-in users.
- **FR-011**: The repository MUST contain the n8n workflow JSON driving the
  nightly cycle, with no database node and no data volume.
- **FR-012**: All coaching times MUST be resolved in the user's timezone.

### Key Entities

- **CoachingProfile**: one per user — metrics, constraints, schedule,
  experience, opt-in, pending-check-in state and its timestamp.
- **CheckIn**: one per user per date — adhered flag, raw reply.
- **WorkoutRecord**: one per user per date — exercises, muscle groups, and
  a source distinguishing a generated plan from a reported session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A profile fact stated in conversation is reflected in the
  stored profile, and unrelated existing fields are unchanged.
- **SC-002**: Answering a check-in produces exactly one record for that
  date; answering again updates rather than duplicates it.
- **SC-003**: Streak and completion ratio computed from a known history
  match hand-calculated values.
- **SC-004**: A rest day produces a rest message and no workout record.
- **SC-005**: A generated plan never replaces a user-reported session for
  the same date.
- **SC-006**: Two users' profiles, check-ins, and programs never mix.

## Assumptions

- Defects of the predecessor system are deliberately not reproduced: it
  sent two nightly messages by design, appended an allergy *warning* to a
  plan rather than withholding it, had no way to list or cancel anything,
  and lost the check-in feature entirely to a `=== true` comparison against
  a SQLite integer. This feature withholds unsafe plans (FR-009), sends one
  nightly cycle, and is unit-tested at the boundaries.
- Model-dependent behaviour (extraction quality, program sensibility)
  cannot be verified while inference is CPU-bound; the deterministic parts
  — schema, uniqueness, streak maths, rest-day and overwrite rules — are
  unit-tested and verifiable now.
- Coaching is opt-in; users who never opt in are unaffected.
- Exercise demonstration media is out of scope for this feature.
