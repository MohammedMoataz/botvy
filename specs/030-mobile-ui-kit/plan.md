# Implementation Plan: The phone gets a shell and a kit

**Branch**: `030-mobile-ui-kit` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

**Input**: `spec.md`; `mobile/lib/app/{router,theme,tokens,di}.dart`,
`mobile/lib/main.dart`, `mobile/lib/features/**/presentation/*_page.dart`,
`packages/tokens/tokens.json`, `.github/workflows/ci.yml`; the constitution.

## Summary

Mobile only. The flat router becomes a five-branch
`StatefulShellRoute.indexedStack` with a Material 3 `NavigationBar` (a
`NavigationRail` from 600 dp) and a modal `NavigationDrawer` for the secondary
destinations. Every route keeps its path, so deep links, notifications and
the tests that pin them do not move. The four settings pages fold into one
sectioned hub that adds the two choices the app never had — theme and
language. A small kit under `lib/ui/` replaces the per-page empty, loading,
error and heading code; tokens catch up with `tokens.json` and gain spacing,
radius and motion scales; a CI grep keeps raw numbers out of features. The
look moves toward Material 3 Expressive through our own tokens and theme, not
through a package; motion is full Material 3 — fade-through, shared axis,
container transform, animated lists — through Google's `animations`.

## Technical Context

**Language/Version**: Dart ≥ 3.5, Flutter stable (as CI pins it).

**Primary Dependencies**: one new runtime dependency, `animations` (Google's
Material motion package, 2.2.0, Flutter ≥ 3.35 — CI is on latest stable).
`go_router` (shell
routes are in the version already locked), `flex_color_scheme` 8 (sub-themes),
`flutter_bloc` 9, `get_it`, `flutter_secure_storage` 10.3.2 (appearance
choices, on the precedent the pubspec already sets for the gateway URL).
**Dev**: `alchemist` (goldens) — the one addition, justified by A-12: the
redesign is otherwise unverifiable.

**Storage**: three device-local strings (theme mode, locale, haptics). Not in
drift and not synced.

**Testing**: `flutter analyze`; `flutter test` (existing 27 files unchanged
and green); new: shell widget tests, deep-link table test, settings-hub widget
test, `AppearanceCubit` unit test, alchemist goldens for the kit; the CI
literal check.

**Target Platform**: Android (current flavors `dev`/`prod`); layout tested at
360 × 800 and 840 × 1200.

**Constraints**: locked decisions in `pubspec.yaml` (bloc, go_router, dio,
secure storage pin). Constitution VIII (YAGNI). en + ar, RTL. Local-first:
nothing here waits on the network.

## Constitution Check

| Principle | This phase |
|---|---|
| I. API owns all data; each context owns its store | untouched; appearance prefs are device UI state, not member data |
| II. n8n is workflow infrastructure only | untouched |
| III. Local-first LLM | untouched |
| IV. Forward-only migrations | no drift migration; nothing goes in the database |
| V. Single public surface | untouched |
| VI. Three principal kinds | untouched; sign-in, welcome and server stay outside the shell |
| VII. Tests for branch logic | the redirect, the branch index for a location, `routeForDeepLink`, `AppearanceCubit` and the CI check each get a test; goldens pin the kit |
| VIII. YAGNI | one runtime dependency (`animations`, for container transform, shared axis and fade-through — the M3 motion the Owner asked for; hand-rolling container transform is hundreds of lines) and one dev dependency (alchemist); no Widgetbook, no Expressive package, no bundled font, no Lottie/Rive; a kit component exists only once two screens use it |
| IX. Bounded contexts | `lib/ui/` is feature-agnostic and imports no feature; features import `lib/ui/`, never each other's widgets |
| X. Commands, queries, streams | untouched |
| XI. Times belong to the user | untouched; quiet hours and lead times move pages, not semantics |
| XII. Three kinds of configuration | appearance prefs are member choice stored on the device, not environment |

## Project Structure

