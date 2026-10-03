# Tasks: The phone gets a shell and a kit

**Input**: `spec.md`, `research.md`, `plan.md`.

**Tests**: every phase ends with `flutter analyze` and `flutter test` green in
`mobile/`, output pasted in its PR (constitution VII). Goldens are alchemist
CI goldens. Branch logic (redirect, branch index, deep links, appearance
restore, literal check) gets a test before the code that satisfies it.

**Task ids** are local to this phase. `[P]` = can run in parallel with the
other `[P]` tasks of the same phase. Paths are relative to `mobile/` unless
they start with `packages/` or `.github/`.

## Phase 1 — Tokens and theme (FR-008)

- [x] T3001 `packages/tokens/tokens.json`: add `space` (2/4/8/12/16/24/32),
  `radius.xl 16`, `radius.xxl 28`, `motion` (150/250/400); existing keys
  unchanged. `check:` `node packages/tokens/build.mjs` emits them; web admin
  and extension builds unchanged
- [x] T3002 `test/tokens_parity_test.dart`: reads `../packages/tokens/tokens.json`
  and fails on any colour/radius/space/motion that `lib/app/tokens.dart`
  disagrees with. `spec:` fails today on dark bg, dark accent, radius (A-9)
- [x] T3003 `lib/app/tokens.dart`: per-mode accent and `accentText`,
  `up/down/unknown`, corrected dark values; `BotvySpace`, `BotvyRadius`,
  `BotvyMotion` as `abstract final class` constants. `check:` T3002 green
- [x] T3004 `lib/app/theme.dart`: both mode columns; `FlexSubThemesData`
  per plan §1; `BotvyStatusColors extends ThemeExtension` with `lerp`.
  `check:` app builds; existing tests green
- [x] T3005 [P] `lib/features/calendar/presentation/calendar_page.dart:358`:
  the one `Colors.` becomes a scheme role
- [x] T3006 `tool/check_ui_literals.sh` + `.github/workflows/ci.yml` mobile
  job: the grep of plan §9, **warning only**. `spec:` a fixture file with one
  line per banned form — `EdgeInsets.all(8)`, `EdgeInsetsDirectional.only(start: 8)`,
  `SizedBox(height: 8)`, `SizedBox.square(dimension: 8)`,
  `BorderRadius.circular(8)`, `Color(0x…)`, `fontSize:`, `Colors.red` — is
  reported line by line; a fixture using `BotvySpace`/`BotvyRadius` and
  `EdgeInsetsDirectional.zero` is not

## Phase 2 — Appearance (FR-007, US4 scenarios 2-3)

- [x] T3011 `test/appearance_cubit_test.dart`: restore with nothing stored →
  system/system/haptics on; set dark + ar → stored → restore returns them;
  unreadable stored value → defaults, no throw
- [x] T3012 `lib/app/appearance/appearance_store.dart`,
  `appearance_cubit.dart`: `flutter_secure_storage` keys `appearance.theme`,
  `appearance.locale`, `appearance.haptics`. `check:` T3011 green
- [x] T3013 `lib/app/di.dart`, `lib/main.dart`: register and `restore()`
  before `runApp`; `MultiBlocProvider` with `AuthCubit` and
  `AppearanceCubit`; `MaterialApp.router` reads `themeMode` and `locale`.
  `check:` widget test pumps `BotvyApp` with `ar` stored and finds
  `TextDirection.rtl`

## Phase 3 — Kit (FR-009, US5)

- [x] T3021 `pubspec.yaml`: `alchemist` under `dev_dependencies`;
  `test/flutter_test_config.dart` with CI golden config. `check:` `flutter pub get`
- [x] T3022 [P] `lib/ui/section.dart`, `lib/ui/settings_tiles.dart`
  (`NavTile`, `SwitchTile`, `ChoiceTile`, `DangerTile`) +
  `test/ui/section_golden_test.dart` (light/dark × en/ar)
- [x] T3023 [P] `lib/ui/empty_state.dart`, `error_state.dart`,
  `loading_view.dart` + goldens
- [x] T3024 [P] `lib/ui/status_chip.dart` + golden for up/down/unknown in
  both modes; `test/ui/card_golden_test.dart` pins a `Card.filled` under the
  theme (light/dark × en/ar)
