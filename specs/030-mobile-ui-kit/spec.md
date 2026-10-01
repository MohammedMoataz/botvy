# Feature Specification: The phone gets a shell and a kit

**Feature Branch**: `030-mobile-ui-kit`

**Created**: 2026-10-02

**Status**: Planned (design phase; no code in this branch)

**Input**: the Owner's request of 2026-10-02 — "follow modern designs, a cooler
UI, a floating action button, a bottom nav bar, side menu items, settings
divided into sections, reusable components". Clarified the same day:

| Question | Owner's answer |
|---|---|
| FAB style | Contextual, per tab (Material 3 standard), not a docked centre FAB or a speed dial |
| What goes in the bottom bar vs the side menu | The plan decides, from the feature inventory |
| How far this branch goes | Plan documents only; implementation is the next branches |
| Visual direction | Keep the Botvy palette and tokens; adopt the Material 3 Expressive *feel* (shape, motion, tonal surfaces) through our own tokens |

029 stays reserved for Supabase storage; this is 030.

## Why this feature exists

The mobile app has fifteen features and no navigation. Home's app bar carries
seven icon buttons (`home_page.dart:49-92`) and every other screen is pushed on
top of it, so the back stack grows with each hop and Knowledge, Meetings and
the gateway address are reachable only from inside another feature. Settings
are four pages that do not know about each other (profile, preferences,
server, onboarding), with no theme or language choice at all. Every page
re-implements its own empty state, loading spinner, section heading and FAB.
Colours and type already go through the theme — that part of 001's work
holds — but spacing (102 `EdgeInsets` literals, 160 `SizedBox` literals) and
radii do not, and `lib/app/tokens.dart` has drifted from
`packages/tokens/tokens.json` (dark background, dark accent, radius).

`tokens.json` itself says "Product palette work is a later, explicit design
task (research.md F-14)". This is that task, for the phone.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Move between the daily features in one tap (Priority: P1)

A member opens the app and sees a bottom navigation bar with the five things
they use every day. Switching tabs keeps each tab where it was — the scroll
position in Tasks, the open conversation in Coach. Tapping the active tab
returns it to its root.

**Acceptance Scenarios**:

1. **Given** the member is signed in, **When** the app starts, **Then** Today
   is shown with a bottom bar of Today, Tasks, Calendar, Coach, Training.
2. **Given** the member scrolled Tasks and opened a conversation in Coach,
   **When** they switch Tasks → Coach → Tasks, **Then** both are exactly where
   they left them.
3. **Given** a conversation is open inside Coach, **When** the member taps the
   Coach tab again, **Then** the tab pops to the conversation list.
4. **Given** a cold start from a notification with `botvy://chats/<id>`,
   **When** the app opens, **Then** the conversation is shown inside the Coach
   tab with the bar visible, and back returns to the conversation list.

### User Story 2 — Reach everything else from a side menu (Priority: P1)

The member opens a navigation drawer from Today's app bar (or by edge swipe)
and finds the secondary destinations: Reminders, Meetings, Nutrition,
Knowledge, Profile, Settings, and Sign out at the bottom.

**Acceptance Scenarios**:

1. **Given** any tab root, **When** the member taps the menu button, **Then**
   the drawer opens from the start edge (left in English, right in Arabic).
2. **Given** the drawer is open, **When** the member taps Meetings, **Then**
   Meetings opens full-screen above the shell with a back button.
3. **Given** the drawer, **When** the member taps Sign out, **Then** a
   confirmation dialog is shown before the session ends.

### User Story 3 — One obvious "create" action per screen (Priority: P1)

Each tab root that has a primary create action shows one FAB for it, in one
style. Tabs without one (Today) show none.

**Acceptance Scenarios**:

1. **Given** Tasks, **Then** a FAB "New task" opens the existing task sheet
   (`tasks_page.dart:84`).
2. **Given** Calendar, Coach or Training, **Then** the FAB keeps the action it
   has today (`calendar_page.dart:126`, `conversations_page.dart:65`,
   `athlete_page.dart:72`) — the nine FABs already exist and are already
   per-page; what changes is that they share one look, carry a label and a
   tooltip, and collapse on scroll.
3. **Given** the list is scrolled down, **When** it scrolls, **Then** an
   extended FAB collapses to its icon and expands again at the top.

### User Story 4 — Settings that read like settings (Priority: P1)

One Settings hub, divided into titled sections, reachable from the drawer.

**Acceptance Scenarios**:

1. **Given** Settings, **Then** the sections are, in order: Account,
   Appearance, Daily rhythm, Notifications, Planning, Connection, About.
2. **Given** Appearance, **When** the member picks System / Light / Dark,
   **Then** the app re-themes immediately and the choice survives a restart.
3. **Given** Appearance, **When** the member picks العربية, **Then** the app
   switches to Arabic and right-to-left without a restart, and the choice
   survives a restart. "System" follows the handset, as today.