```text
mobile/lib/
├── app/
│   ├── router.dart            # StatefulShellRoute + drawer routes; Routes unchanged (+ settings)
│   ├── theme.dart             # FlexSubThemesData + status ThemeExtension
│   ├── tokens.dart            # synced with tokens.json; + BotvySpace/BotvyRadius/BotvyMotion (BotvyMotion.of honours reduce-motion)
│   └── appearance/
│       ├── appearance_cubit.dart   # themeMode, locale, haptics
│       └── appearance_store.dart   # secure-storage read/write
├── ui/                        # the kit — feature-agnostic, one widget per file
│   ├── shell/
│   │   ├── app_shell.dart          # NavigationBar ⇄ NavigationRail by width
│   │   ├── app_drawer.dart         # NavigationDrawer, sections, sign-out
│   │   └── destinations.dart       # one list drives bar, rail, drawer
│   ├── section.dart                # header + grouped card of tiles
│   ├── settings_tiles.dart         # nav / switch / choice / danger tile
│   ├── empty_state.dart
│   ├── error_state.dart
│   ├── loading_view.dart
│   ├── status_chip.dart            # up/down/unknown from the ThemeExtension
│   ├── confirm_dialog.dart
│   ├── motion/                     # stagger helper, animated check, PageTransitionsTheme wiring
│   └── scroll_aware_fab.dart       # extended ⇄ icon on scroll
└── features/settings/presentation/
    ├── settings_page.dart          # the hub
    └── server_page.dart            # unchanged
mobile/tool/check_ui_literals.sh   # CI grep (FR-010)
mobile/test/ui/                     # goldens + shell/settings widget tests
packages/tokens/tokens.json         # + space, radius.xl/xxl, motion
```

## Design

### 1. Tokens and theme (FR-008, R-3, R-6)

- `tokens.json` gains `space` (`xxs 2, xs 4, sm 8, md 12, lg 16, xl 24, xxl 32`),
  `radius.xl 16`, `radius.xxl 28`, and `motion` (`short 150, medium 250,
  long 400` ms). The existing keys and their values stay, so web admin and the
  extension render as before. The generator in `packages/tokens/build.mjs`
  emits them for every target; the phone keeps its hand copy until the
  package ships a pubspec, but the copy is now regenerated-equivalent and a
  test (`tokens_parity_test.dart`) reads `tokens.json` and fails on drift.
- Dark accent becomes `60A5FA` as the JSON says; dark bg/surface/line corrected.
- `theme.dart` builds `FlexThemeData.light/dark` from both mode columns, with
  `FlexSubThemesData`: `defaultRadius: radius.xl`, `cardTheme` (filled,
  `radius.xl`, no margin — screens use `Card.filled` directly),
  FAB `radius.xl`, bottom sheets/dialogs `radius.xxl`, inputs filled,
  `navigationBarIndicatorSchemeColor: secondaryContainer`, chips rounded,
  `useM2StyleDividerInM3: false`. `BotvyStatusColors extends
  ThemeExtension` carries `up/down/unknown` per mode.
- Text theme: platform font; `headlineMedium`/`titleLarge` weight 600 for the
  "emphasised" Expressive feel. No bundled font (R-6).

### 2. Appearance (FR-007, US4)

`AppearanceCubit` (state: `ThemeMode`, `Locale?`, `bool haptics`), restored
in `main()` before `runApp` — the pattern `AuthCubit` already follows — and
provided next to it above `MaterialApp.router`, which reads `themeMode` and
`locale` from it. `null` locale = follow the handset (today's behaviour).
The `Directionality` builder in `main.dart` already follows
`AppLocalizations.textDirection`, so Arabic flips without more work.

### 3. Shell (FR-001…FR-004, US1, US2, R-1, R-2, R-4)

- `router.dart`: sign-in, welcome, server, the rhythm sheet routes and every
  drawer destination stay top-level `GoRoute`s on the root navigator. The
  five tab paths move under
  `StatefulShellRoute.indexedStack(builder: (_, __, shell) => AppShell(shell))`
  with one branch each; their existing children (`/chats/:id`,
  `/athlete/session/:id`, `/athlete/programs`) move with them.
- Paths do not change, so `routeForDeepLink`, notification payloads and
  `takePendingRoute` keep working. The redirect is untouched.
- `_SheetOverHome` and `_MeetingOverList` keep their job; Home behind a
  cold-start target is now the shell at branch 0.
- `AppShell`: `MediaQuery.sizeOf(context).width < 600` → `Scaffold(body:
  shell, bottomNavigationBar: NavigationBar(...))`; otherwise `Row(
  NavigationRail, Expanded(shell))`. `onDestinationSelected: (i) =>
  shell.goBranch(i, initialLocation: i == shell.currentIndex)`. The bar is
  hidden when the keyboard is up.
- `AppDrawer`: `NavigationDrawer` with a header (avatar + name from the
  profile mirror), sections "Plan" (Reminders, Meetings), "Health"
  (Nutrition), "Learn" (Knowledge), divider, Profile, Settings, divider,
  Sign out (confirm dialog → `AuthCubit.signOut`). Each item
  `context.push(route)` after closing the drawer. Opened from a leading menu
  button on every tab root's app bar and by edge swipe.
- Home's app bar: menu (leading), title, avatar → Profile. The seven buttons
  go; their targets are the bar and the drawer (SC-002).
- Profile's app-bar shortcuts (tasks, reminders, preferences, server,
  logout) go; Profile becomes profile fields only.

