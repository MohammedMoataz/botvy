# Feature Specification: The daily rhythm

**Feature Branch**: `017-daily-rhythm`

**Created**: 2026-09-05

**Status**: Draft (phase P3 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P3 — "evening ritual 22:00 (tomorrow draft: top priorities +
training flag → confirm), morning briefing 08:00, check-in, streak, daily plan
snapshot; per-timezone tick."

## Why this feature exists

A list of tasks is not coaching. The rhythm is what turns Botvy from a place where
things are written down into something that asks, every evening, what tomorrow should
look like, and tells you every morning what today is — in your own words, at your own
times, in your own time zone. It is also where the streak comes from, which is what
lets the coach know it is talking to someone on day nine rather than day one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Plan tomorrow, every evening (Priority: P1)

At the member's evening time — 22:00 unless they changed it — Botvy proposes
tomorrow: the highest-priority tasks already due, whether there is training, and the
day's meal line. The member confirms, edits the selection, or skips. Anything left
unfinished today is offered for tomorrow, marked with how many times it has been
carried.

**Independent Test**: set the evening time two minutes ahead → the proposal arrives
as a notification and in the coach chat → confirm → tomorrow's plan holds exactly the
confirmed tasks.

**Acceptance Scenarios**:

1. **Given** four tasks due tomorrow and a training session, **When** the proposal
   arrives, **Then** it lists the tasks by priority and names the training with its time.
2. **Given** three tasks still open today, **When** the proposal arrives, **Then**
   they are offered for tomorrow with their carried-over count.
3. **Given** the member edits the selection and confirms, **When** the morning comes,
   **Then** the briefing shows what was confirmed, not the original proposal.
4. **Given** the member never answers, **When** the morning comes, **Then** the
   briefing still works from the proposal.
5. **Given** the member skips the evening, **When** the next evening comes, **Then**
   the ritual runs again as usual.

---

### User Story 2 — Start the day knowing it (Priority: P1)

At the member's morning time — 08:00 unless changed — Botvy sends today's plan: the
tasks, the training slot if any, and the meal line, as a notification and in the coach
chat. The home screen shows the same thing whenever it is opened.

**Acceptance Scenarios**:

1. **Given** a confirmed plan, **When** the morning time arrives, **Then** the
   briefing names the tasks in priority order and the training slot with its time.
2. **Given** no plan was made, **When** the morning time arrives, **Then** the
   briefing is built from what is actually due today.
3. **Given** a task completed overnight, **When** the briefing is sent, **Then** it
   is not listed as still to do.

---

### User Story 3 — Once a day, in my own time zone (Priority: P1)

Two members in different countries each get their prompts at their own local time,
exactly once a day. If the system was down at that minute, the prompt still arrives
when it comes back, on the same day. It never arrives twice.

**Independent Test**: two accounts with different time zones and the same evening
time → each is prompted at their own 22:00 → stop the system over one member's 22:00
and restart at 22:40 → they are prompted once, that evening.

**Acceptance Scenarios**:

1. **Given** members in Cairo and Berlin, **When** each local 22:00 passes, **Then**
   each is prompted once and neither is prompted at the other's time.
2. **Given** the system was unavailable at the member's time, **When** it returns
   the same day, **Then** the prompt is sent; if it returns the next day, that day
   is simply missed, never sent late as if it were today.
3. **Given** a day on which the clock goes forward, **When** the prompt time falls
   inside the missing hour, **Then** it fires once, at the first valid moment.
4. **Given** the member changes the evening time after being prompted today,
   **When** the new time passes today, **Then** they are not prompted a second time.

---

### User Story 4 — A short check-in and a streak (Priority: P1)

With the evening proposal, Botvy asks how the day went: a mood from a simple scale and
whether the plan was followed, with an optional note. Answering builds a streak of
consecutive days followed. The check-in is only interpreted inside the coaching
conversation, so ordinary sentences elsewhere never count.

**Acceptance Scenarios**:

1. **Given** the question was asked, **When** the member answers in the coaching
   chat within the allowed window, **Then** the day is recorded and the streak updates.
2. **Given** the same words typed in an unrelated chat, **When** they are sent,
   **Then** nothing is recorded.
3. **Given** a day answered "no", **When** the streak is shown, **Then** it restarts
   from zero and the best streak is remembered.
4. **Given** the member turned check-ins off, **When** the evening comes, **Then**
   only the plan is proposed and no question is asked.

---

### User Story 5 — See the day at a glance (Priority: P1)

The home screen greets the member and shows today: the plan's tasks with what is
done, the training slot, the meal line, the streak and the week's adherence.

**Acceptance Scenarios**:

1. **Given** today's plan, **When** home is opened offline, **Then** everything shows
   from the device's own copy.
2. **Given** a task completed from home, **When** it is tapped, **Then** the plan and
   the list agree immediately.

### Edge Cases

- A member registers at 23:00: no evening prompt is invented for a day already
  ending; the first prompt is the next evening.
- The member travels and changes time zone after being prompted: no second prompt
  that day.
- Quiet hours cover the member's own morning time: the briefing is the member's own
  choice, so it is not held back.
- A member with no tasks and no training: the proposal says so plainly rather than
  sending an empty list.
- The language model is unavailable when the meal line is generated: the plan is sent
  without it rather than not at all.

## Requirements *(mandatory)*

- **FR-001** At each member's evening time the system MUST propose tomorrow: the
  highest-priority tasks due, the training session if any, and the meal line.
- **FR-002** Unfinished tasks from today MUST be offered for tomorrow with a count of
  how many times they have been carried.
- **FR-003** The member MUST be able to confirm, edit or skip the proposal, and the
  result MUST be stored as that day's plan.
- **FR-004** At each member's morning time the system MUST send today's plan; when
  none was confirmed it MUST build one from what is due.
- **FR-005** Prompts MUST be delivered as a notification and written into the
  coaching conversation, so a member who opens the app sees the question on screen.
- **FR-006** Prompts MUST fire once per member per local day and MUST catch up the
  same day after downtime; they MUST NOT fire twice if a preference changes after
  the fact.
- **FR-007** A check-in MUST record mood, whether the plan was followed and an
  optional note; it MUST be interpretable only inside the coaching conversation and
  only within the allowed window.
- **FR-008** A streak MUST count consecutive followed days and MUST remember the best.
- **FR-009** Check-ins MUST be switchable off per member.
- **FR-010** Today's plan MUST be readable offline on the phone.
- **FR-011** Every time in this feature MUST be a per-member preference.
- **FR-012** A failure to generate the meal line MUST NOT prevent the plan being sent.

### Key Entities

**Daily plan** (a date, its chosen tasks, the training slot, the meal line, and
whether it was proposed, confirmed or skipped), **Check-in**, **Streak**,
**Rhythm state** (what has already been sent today, and whether an answer is awaited).

## Success Criteria *(mandatory)*

- **SC-001** Prompts arrive within 5 minutes of the member's chosen time on 99% of days.
- **SC-002** Exactly one evening and one morning prompt per member per local day
  across a 14-day run, including a day with a daylight-saving change.
- **SC-003** A member confirms tomorrow in under 60 seconds from the notification.
- **SC-004** Zero check-ins recorded from messages outside the coaching conversation.
- **SC-005** Home renders today's plan offline in under 300 ms.

## Assumptions

- The evening ritual carries both the plan proposal and the check-in question; a
  separate end-of-day nudge is not sent (blueprint assumption).
- "Highest priority" means the top five tasks by priority then due time, editable by
  the member.
- Training comes from the training feature when it lands; until then the slot is
  simply absent and the plan reads correctly without it.
- The meal line likewise arrives with the nutrition feature; until then it is absent.

## Out of scope

- Time-boxing tasks into hours of the day.
- Weekly or monthly reviews.
- Coaching advice generated from the check-in (the coach reads the streak from P4).