- [x] T3025 [P] `lib/ui/confirm_dialog.dart` + widget test (confirm returns
  true, cancel and barrier return false)
- [x] T3026 [P] `lib/ui/scroll_aware_fab.dart` + widget test (collapses on
  downward scroll, expands at top; tooltip required)
- [x] T3027 `analysis_options.yaml` or review rule: `lib/ui/**` imports no
  `features/**`. `check:` grep in `tool/check_ui_literals.sh`

## Phase 4 — Shell (FR-001…FR-004, US1, US2)

- [x] T3031 `test/router_deep_links_test.dart`: every input
  `routeForDeepLink` accepts today, both spellings, returns the same route;
  unknown → null. Written first, green before and after T3033
- [x] T3032 `test/app_shell_test.dart`: five destinations; switching
  preserves a pushed child and scroll; re-tap pops to root; cold start on
  `/chats/<id>` shows Coach selected with the bar; `/meetings/<id>` shows no
  bar and back lands on Today; width 840 shows `NavigationRail`; signed-out
  `/server` has no shell
- [x] T3033 `lib/ui/shell/destinations.dart`, `app_shell.dart`;
  `lib/app/router.dart`: `StatefulShellRoute.indexedStack`, five branches,
  children moved with their parents; drawer and auth routes on the root
  navigator; redirect untouched; `Routes.settings = '/settings'`.
  `check:` T3031, T3032 green
- [x] T3034 `lib/ui/shell/app_drawer.dart`: sections per plan §3; header from
  the profile mirror; Sign out via `showConfirmDialog` then
  `AuthCubit.signOut` (`auth_cubit.dart:181`). `spec:` drawer opens from the
  start edge in `ar`; cancel keeps the session
- [x] T3035 `lib/features/home/presentation/home_page.dart`: app bar = menu +
  title + avatar; the seven actions go; `'Calendar'` literal gone (A-13).
  `check:` SC-002 by widget test
- [x] T3036 `lib/features/profile/presentation/profile_page.dart`: app-bar
  shortcuts go (`profile_page.dart:100-135`); sign-out moves to drawer and
  Settings
- [x] T3037 `lib/app/l10n/app_localizations.dart`: labels for the five
  destinations, the drawer sections and items, en + ar.
  `check:` `test/localisation_parity_test.dart` green
- [x] T3038 `pubspec.yaml`: bump the build number for the release that
  carries this phase — 2.3.0+6, with the backend, frontend and extension, for the v2.3.0 release

## Phase 5 — FAB pass (FR-005, US3)

- [x] T3041 [P] `tasks_page.dart:84`, `reminders_page.dart:64`,
  `meetings_page.dart:34`, `calendar_page.dart:126`, `athlete_page.dart:72`,
  `conversations_page.dart:65`, `knowledge_page.dart:71`,
  `nutrition_page.dart:48`, `label_editor.dart:32`: switch to
  `ScrollAwareFab` with a localised label and tooltip; actions unchanged
- [x] T3042 `lib/app/theme.dart`: `floatingActionButtonTheme` from the
  sub-themes (radius.xl, primaryContainer). `check:` golden of one FAB in
  both modes

## Phase 6 — Settings hub (FR-006, US4)

- [x] T3051 `test/settings_page_test.dart`: seven section headers in order;
  each existing preference row present and calls the same cubit method it
  calls today; theme segment changes `AppearanceCubit`; Connection row opens
  `/server`; `/preferences` redirects to `/settings`
- [x] T3052 `lib/features/settings/presentation/settings_page.dart`: plan
  §5; rows moved from `preferences_page.dart`, which is deleted along with
  its `_Heading` / `_TimeRow`. `check:` T3051 green
- [x] T3053 About: the pubspec version injected at build with
  `--dart-define=BOTVY_VERSION` (no `package_info_plus` dependency), shown as
  "dev" when absent; licences via `showLicensePage`
- [x] T3054 `lib/app/l10n/app_localizations.dart`: section and row labels,
  en + ar; parity test green

## Phase 7 — Screen pass (SC-003, US5)

One commit per feature; each: literals → tokens, directional insets, kit
states, `SliverAppBar.large` on tab roots, `Card.filled` items,
`selectionClick` on switches (plan §8).