### 4. FAB (FR-005, US3, R-5)

Existing per-page FABs stay where they are. `ScrollAwareFab(icon, label,
onPressed, tooltip)` wraps `FloatingActionButton.extended` and collapses to
icon-only on downward scroll (a `ScrollNotification` listener, no package).
All nine call sites switch to it; three gain the tooltip they lack. Shape and
colour come from `floatingActionButtonTheme` via the sub-themes.

### 5. Settings hub (FR-006, US4, R-10)

`/settings` → `SettingsPage`, a `CustomScrollView` with
`SliverAppBar.large` and seven `Section`s:

| Section | Rows (source today) |
|---|---|
| Account | Profile → `/profile`; Sign out (danger tile, confirm) |
| Appearance | Theme `SegmentedButton` (System/Light/Dark); Language choice tile (System/English/العربية); Haptics switch |
| Daily rhythm | Plan-tomorrow, end-of-day, morning-briefing and next-practice-cutoff times; daily check-in switch (`preferences_page.dart:99-127, 215`) |
| Notifications | Quiet hours; reminder lead times (`preferences_page.dart:128-214`) |
| Planning | Week start; default meeting length (its literal `min` suffix moves to `AppLocalizations`); meal mode; AI suggestions switch (from `preferences_page.dart`) |
| Connection | Gateway address → `/server` (shows host as subtitle) |
| About | Version from the pubspec (`2.2.1+5` form); open-source licences (`showLicensePage`) |

The preferences rows keep their current cubit calls and server sync — only
the widgets move. `/preferences` redirects to `/settings`. `preferences_page`'s
private `_Heading` / `_TimeRow` are replaced by `Section` and the tiles.

### 6. Kit (FR-009, US5, B-8)

Each widget: one file, ≤ 4 parameters with defaults, colours and type only
from `Theme.of(context)`, insets only from `BotvySpace` and directional.

- `Section(title, children)` — `titleSmall` in `colorScheme.primary`,
  `Card.filled` group, dividers inset by `BotvySpace.lg`.
- `NavTile`, `SwitchTile`, `ChoiceTile`, `DangerTile` — `ListTile`
  variants; chevron mirrors in RTL.
- `EmptyState(icon, message, action?)`, `ErrorState(message, onRetry)`,
  `LoadingView()` — replace the inline spinners in `home_page.dart`,
  `profile_page.dart` and the empty branches of the list pages.
- `StatusChip(status)` — uses `BotvyStatusColors`.
- `showConfirmDialog(context, title, body, confirmLabel, destructive)`.

Promotion rule (constitution VIII): `home_dials.dart`, `tag_editor.dart`,
`label_editor.dart`, `repeat_picker.dart` stay in their features until a second
feature needs them.

### 7. Motion (FR-012, FR-013, US6, R-11, R-13)

The Owner asked for full Material 3 motion (clarify, 2026-10-02). One rule
over all of it: every animation reads its duration and curve from
`BotvyMotion`, and `BotvyMotion.of(context)` returns `Duration.zero` when
`MediaQuery.disableAnimations` is true — so reduce-motion is one switch, not
a check at every call site.

| Moment | Pattern | How |
|---|---|---|
| Tab switch | fade-through | `FadeThroughTransition` (`animations`) in `AppShell`, keyed on `currentIndex`, `medium` |
| Push / pop between screens | shared axis X (mirrored in RTL) | `PageTransitionsTheme` in `theme.dart` with `SharedAxisPageTransitionsBuilder`, once for the app |
| List card → detail (chat, meeting, session, knowledge link) | container transform | `OpenContainer` with `closedShape` from `radius.xl`, `long`; the go_router route stays the source of truth — the container's `openBuilder` returns the same page the route builds, and a deep link opens without the transform |
| Bottom sheets, dialogs, menus | fade + scale | `showModal` + `FadeScaleTransition` for dialogs; sheets keep Flutter's own motion with `sheetAnimationStyle` from the tokens |
| Tasks, reminders, meetings lists | insert / remove | `AnimatedList` (or `SliverAnimatedList`) driven by the cubit's list diff: size + fade in on create, slide out on delete, `short` |
| Task / reminder complete | check morph + strike-through | `AnimatedSwitcher` on the checkbox icon, `TweenAnimationBuilder` on the strike and opacity, `HapticFeedback.lightImpact` |
| Today cards on first paint | staggered entrance | one `AnimationController` per page, `Interval`s 40 ms apart, fade + 8 dp rise; only on the first build, not on refresh |
| Completion ring, adherence strip | value tween | `TweenAnimationBuilder<double>` around the existing painters in `home_dials.dart` |
| FAB | extend ⇄ collapse, hide on scroll | `ScrollAwareFab` (§4) animates width with `AnimatedSize`, `short` |
| Shape / colour state changes (chips, selected tiles, segmented button) | implicit | `AnimatedContainer` / theme state layers, `short` |
| Loading after 300 ms only | fade-in | `LoadingView` waits 300 ms before showing, so the local-first cache's instant answers never flash a spinner |

