# Research: The phone gets a shell and a kit

**Date**: 2026-10-02. Three sweeps: the Botvy mobile app as it is, the Pulse
app (a sibling Flutter project the Owner wrote, used as a reference for what to
borrow and what to avoid), and the current guidance for the stack this app is
locked to. Findings carry an id so `plan.md` can cite them.

## A. Botvy mobile today (the gaps)

| Id | Finding | Evidence |
|---|---|---|
| A-1 | No persistent navigation: 0 hits for `NavigationBar`, `Drawer`, `NavigationRail`, `ShellRoute`, `BottomAppBar`. Home's app bar holds 7 `IconButton`s that `context.push`. | `home_page.dart:49-92` |
| A-2 | Flat `GoRouter`, every hop is a push; back stack grows; no per-tab state. Route constants and deep-link table are well documented and must be kept. | `router.dart:42-120`, `routeForDeepLink` |
| A-3 | Cold-start deep links rely on `_SheetOverHome` / `_MeetingOverList` to put something real behind the target. | `router.dart` (end of file) |
| A-4 | 13 Cubits, 0 Blocs; all `registerSingleton` in get_it and handed to pages by `BlocProvider.value` (~25 times in the route table). State classes are hand-written immutable + `copyWith`. Consistent and fine; not what this phase changes. | `di.dart`, `router.dart` |
| A-5 | Nine page-local FABs, already contextual; mixed plain/extended, three without tooltip. | `tasks_page.dart:84`, `reminders_page.dart:64`, `meetings_page.dart:34`, `calendar_page.dart:126`, `athlete_page.dart:72`, `conversations_page.dart:65`, `knowledge_page.dart:71`, `nutrition_page.dart:48`, `label_editor.dart:32` |
| A-6 | Settings split over profile (app-bar icons for tasks, reminders, preferences, server, logout), preferences (one flat `ListView` with a private `_Heading`), server, onboarding. No theme or language choice. | `profile_page.dart:100-135`, `preferences_page.dart:77-295`, `server_page.dart` |
| A-7 | `MaterialApp.router` has `theme`/`darkTheme`, no `themeMode`, no `locale` — both follow the handset only. | `main.dart:~84-110` |
| A-8 | Theme is `FlexThemeData` with `FlexSchemeColor.from(primary, error)` and `defaultRadius` only — no component sub-themes, no text theme. | `lib/app/theme.dart:12-37` |
| A-9 | `tokens.dart` drifted from `tokens.json`: dark bg `0F1216` vs `101418`, dark accent not lifted (`2563EB` vs `60A5FA`), radius `10` vs `4/6/8`; `accentText`, `unknown`, type scale missing. | `lib/app/tokens.dart`, `packages/tokens/tokens.json` |
| A-10 | Colour and type already go through the theme (`Color(0x` 0, `fontSize:` 0, `Colors.` 1 at `calendar_page.dart:358`). Spacing does not: 102 `EdgeInsets.*` literals, 160 `SizedBox(height/width` literals, 6 `BorderRadius.circular`. | grep over `lib/` |
| A-11 | No shared widget directory. Reusable pieces live inside features (`home_dials.dart`, `training_row.dart`, `tag_editor.dart`, `label_editor.dart`, `repeat_picker.dart`, `assistant_markdown.dart`). Empty/loading/error states inline per page. | `features/**` |
| A-12 | Tests: 27 files, mostly cubit/logic; few widget tests; no goldens; no router or page tests. A redesign is unverifiable beyond `flutter analyze` today. | `test/` |
| A-13 | Literal strings remain, e.g. `tooltip: 'Calendar'`. | `home_page.dart:73` |
| A-14 | Constitution has no accessibility rule; VIII (YAGNI) says no dependency without present need and duplicate a helper until a third use. | `.specify/memory/constitution.md` |

## B. Pulse app (reference)

Pulse is flutter_bloc 8 + Cubits, Arabic-first, one light theme.

Borrowed as ideas:

- **B-1** Clear role/feature shell with its own bottom nav (`Layout/Main/main_screen.dart:388-423`) — validated the "5 daily destinations" split.
- **B-2** Per-page accent in onboarding (`Models/onboarding_data/onboard_data.dart:15-40`) — a cheap way to make Botvy's welcome flow feel designed; taken as an optional polish task, using `colorScheme` roles, not new colours.
- **B-3** A bundled Arabic-capable font (Tajawal, `assets/fonts`) — noted; **not** taken this phase (R-6).
- **B-4** The scrim-and-pills quick-action overlay (`main_screen.dart:238-262`) — considered as a quick-add, refused at clarify in favour of contextual FABs.

Avoided, because Pulse shows the cost:

- **B-5** Widgets stored in the cubit and screens swapped without an `IndexedStack`, so tab state is lost (`Shared/Cubit/cubit.dart:20-45`). Botvy gets per-branch navigators instead.
- **B-6** Marker-only states with data as mutable cubit fields (`Shared/Cubit/states.dart`). Botvy's immutable states stay.
- **B-7** Mutable global colours, no `ColorScheme`, no dark theme, 252 hard-coded colours/sizes. Botvy keeps everything in tokens + theme.
- **B-8** A 1,603-line `components.dart` with ~45 classes, ten copy-pasted clippers and a button with seven required parameters (`Shared/Components/components.dart:115`). Botvy's kit is one widget per file, few parameters, sensible defaults, theme-driven.
- **B-9** Text scale forced to 1.0 (`main.dart:70-73`). Botvy must honour the member's text scale.

## C. Stack guidance (web, 2026)

