# Feature Specification: Botvy v2 — Life Coaching Platform Blueprint

**Feature Branch**: `013-platform-v2-blueprint`

**Created**: 2026-09-05

**Status**: Approved blueprint (implementation phases 014–025 follow)

**Input**: User description: "refactor the whole project architecture, structure,
tools and dependencies … the core responsibility is still life coaching, but add
new features … reminders, follow-up program, TODO list with priorities and
coloured labels, GYM/athlete management for one or many sports, training links
ingested and summarised, body profile and daily Workout | Meals plan, chat with
two pinned chats and quick questions, meetings with recurrence and calendar,
Chrome extension synced with the phone, profile with photo, Google or manual
login with confirm password, everything configurable."

## Why this exists

Botvy v1 proved the idea: a private assistant that reminds, coaches and chats,
running entirely on the owner's hardware. It also proved its limits — every new
capability landed in the same chat service, the same data shape was hand-written
three times, and the product stopped at reminders plus a nightly check-in.

Botvy v2 keeps the promise — **help a person live the life they want to live** —
and widens it into a daily rhythm: what to do today, when to train, what to eat,
who to meet, and a coach that knows all of it. It is planned once, as a whole, so
each later phase fits a shape that was designed for it.

## Personas

- **The Owner** — installs Botvy on their own machine, is the first (admin) user,
  invites family or friends. Cares that nothing leaves the house and that a broken
  scheduled job is visible.
- **The Member** — uses the phone all day and the PC while working. Wants one
  place for tasks, meetings, reminders and training; wants the coach to remember
  their body, food and goals; speaks English or Arabic.
- **The Athlete** (a Member with sports) — trains in one or several sports, follows
  programs found online, wants tomorrow's session planned and surfaced with the
  rest of tomorrow.

## Product principles

1. **Local-first, offline-tolerant.** Every screen works without a network; the
   phone rings its own alarms.
2. **The coach knows you.** Body, food, allergies, training, streak and today's
   plan are available to every coaching answer.
3. **Nothing is hard-coded for the user.** Every time, cut-off, mode and default
   is a preference the user can change.
4. **One truth, many surfaces.** Phone, PC extension and web show the same tasks
   and meetings within seconds of each other.
5. **A silent failure is a bug.** Anything scheduled reports when it stops.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sign in and set up who I am (Priority: P1)

A new member registers with email, password and a matching confirmation, or with
Google. They set a display name and photo, confirm their time zone, and enter
optional body facts (height, weight, symptoms), foods they like and dislike, and
allergies. Their defaults (evening plan time 22:00, morning briefing 08:00,
next-practice cut-off 21:00) are shown and editable.

**Why this priority**: every other feature keys off the account, time zone and
profile.

**Independent Test**: register → log out → log back in on a second device → the
profile and preferences are identical on both.

**Acceptance Scenarios**:

1. **Given** the registration form, **When** the two password fields differ,
   **Then** submission is blocked with an inline message and nothing is sent.
2. **Given** a Google account, **When** the member signs in with Google for the
   first time, **Then** an account is created and the profile screen opens.
3. **Given** a signed-in member, **When** they change the evening plan time to
   21:30, **Then** the next evening prompt arrives at 21:30 in their time zone.
4. **Given** the seeded administrator, **When** they sign in with `admin`/`admin`,
   **Then** they reach the admin portal and are warned to change the password.

---

### User Story 2 — Capture what I have to do and see today (Priority: P1)

A member adds a task with a title, an optional date and time, a priority (P1–P4)
and an optional label. Labels have a name and a colour: a default from the
palette or one the member picks. A "To Do — Today" view groups today's tasks
apart from everything else; "Upcoming" and "Overdue" views exist too. Tasks can
be completed, cancelled, edited, deleted (with undo), restored and, if recurring,
repeat from the schedule or from completion.

**Why this priority**: the daily rhythm and the planner chat both operate on tasks.