- [x] T3061 [P] home
- [x] T3062 [P] tasks (+ labels)
- [x] T3063 [P] reminders
- [x] T3064 [P] calendar + meetings
- [x] T3065 [P] chat (conversations, conversation)
- [x] T3066 [P] athlete (+ programs, session)
- [x] T3067 [P] nutrition
- [x] T3068 [P] knowledge
- [x] T3069 [P] profile, onboarding (optional: per-step accent from scheme
  roles, research B-2), sign-in, server
- [x] T3071 `tool/check_ui_literals.sh`: warning → failure in CI.
  `check:` CI red on each T3006 fixture form placed in `lib/features/`, green
  without it

## Phase 8 — Motion (FR-012, FR-013, US6, SC-006)

Plan §7 is the table this phase implements. Every task's `spec:` also runs
with `disableAnimations: true` and asserts the end state is reached in one
frame.

- [x] T3081 `pubspec.yaml`: `animations: ^2.2.0`. `check:` `flutter pub get`;
  `flutter analyze`
- [x] T3082 `lib/app/tokens.dart`: `BotvyMotion.of(context)` returning the
  token durations, or `Duration.zero` under `disableAnimations`; curves
  `Easing.emphasizedDecelerate` / `emphasizedAccelerate` / `standard`.
  `spec:` both branches (`test/motion_test.dart`)
- [x] T3083 `lib/app/theme.dart`: `PageTransitionsTheme` with
  `SharedAxisPageTransitionsBuilder(transitionType: scaled)` (ruling: Z, not X — the package's X axis ignores text direction) for Android
  and iOS. `spec:` a pushed route pumps a `SharedAxisTransition`; in `ar` it
  enters from the left
- [x] T3084 `lib/ui/shell/app_shell.dart`: `FadeThroughTransition` keyed on
  `currentIndex`. `spec:` switching tabs pumps one; with reduce-motion none
- [x] T3085 [P] `OpenContainer` list → detail on conversations, meetings,
  athlete sessions, knowledge links; `openBuilder` returns the route's page.
  `spec:` tap opens with transform and exactly one route on the stack; the
  same deep link opens without it (US6 scenario 2) — **partial**: a Hero title (conversation → chat) instead; OpenContainer pushes pageless routes beside go_router (breaks `pushReplacement` in ChatPage and the URL)
- [x] T3086 [P] `SliverAnimatedList` for tasks, reminders, meetings: insert,
  remove, reorder from the cubit's list diff (`lib/ui/motion/list_diff.dart`).
  `spec:` diff of before/after lists yields the right insert/remove indices,
  including duplicates and a move
- [x] T3087 [P] `lib/ui/motion/animated_check.dart`: check morph,
  strike-through, `lightImpact` when haptics on; used by task and reminder
  rows. `spec:` haptics off → no `HapticFeedback` call (mock the platform
  channel)
- [x] T3088 [P] `lib/ui/motion/stagger.dart` on Today: first build only.
  `spec:` refresh does not restart the controller
- [x] T3089 [P] `home_dials.dart`: `TweenAnimationBuilder` around
  `CompletionRing` and `AdherenceStrip`; dialogs via `showModal` +
  `FadeScaleTransition` in `confirm_dialog.dart`; `LoadingView` 300 ms delay.
  `spec:` a load that answers in under 300 ms never shows the spinner

## Phase 9 — Verify (SC-001…SC-006)

- [x] T3091 `flutter analyze`, `flutter test`, `flutter build apk --debug
  --flavor dev` — output in the PR
- [ ] T3092 Manual walk on a device: every screen in en and ar, light and
  dark, text scale 1.0 and 2.0, animations on and with "remove animations";
  screen recording of the US6 transitions attached; any clip, unmirrored icon
  or janky frame (profile mode, `flutter run --profile`, no frame over 16 ms
  on the transitions) filed and fixed before merge — **open**: needs a device; not done in the implementation session
- [ ] T3093 TalkBack pass on the shell, drawer and settings: every control
  announced, every target ≥ 48 dp — **open**: needs a device; not done in the implementation session
- [x] T3094 `docs/` and `CLAUDE.md`: the kit's rule (tokens only, `lib/ui/`
  imports no feature), `BotvyMotion.of` as the only source of durations, and
  the literal check, in the mobile gotchas