- **R-1 Shell.** `StatefulShellRoute.indexedStack` with one `StatefulShellBranch` per tab, each with its own navigator key; the shell builder receives a `StatefulNavigationShell` used as the body; switch with `goBranch(i, initialLocation: i == currentIndex)` so re-tapping the active tab pops to root. Sources: [codewithandrea](https://codewithandrea.com/articles/flutter-bottom-navigation-bar-nested-routes-gorouter/), [go_router configuration topic](https://pub-web-s2.flutter-io.cn/documentation/go_router/16.3.0/topics/Configuration-topic.html).
- **R-2 Adaptive.** `flutter_adaptive_scaffold` was discontinued by the Flutter team in 2025 ([itsallwidgets](https://forum.itsallwidgets.com/t/flutter-team-announces-several-packages-to-be-discontinued/2579)). Hand-roll: `MediaQuery.sizeOf` with Material window classes (compact < 600, medium 600–839, expanded ≥ 840); `NavigationBar` / `NavigationRail` from one destination list.
- **R-3 Material 3 Expressive.** Not in Flutter's core Material library; only community packages (`material_3_expressive`, `material_expressive`) ([pub](https://pub.dev/documentation/material_3_expressive/1.0.7/), [codewithandrea May 2025](https://codewithandrea.com/newsletter/may-2025/)). `useMaterial3` is already the default ([docs](https://docs.flutter.dev/release/breaking-changes/material-3-default.html)). Decision: get the feel (larger radii, tonal surfaces, springier motion, emphasised type) through our tokens and `FlexSubThemesData`; no community package.
- **R-4 Navigation drawer.** Primary destinations in the bar; drawer for secondary ones such as account and settings ([Android layout & nav patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns?hl=en)). M3 Expressive moves away from the standalone drawer toward an expanded rail on large screens ([9to5google](https://9to5google.com/2025/05/14/material-3-expressive-navigation/)). Decision: modal `NavigationDrawer` on compact widths (what the Owner asked for); on ≥ 600 dp the rail carries the tabs and its leading menu button opens the same drawer. No permanent drawer.
- **R-5 FAB.** M3 favours a per-screen FAB owned by that screen's `Scaffold`, hidden where there is no primary create action; the centre-docked notched bar is an M2-era pattern. Matches A-5 and the Owner's answer.
- **R-6 Tokens & theme.** Pure constants (spacing 4/8/12/16/24/32, radii, durations) as `static const`; `ThemeExtension` only for values that change between light and dark (here: `up`/`down`/`unknown` status colours). Never a raw colour or `fontSize` in features. Fonts: the platform font already renders Arabic; a bundled font is a brand decision, deferred.
- **R-7 Lint.** Dart 3.10 added an official analyzer-plugin system ([docs](https://dart.googlesource.com/sdk/+/stable/pkg/analysis_server_plugin/doc/using_plugins.md)); `custom_lint` is legacy. No built-in lint bans number literals in `EdgeInsets`. Decision: a ~20-line CI grep (the cheapest rung), upgrade to a plugin only if the grep proves leaky.
- **R-8 Goldens & catalog.** `golden_toolkit` is discontinued; `alchemist` 0.14 (March 2026) is the maintained successor ([pub](https://pub.dev/packages/alchemist), [VGV tutorial](https://verygood.ventures/blog/alchemist-golden-tests-tutorial.md)). CI goldens render text as blocks so they are stable across OSes. Widgetbook is worth it past ~15 components; not now.
- **R-9 Bloc.** Cubit by default; Bloc when event transformers are needed. Sealed state classes with exhaustive `switch` are the modern shape, but rewriting 13 working states is not this phase. App-level `AppearanceCubit` provided above `MaterialApp`. Navigation stays in go_router — no navigation cubit.
- **R-10 Settings.** Section header (`titleSmall`, primary colour) + grouped tiles; `SwitchListTile` for booleans; value + chevron for sub-pages; `SegmentedButton` for theme mode; destructive actions last with confirmation; whole tile tappable, ≥ 48 dp. Search only past ~20 settings (Botvy has ~12).
- **R-11 Feel.** `SliverAppBar.large` on tab roots; `Card.filled` tonal cards; radii 12–28; motion 150–400 ms and off under `MediaQuery.disableAnimations`; fade-through between tabs (first drafted on plain `FadeTransition`; superseded by R-13 once the Owner asked for full motion); `HapticFeedback.selectionClick` on toggles, `lightImpact` on completion; empty state = icon + one line + one action; skeletons rarely needed in a local-first app (the drift cache answers instantly).
- **R-12 Accessibility & RTL.** ≥ 48 dp targets, labels on icon-only buttons, test at 200% text scale, WCAG AA in both themes; `EdgeInsetsDirectional` / `AlignmentDirectional`; mirror directional icons, not media icons. The framework mirrors bar, rail and drawer.

- **R-13 Material motion package.** `animations` 2.2.0 (April 2026; Flutter ≥ 3.35, Dart ^3.9) is Google's own package for the M3 transition patterns: `OpenContainer` (container transform), `SharedAxisTransition` / `SharedAxisPageTransitionsBuilder`, `FadeThroughTransition`, `FadeScaleTransition` + `showModal` ([pub docs](https://pub.dev/documentation/animations/latest/), [changelog](https://flutter.googlesource.com/mirrors/packages/+/refs/heads/main/packages/animations/CHANGELOG.md), [VGV deep dive](https://verygood.ventures/blog/a-deep-dive-into-the-flutter-animations-package)). Taken after the Owner asked for full M3 motion; it replaces what would otherwise be several hundred lines of hand-rolled transitions. Easing comes from Flutter's own M3 `Easing` constants.

## D. Navigation decision

Fifteen features; five go in the bar by daily use, the rest in the drawer.

| Bar (branch root) | Why |
|---|---|
| Today `/home` | The hub; rhythm cards, day line |
| Tasks `/tasks` | Highest-frequency write |
| Calendar `/calendar` | Day/week/month; meetings are reached from here too |
| Coach `/chats` | "What this phase makes the app for" (`home_page.dart` comment) |
| Training `/athlete` | Daily session logging, with programs and knowledge below it |

| Drawer (above the shell) | Why not the bar |
|---|---|
| Reminders | Mostly passive (notifications); creation also from Tasks |
| Meetings | Already shown in Calendar |
| Nutrition | Daily, but read via Today's day line; revisit with usage data |
| Knowledge | Weekly use |
| Profile, Settings | Secondary by M3 guidance |
| Sign out | Last, with confirmation |

Settled by the Owner on 2026-10-02: Training is the fifth tab, Nutrition and
Reminders stay in the drawer.