Curves: `Easing.emphasizedDecelerate` for enter, `Easing.emphasizedAccelerate`
for exit, `Easing.standard` for in-place change (Flutter's M3 easing
constants). Expressive "springiness" comes from these emphasised curves and
the `long` duration on container transforms — no physics package.

Not this phase: Lottie or Rive illustrations (the Owner chose icons only).

### 8. Screen pass (SC-003, US6, R-11, R-12)

Per feature, one commit each: swap literals for `BotvySpace`/`BotvyRadius`,
`EdgeInsets` → `EdgeInsetsDirectional`, adopt the kit's states, tab roots get
`SliverAppBar.large`, list items become `Card.filled` with `radius.xl`,
`selectionClick` haptics on switches when haptics is on. Literal strings found
on the way (A-13) move to `AppLocalizations`. The motion of §7 lands after
this pass, on the reworked screens.

### 9. Enforcement (FR-010, R-7)

`mobile/tool/check_ui_literals.sh`: fails if `lib/features/**` (excluding
`*.g.dart`) matches any of:

- `EdgeInsets\.(all|symmetric|only|fromLTRB)\(` — non-directional, banned
  outright;
- `EdgeInsetsDirectional\.\w+\([^)]*[0-9]` — directional is required, but
  with tokens, not numbers;
- `SizedBox\((height|width): *[0-9]` and `SizedBox\.square\([^)]*[0-9]`;
- `BorderRadius(Directional)?\.(circular|all|only)\([^)]*[0-9]`;
- `Color\(0x`, `fontSize:`, `Colors\.`.

`0` is allowed (`EdgeInsetsDirectional.zero` has no digit; `SizedBox(height: 0)`
is flagged and should be `SizedBox.shrink()`). Wired into the mobile CI job after
`flutter analyze`. Enabled as a warning in Phase 1 and as a failure once
Phase 7 lands, so the screen pass can go feature by feature.

## Judgement calls

- **Per-tab FAB, not a quick-add.** The Owner's choice and the M3 default;
  the nine FABs already exist in the right places (A-5), so this is a style
  pass, not a feature.
- **Modal drawer, not permanent.** M3 Expressive is retiring the standalone
  drawer for large screens (R-4); on a phone the modal drawer is still the
  right home for six secondary destinations. Wide screens get the rail.
- **Keep singleton cubits and `BlocProvider.value`.** They already preserve
  data across tabs (A-4); the shell adds preserved navigation stacks and
  scroll. Rewriting states to sealed classes is a separate, optional phase.
- **Device-local appearance.** A theme is a property of a screen, not of a
  member; no API change, no migration.
- **Grep over analyzer plugin.** Twenty lines, today; the plugin when the
  grep misses something real.

## Risks

| Risk | Mitigation |
|---|---|
| A deep link lands in the wrong branch or loses its back target | `routeForDeepLink` table test runs unchanged; new shell test drives each deep-link family on a cold start |
| `parentNavigatorKey` mistakes push drawer pages inside a branch | drawer routes declared outside the shell; widget test asserts the bar is absent on Meetings |
| Goldens flake across machines | alchemist CI goldens only (text as blocks); platform goldens not committed |
| Screen pass is large (≈ 260 literals) | one feature per commit; CI check is a warning until the last one |
| `OpenContainer` and go_router disagree about the back stack | the container only animates a tap from a list; deep links and back go through the router; shell test opens a chat both ways and asserts one route on the stack |
| Motion makes tests flaky | widget tests pump with `disableAnimations: true` except the motion tests themselves, which `pumpAndSettle` |
| Arabic layout regressions | every golden in `ar`; manual 200 % walk recorded in the PR (SC-005) |

## Rollout

Each phase in `tasks.md` is its own branch and PR off `main`, in order;
phases 5 (FAB) and 6 (settings) can run in parallel after 4 (shell), the
Phase 7 feature commits in parallel with each other, and Phase 8 (motion)
lands on the reworked screens after 7. The release that carries
Phase 4
bumps the build number (`2.2.1+5` → next) per the pubspec rule.