**Independent Test**: create three tasks (today, tomorrow, no date) with two
labels → Today shows exactly one → complete it → it moves out of Today and into
completed → delete a task and undo within the toast → it is back unchanged.

**Acceptance Scenarios**:

1. **Given** a task due today at 17:00 with label "Work" (blue), **When** the
   member opens Today, **Then** the task shows with the blue label chip and its
   priority colour.
2. **Given** a completed recurring task set to repeat "every day from completion",
   **When** it is completed at 20:00, **Then** the next occurrence is due tomorrow
   at 20:00.
3. **Given** a deleted task, **When** the member opens the Deleted view,
   **Then** the task shows its last status (open/completed/cancelled) and offers
   Restore.
4. **Given** the phone is offline, **When** a task is created, **Then** it appears
   immediately and is uploaded when the network returns without duplication.

---

### User Story 3 — Be reminded, even offline (Priority: P1)

A member sets a reminder for a time. It rings on the phone at that moment with no
network; it can be snoozed, completed or cancelled from the notification or the
list. Lead times ("1 hour before", "at the time") are configurable per reminder
with user-set defaults. Deleted reminders keep their status and can be restored.

**Why this priority**: the original core; must not regress.

**Independent Test**: set a reminder 2 minutes ahead, enable airplane mode → the
alarm fires → snooze 5 minutes → fires again.

**Acceptance Scenarios**:

1. **Given** a reminder with lead times [1h, 0m], **When** the time approaches,
   **Then** exactly one notification arrives at each lead time.
2. **Given** a device that has synced recently, **When** the server's fallback
   sweep runs, **Then** it does not send a duplicate of an alarm the phone already
   holds.