4. **Given** any existing preference (the four daily times, check-in,
   quiet hours, lead times, week start, meeting length, meal mode, AI
   suggestions), **Then** it is in Daily rhythm, Notifications or Planning
   and saves exactly as it does today.
5. **Given** Connection, **Then** the gateway address row opens the existing
   server page, and it stays reachable signed out from sign-in.

### User Story 5 — The same component everywhere (Priority: P2)

Empty, loading and error states, section headers, cards, list rows and
status chips look and behave the same on every screen, in both themes and
both directions.

**Acceptance Scenarios**:

1. **Given** an empty Tasks, Reminders, Meetings, Knowledge or Chat list,
   **Then** each shows the same empty-state component with its own icon, one
   line and one action.
2. **Given** any component in the kit, **Then** a golden test pins it in
   light/dark × en/ar.

### User Story 6 — It feels current (Priority: P3)

Large collapsing app bars on tab roots, rounder tonal cards, short motion on
tab and state changes, light haptics on completion, and none of it when the
handset asks for reduced motion.

### Edge Cases

- A deep link for a drawer destination (`/meetings/<id>`, `/knowledge/<id>`)
  on a cold start: opens above the shell with Today behind it, so back lands
  somewhere real — the job `_MeetingOverList` and `_SheetOverHome` do today.
- `/server` stays reachable signed out; the shell never wraps sign-in,
  welcome or server.
- An unknown deep link still resolves to null and is ignored.
- Text scale 200%: the bar keeps labels, nothing clips; tiles grow, not
  truncate.
- Width ≥ 600 dp (foldable, tablet): the bar becomes a `NavigationRail`.
- A member whose stored locale is Arabic signs out: sign-in is still Arabic.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** The signed-in app MUST be a `StatefulShellRoute.indexedStack`
  with five branches: Today `/home`, Tasks `/tasks`, Calendar `/calendar`,
  Coach `/chats`, Training `/athlete`. Each branch keeps its own navigator.
- **FR-002** Every existing route path MUST keep its spelling, and
  `routeForDeepLink` MUST return the same route for every input it accepts
  today.
- **FR-003** Reminders, Meetings, Nutrition, Knowledge, Profile and Settings
  MUST open from a `NavigationDrawer`, above the shell (root navigator).
- **FR-004** Sign out MUST sit last in the drawer and in Settings → Account,
  behind a confirmation.
- **FR-005** Each tab root MUST own its FAB or none; one FAB per screen; style
  from the theme, not per page.
- **FR-006** A Settings hub `/settings` MUST group every member-facing setting
  into the seven sections of US4; `/preferences` remains as a route that opens
  the hub, for old links.
- **FR-007** Theme mode and locale MUST be member choices, stored on the
  device, applied before the first frame.
- **FR-008** `lib/app/tokens.dart` MUST match `packages/tokens/tokens.json`,
  and spacing, radius and motion MUST come from named tokens.
- **FR-009** A component kit under `lib/ui/` MUST provide: section, settings
  tiles, card, empty/error/loading states, status chip, confirm dialog.
- **FR-010** No new screen code MUST use a raw `EdgeInsets` number, a
  non-directional inset, `Color(0x…)` or `fontSize:`; a CI check enforces it.
- **FR-011** Every icon-only control MUST have a tooltip or semantic label;
  every tap target MUST be ≥ 48 dp.
- **FR-012** Motion MUST be disabled when `MediaQuery.disableAnimations` is
  true; haptics MUST be behind a setting that defaults on.

### Key Entities

- **Destination** — label key, icon, selected icon, route; one list drives the
  bar, the rail and the drawer.
- **AppearancePrefs** — theme mode (system/light/dark), locale (system/en/ar),
  haptics (on/off). Device-local; not synced — a phone and a tablet may want
  different themes.

## Success Criteria *(mandatory)*

- **SC-001** Every daily feature is one tap from any tab root; every secondary
  one is two (menu → item).
- **SC-002** Home's app bar has at most two actions (was seven).
- **SC-003** `EdgeInsets`/`SizedBox` number literals in `lib/features/**`: 0
  (was 102 + 160), enforced by CI.
- **SC-004** Every kit component has a golden in 4 variants; the shell and the
  deep-link table have widget tests; `flutter analyze` and `flutter test`
  green.
- **SC-005** Every screen walked in Arabic at 200% text scale with nothing
  clipped or unmirrored (manual, recorded in the PR with screenshots).

## Out of scope

- A new brand palette (the Owner kept it). Web admin, extension and landing
  page (they read the same tokens and get the new ones for free, unchanged).
- A centre-docked FAB or speed-dial quick-add (refused at clarify; the Pulse
  app's scrim-and-pills overlay was the reference and was not picked).
- A community "Material 3 Expressive" widget package (see research R-3).
- Moving localisation to ARB/gen-l10n.
- Widgetbook (YAGNI until the kit passes ~15 components; R-8).
