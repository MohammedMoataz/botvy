# Feature Specification: The athlete's week

**Feature Branch**: `020-training`

**Created**: 2026-09-05

**Status**: Draft (phase P6 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P6 — "sports, weekly slots, programs/sessions/sets, workout
library, next practice with cut-off, training slot in Today."

## Why this feature exists

A member who trains has a second timetable running alongside their tasks, and it is
the one they most want the coach to know about. This phase gives Botvy the athlete's
week: which sports they practise, when they train, what a session contains, what they
actually did, and — the screen they will open most — what the next practice is.

It is deliberately one model for every sport. Gym, football, cross-fit, calisthenics
and swimming differ in what a set means, not in how a week is shaped.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Say what I practise (Priority: P1)

A member picks one or more sports and sets their weekly training slots: which days,
what time, how long, which sport, and optionally where. The Athlete screen is shaped
around those choices.

**Independent Test**: pick gym and swimming, set Monday/Wednesday/Friday 18:00 gym and
Sunday 08:00 swimming → the week shows four sessions of the right kinds.

**Acceptance Scenarios**:

1. **Given** two sports, **When** the week is viewed, **Then** each session is
   recognisable as its sport and both count toward the week.
2. **Given** a slot removed, **When** the week is viewed, **Then** future sessions
   for it are gone and past ones remain as a record.
3. **Given** no slots at all, **When** the Athlete screen is opened, **Then** it
   invites the member to set them rather than showing an empty grid.

---

### User Story 2 — Know what is next (Priority: P1)

The Athlete screen shows the practice happening now or next. After the member's
cut-off hour in the evening — 21:00 unless changed — it shows tomorrow's instead, so
the evening is spent looking at the right session.

**Independent Test**: on a Wednesday with gym on Wednesday and Friday, at 20:00 the
card shows Wednesday's; at 21:30 it shows Friday's.

**Acceptance Scenarios**:

1. **Given** a session earlier today, **When** the screen is opened before the
   cut-off, **Then** today's session is still the one shown, marked as done or missed.
2. **Given** the cut-off has passed, **When** the screen is opened, **Then** the next
   future session is shown with its day.
3. **Given** no upcoming session, **When** the screen is opened, **Then** it says so
   plainly and offers to add one.

---

### User Story 3 — Record what I did (Priority: P1)

A member opens a session and logs it: for a gym session, the sets with their reps and
weights; for swimming or running, distance and time; for a game, simply that it
happened, with notes. A session can be completed, cancelled or skipped.

**Acceptance Scenarios**:

1. **Given** a session with planned sets, **When** it is logged, **Then** what was
   actually done sits next to what was planned.
2. **Given** a session logged offline, **When** the network returns, **Then** it is
   uploaded without duplication.
3. **Given** a session skipped, **When** the week is viewed, **Then** it is marked
   skipped rather than deleted, so the record is honest.

---

### User Story 4 — Follow a program (Priority: P2)

A member creates or accepts a program: a number of weeks, each with sessions, each
with exercises and targets. Applying it fills the upcoming sessions in their slots.
A program can be archived and another applied.

**Acceptance Scenarios**:

1. **Given** a four-week program applied from Monday, **When** the week is viewed,
   **Then** the slots hold that program's sessions in order.
2. **Given** a program applied over existing sessions, **When** it is applied,
   **Then** the member is told what will be replaced before it happens.
3. **Given** a program archived, **When** future weeks arrive, **Then** its sessions
   stop being created and the slots stay, empty.

---

### User Story 5 — Keep my own workouts (Priority: P3)

A member saves workouts they like — a name, a sport, its exercises — and drops one
into a session without retyping it.

**Acceptance Scenarios**:

1. **Given** a saved workout, **When** it is applied to a session, **Then** the
   session holds its exercises and targets, editable afterwards.

---

### User Story 6 — Training shows up with everything else (Priority: P1)

Today's list shows the day's training as its own item, not as a task. The calendar
shows it beside meetings. The evening proposal names tomorrow's session.

**Acceptance Scenarios**:

1. **Given** a session today at 18:00, **When** Today is opened, **Then** it appears
   at its time, distinct from tasks, and cannot be completed as if it were one.
2. **Given** a session tomorrow, **When** the evening proposal arrives, **Then** it
   names the sport and the time.

### Edge Cases

- A rest day is simply a day with no session; nothing is stored to represent it.
- A slot changed after sessions were created: future sessions move, past ones do not.
- Two sports at the same hour on the same day: both are kept and shown; the member
  decides.
- A session in the past that was never logged: it shows as missed and can still be
  logged late.
- A program shorter than the weeks remaining: it ends and the slots continue empty
  until another is applied.
- The cut-off falls before a session that is still to happen today: the session is
  still shown as today's, not skipped over.

## Requirements *(mandatory)*

- **FR-001** A member MUST be able to choose one or more sports from a known list plus
  an "other" option with their own name.
- **FR-002** A member MUST be able to define weekly slots (day, time, length, sport,
  optional place), and changing them MUST affect future sessions only.
- **FR-003** Sessions MUST be created ahead for the coming weeks from the slots, so
  the week is always populated without the member acting.
- **FR-004** A session MUST hold a sport, a time, a length, a title, an optional focus
  and a list of exercises, each with sets carrying planned and actual values suited to
  its sport (repetitions and weight, or distance and duration).
- **FR-005** A session MUST be loggable, completable, cancellable and skippable, and
  MUST remain in the record when skipped.
- **FR-006** The system MUST show the current session, or the next one once the
  member's cut-off hour has passed, and MUST say plainly when there is none.
- **FR-007** The cut-off hour MUST be a per-member preference.
- **FR-008** A program MUST consist of weeks, each with sessions and exercises with
  targets; applying it MUST fill upcoming slot sessions and MUST warn before replacing
  existing content.
- **FR-009** A member MUST be able to keep a personal workout library and apply an
  entry to a session.
- **FR-010** Today's list MUST show the day's training as a distinct item that cannot
  be completed as a task.
- **FR-011** The calendar and the daily rhythm MUST include training.
- **FR-012** Everything in this feature MUST be usable offline and MUST synchronise.
- **FR-013** A rest day MUST NOT be stored; the absence of a session is the rest day.

### Key Entities

**Athlete profile** (sports and weekly slots), **Session** (a planned or logged
practice), **Exercise** and **Set** (planned versus actual), **Program** (weeks of
session templates), **Workout** (a library entry).

## Success Criteria *(mandatory)*

- **SC-001** After setting slots, the coming two weeks are populated within seconds
  and stay populated as weeks pass.
- **SC-002** The next-practice card is correct on both sides of the cut-off for 100%
  of a 14-day fixture.
- **SC-003** Logging a full gym session of six exercises takes under 90 seconds.
- **SC-004** A session logged offline appears on another device within 10 seconds of
  reconnection, exactly once.
- **SC-005** Today shows the training slot for 100% of days that have one.

## Assumptions

- One session per slot per week; a member who trains twice in a day sets two slots.
- Progression rules (adding weight automatically) are out of scope; the data supports
  them later because planned and actual values are both kept.
- Exercise media (images, videos) arrives with the links feature; here an exercise may
  carry a reference but nothing fetches it.
- Sessions are materialised two weeks ahead by default, an Owner setting.

## Out of scope

- Automatic progression, one-rep-max estimation, training-load metrics.
- Wearables, heart rate, GPS.
- Sharing a program with another member.