3. **Given** a reminder created in the planner chat ("remind me to call Dad in
   two hours"), **When** it is confirmed, **Then** it appears in the reminders list
   at the computed time in the member's zone.

---

### User Story 4 — A daily rhythm that plans with me (Priority: P1)

Every evening at the member's chosen time (default 22:00) Botvy proposes
tomorrow: the highest-priority tasks, whether tomorrow has training, and a meal
line. The member confirms or edits. Every morning at their chosen time (default
08:00) Botvy briefs them on today's plan. Unfinished tasks roll forward
explicitly and are counted as carried over. A short daily check-in (mood, did
you follow the plan) feeds a streak.

**Why this priority**: this is the "follow-up program" that turns lists into
coaching.

**Independent Test**: set evening time to two minutes ahead → the prompt arrives
in the coach chat and as a notification → confirm → set morning time two minutes
ahead → the briefing lists the same tasks plus training slot.

**Acceptance Scenarios**:

1. **Given** three open tasks for tomorrow and a training session tomorrow at
   18:00, **When** the evening prompt fires, **Then** it lists the tasks ordered by
   priority and states "Training: Upper body 18:00".
2. **Given** a member in Cairo and one in Berlin, **When** the clock passes 22:00
   in each zone, **Then** each receives the prompt at their own 22:00 and only once.
3. **Given** the service was down at 22:00, **When** it returns at 22:40,
   **Then** the prompt is still sent that evening (never skipped, never doubled).
4. **Given** the check-in reply "I rested today" typed in an unrelated chat,
   **When** it is sent, **Then** it does not count as a check-in.

---

### User Story 5 — Talk to a coach who knows me (Priority: P1)

Two pinned chats exist from day one: **Coach** (goals, body, training, meals,
motivation) and **Planner** (tasks, reminders, meetings). Quick-question chips
suggest common asks. The coach's answers use the member's profile, streak and
today's plan; the planner can create, list and cancel tasks and reminders from
plain sentences. Members can open other chats; the two pinned ones cannot be
deleted, only cleared. Replies stream as they are generated and can be stopped.

**Why this priority**: the coaching identity of the product.

**Independent Test**: tell the coach your weight → ask for a protein target → the
answer uses that weight; tell the planner "add buy milk tomorrow P2" → a task
appears with those values.

**Acceptance Scenarios**:

1. **Given** allergies include peanuts, **When** the coach suggests meals,
   **Then** no suggestion contains peanuts, ever.
2. **Given** a long answer streaming, **When** the member taps Stop, **Then**
   generation halts within a second and the partial answer is kept.
3. **Given** a message typed offline, **When** the network returns, **Then** the
   message is sent, answered, and the answer lands in the same chat.
4. **Given** a low mood in the last check-in, **When** the coach chat opens,
   **Then** the quick chips offer gentler options ("Suggest a lighter day").

---

### User Story 6 — Meetings and a calendar (Priority: P2)

A member creates a meeting with a name, description, date and time, a location
that is either an online link or a physical address, optional preparation notes
with preparation time, one or more reminders (minutes before), and a repeat rule
(daily, weekly, monthly, or none) with an end. Single occurrences can be skipped
or moved. The calendar shows meetings, tasks with times and training sessions
together by day, week and month.

**Independent Test**: create a weekly meeting for 6 weeks with a 30-minute
reminder → skip week 3 → the calendar shows 5 occurrences and the reminder fires
30 minutes before each.

**Acceptance Scenarios**:

1. **Given** an online meeting, **When** the reminder fires, **Then** the
   notification opens the meeting with a tappable link.
2. **Given** a monthly meeting on the 31st, **When** February arrives, **Then**
   it lands on the last day of February.
3. **Given** preparation time of 15 minutes, **When** the agenda is shown,
   **Then** a preparation block precedes the meeting.

---

### User Story 7 — Manage my training (Priority: P2)

An athlete picks one or more sports (gym, football, cross-fit, calisthenics,
swimming, …). They set weekly training slots, and can create programs made of
weeks, sessions and exercises (or accept suggested ones). The Athlete screen shows
this week, the current or next practice — switching to tomorrow's after the
member's cut-off hour (default 21:00) — and lets them log, complete or cancel a
session. Today's tasks include the day's training slot.

**Independent Test**: set gym Mon/Wed/Fri 18:00 → on Wednesday at 21:30 the
Athlete screen shows Friday's session as "next"; Today (Wednesday) shows the
18:00 training slot alongside tasks.

**Acceptance Scenarios**:

1. **Given** two sports, **When** the week is viewed, **Then** sessions of each
   sport are distinguishable and both count toward the plan.
2. **Given** a completed session with logged sets, **When** the program is
   viewed, **Then** actual values sit next to targets.

---

### User Story 8 — Turn links into a program (Priority: P3)

An athlete saves links: an article, a website, a YouTube video or a whole
playlist. Botvy fetches and reads them in the background, shows each link's
progress (queued, reading, summarising, done, failed with retry), and produces a
summary, extracted images or video references, and — when enabled — a suggested
next session ("tomorrow is upper body; here is a suggestion from your saved
sources"). Suggestions can be accepted into the program or dismissed. The member
can turn suggestions off entirely.

**Independent Test**: save a playlist of three videos → three child entries
appear → each reaches "done" → a suggestion for the next session references at
least one of them.

**Acceptance Scenarios**:

1. **Given** a link that cannot be fetched, **When** ingestion fails, **Then** the
   link shows "failed" with the reason and a Retry action.
2. **Given** suggestions disabled, **When** a session is scheduled, **Then** no
   background suggestion is generated.

---

### User Story 9 — Know what to eat (Priority: P3)

A member's daily plan line reads "Workout: [name] | Meals: [names]". Meals are
generic suggestions unless the member has added their own meals, in which case
the member can choose to rotate their own library instead. Allergies always
exclude a meal; a plan that would contain an allergen is withheld, not shown with
a warning.

**Acceptance Scenarios**:

1. **Given** meal mode "my library" with five meals, **When** the evening plan is
   generated, **Then** the meal line uses only those meals.
2. **Given** a declared dairy allergy and mode "generic", **When** a suggestion
   would include yoghurt, **Then** the meal line is regenerated or omitted.

---

### User Story 10 — Work from my PC (Priority: P2)

At the PC, a member opens the Botvy side panel in Chrome: today's tasks, upcoming
meetings and a quick-add box. They can add a task or a link from a selection or
the current page with a right-click. Changes made on the PC appear on the phone
within seconds, and vice versa; the panel keeps working briefly offline and
catches up.

**Acceptance Scenarios**:

1. **Given** a task completed in the side panel, **When** the phone is online,
   **Then** the phone shows it completed within 10 seconds.
2. **Given** a selected sentence on a web page, **When** "Add as task" is chosen,
   **Then** a task with that title and the page link as a note is created.

---

### User Story 11 — Operate it safely (Priority: P2)

The owner signs in to the web admin portal: sees health (both data stores, the
model, push, and the freshness of scheduled jobs), users (role and ban), devices,
the settings registry, the automation workflows (activate, run), the ingestion
queue and usage. The public website describes the product and links to the app.

**Acceptance Scenarios**:

1. **Given** the scheduled sweep has not run for 15 minutes, **When** the
   overview loads, **Then** it shows the job as stale and health reads degraded.
2. **Given** a banned user, **When** they try to sign in, **Then** they are
   refused and their devices stop receiving notifications.

---

### User Story 12 — Everything is mine to configure (cross-cutting, P1)

Every default named in this document is a preference the member can change:
evening plan time, morning briefing time, next-practice cut-off, default lead
times, meal mode, suggestions on/off, quiet hours, language (English/Arabic),
label colours. Operator-level defaults (for new members) are editable in the admin
portal.

### Edge Cases

- Time zone change while travelling: times follow the member's profile zone;
  changing it re-schedules local alarms.
- Daylight-saving transitions: a 22:00 prompt still fires once at local 22:00.
- Two devices edit the same task offline: the device whose edit was based on the
  latest known version wins; the other is shown the server's version.
- A recurring meeting edited "for this occurrence only" must not alter the series.
- A playlist with 200 videos: ingestion is throttled and shows progress; the
  member can cancel.
- A model that is slow or down: chats degrade to "coach unavailable" without
  losing the member's message; reminders and plans are unaffected.
- A member deleting their account: all their data across stores is removed.

## Requirements *(mandatory)*

### Functional Requirements

**Accounts & access**
- **FR-A01** Members MUST be able to register with email + password + matching
  confirmation, or with Google.
- **FR-A02** Passwords MUST be at least 8 characters; the confirmation MUST match
  before submission.
- **FR-A03** Sessions MUST persist across app restarts and MUST be revocable by
  changing the password.
- **FR-A04** Two roles exist: member and administrator. Administrative screens and
  actions MUST be refused to members.
- **FR-A05** Automated callers (schedulers, workflows) MUST authenticate with
  their own credentials, distinct from member sessions, and MUST NOT be able to
  act as a member.
- **FR-A06** A fresh installation MUST provide a documented administrator login
  and MUST warn until its password is changed.

**Profile & preferences**
- **FR-P01** Members MUST be able to set display name, photo, time zone, language.
- **FR-P02** Members MUST be able to record height, weight (with history),
  symptoms, liked/disliked foods and allergies; any field may be left empty.
- **FR-P03** Every default time or mode in this spec MUST be a per-member
  preference with an operator-set default for new members.

**Tasks & labels**
- **FR-T01** A task has title, optional notes, optional date/time, priority
  (P1–P4), optional label, status (open/completed/cancelled), optional repeat rule
  with a mode (from schedule / from completion), optional estimated duration.
- **FR-T02** Labels have a name and a colour (palette default or custom).
- **FR-T03** Views: Today (grouped under "To Do — Today"), Upcoming, Overdue, by
  label, Completed, Deleted.
- **FR-T04** Delete MUST be undoable; deleted tasks keep their last status.
- **FR-T05** Unfinished tasks MUST roll forward explicitly with a carried-over
  count, never silently re-dated.

**Reminders & alerts**
- **FR-R01** A reminder has title, time, one or more lead times, status; it can be
  snoozed, completed, cancelled, deleted (undoable), restored, purged.
- **FR-R02** Alerts MUST fire on the device without a network connection.
- **FR-R03** A server fallback MUST deliver an alert to a device that has not
  synced since the alert was planned, and MUST NOT duplicate one the device holds.
- **FR-R04** Tasks with a time, meetings and daily-rhythm prompts MUST produce
  alerts through the same mechanism as reminders.

**Daily rhythm**
- **FR-D01** At the member's evening time, Botvy MUST present tomorrow's draft
  (top-priority tasks, training if any, meal line) and accept confirmation/edits.
- **FR-D02** At the member's morning time, Botvy MUST present today's plan.
- **FR-D03** Prompts MUST fire once per local day per member, and MUST catch up
  if the system was unavailable at the scheduled minute.
- **FR-D04** A daily check-in (mood, adherence, note) MUST be recordable from the
  coach chat or a notification, and MUST only be interpreted as a check-in inside
  the coach chat.
- **FR-D05** A streak MUST reflect consecutive adhered days.

**Chat**
- **FR-C01** Two pinned chats (Coach, Planner) MUST exist for every member,
  shown in their own section; they can be cleared but not deleted.
- **FR-C02** Quick-question chips MUST be offered per chat and MUST adapt to the
  latest check-in mood.
- **FR-C03** Coach answers MUST use the member's profile, allergies, training and
  today's plan; allergies are prohibitions.
- **FR-C04** The planner MUST create, list and cancel tasks and reminders (and
  create meetings) from plain-language requests, computing times in the member's
  zone in code, and MUST confirm what it did.
- **FR-C05** Replies MUST stream and MUST be cancellable.
- **FR-C06** Messages composed offline MUST be delivered later, interpreted as of
  the time they were typed.

**Meetings & calendar**
- **FR-M01** A meeting has name, description, start, duration, location (online
  link or address), preparation notes and preparation time, reminder offsets, and
  a repeat rule (none/daily/weekly/monthly) with an end condition.
- **FR-M02** Single occurrences MUST be skippable or movable without changing
  the series.
- **FR-M03** The calendar MUST merge meetings, timed tasks and training sessions
  in day, week and month views; the home screen MUST show today's agenda.

**Training**
- **FR-G01** Members MUST be able to choose one or more sports and weekly slots.
- **FR-G02** Programs are made of weeks, sessions (with a sport) and exercises
  with target and actual values; sessions can be logged, completed, cancelled.
- **FR-G03** The Athlete screen MUST show the current practice, or the next one
  once the member's cut-off hour (default 21:00) has passed.
- **FR-G04** Today MUST include the day's training slot as an item distinct from
  tasks.
- **FR-G05** Members MUST be able to keep their own workout library.

**Knowledge & suggestions**
- **FR-K01** Members MUST be able to save links (article, website, video,
  playlist); playlists expand into their videos.
- **FR-K02** Each link MUST show its processing state, including failure with a
  reason and a retry.
- **FR-K03** Processed links MUST yield a summary with source attribution and
  extracted media references.
- **FR-K04** When enabled, a suggestion for the next session MUST be generated
  from the member's sources and be acceptable into the program or dismissable.
- **FR-K05** Suggestions and any automated background generation MUST be
  switchable off per member.

**Nutrition**
- **FR-F01** Members MUST be able to keep a meals library.
- **FR-F02** The daily plan line MUST read "Workout: … | Meals: …", with meals
  generic unless the member chooses their library.
- **FR-F03** A plan containing a declared allergen MUST be withheld.

**Sync & offline**
- **FR-S01** Tasks, labels, reminders, meetings, programs, meals, links and chats
  MUST be available offline on the phone and synchronise when connected.
- **FR-S02** Conflicts MUST resolve deterministically and the losing side MUST be
  shown the winning version.
- **FR-S03** Deletions MUST propagate to every device.

**PC companion**
- **FR-X01** The Chrome side panel MUST show today's tasks and upcoming meetings,
  allow adding/completing tasks and adding meetings, and capture a selection or
  page as a task or link.
- **FR-X02** Changes MUST appear across phone and PC within 10 seconds when both
  are online.

**Operations**
- **FR-O01** Health MUST report each data store, the model, push, and the
  freshness of every scheduled job; a job silent for 15 minutes reads stale.
- **FR-O02** Administrators MUST be able to change roles, ban users, edit
  operator settings, activate/run workflows and inspect the ingestion queue.
- **FR-O03** All member-facing text MUST be available in English and Arabic,
  including right-to-left layout.

### Key Entities

- **Member (User)**: identity, credentials, role, status.
- **Profile**: display, time zone, language, body metrics history, food
  preferences, allergies, symptoms. **Preferences**: every configurable default.
- **Task**, **Label**, **Reminder**, **Alert** (a planned notification for any
  source).
- **Daily Plan** (a day's confirmed set), **Check-in**, **Streak**.
- **Conversation**, **Message**, **Quick Question**.
- **Meeting** (with repeat rule and exceptions), **Calendar Event**.
- **Athlete Profile** (sports, slots), **Program → Week → Session → Exercise →
  Set**, **Session Log**, **Workout** (library item).
- **Link**, **Knowledge Document** (extracted content + summary), **Suggestion**.
- **Meal**, **Meal Suggestion**.
- **Device**, **Service Client**, **Setting** (operator), **Heartbeat** (job
  freshness), **Usage**, **Audit entry**.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** A new member completes registration and profile in under 3 minutes.
- **SC-002** A task added on the PC is visible on the phone within 10 seconds
  (both online) in 95% of attempts.
- **SC-003** 100% of reminders fire on the phone in airplane mode within 60
  seconds of their time.
- **SC-004** Evening and morning prompts arrive within 5 minutes of the member's
  chosen time on 99% of days, exactly once per day.
- **SC-005** Zero coach suggestions contain a declared allergen across the test
  corpus.
- **SC-006** First streamed token of a chat reply appears within 5 seconds on the
  reference host; cancel stops generation within 1 second.
- **SC-007** A saved article reaches "done" within 3 minutes; a 10-video playlist
  within 20 minutes on the reference host.
- **SC-008** A stalled scheduled job is visible in health and the admin overview
  within 15 minutes.
- **SC-009** All member screens pass right-to-left layout review in Arabic.
- **SC-010** A member can change every default named here without operator help.

## Assumptions

- The owner runs Botvy on one machine they control; a handful to a few hundred
  members, not thousands.
- Existing member accounts carry over from v1; v1 reminders, chats and coaching
  history are not migrated (a one-off import may be added in the last phase).
- English and Arabic are the only languages in scope.
- Android is the mobile target; iOS is out of scope until an Apple developer
  account exists.
- Saving a YouTube link is a personal, low-volume use of public content by the
  member; Botvy documents the platform's terms and does not redistribute content.
- The daily rhythm is one evening touch and one morning touch; a separate
  end-of-day nudge is folded into the evening prompt (one preference away if
  wanted).
- One label per task.

## Out of scope (this blueprint)

- iOS build, Apple sign-in.
- Shared or team tasks, inviting other members to meetings, calendar
  import/export (ICS) and external calendar sync.
- Wearable integrations, heart-rate or GPS data.
- Payments, subscriptions, multi-tenant hosting.
- Fine-tuning a model.
