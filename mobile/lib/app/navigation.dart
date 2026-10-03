import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_cubit.dart';
import '../ui/confirm_dialog.dart';
import '../ui/settings_tiles.dart';
import '../ui/shell/app_shell.dart';
import 'l10n/app_localizations.dart';
import 'router.dart';
import 'tokens.dart';

/// The five tabs, in the order of the shell's branches in `router.dart`.
///
/// Chosen by daily use (spec 030, research §D): the hub, the most frequent
/// write, the day/week/month, the coach, and the session log. Everything else
/// is in [BotvyDrawer].
List<ShellDestination> shellDestinations(AppLocalizations t) => [
  ShellDestination(
    icon: Icons.today_outlined,
    selectedIcon: Icons.today,
    label: t.navToday,
  ),
  ShellDestination(
    icon: Icons.check_circle_outline,
    selectedIcon: Icons.check_circle,
    label: t.navTasks,
  ),
  ShellDestination(
    icon: Icons.calendar_month_outlined,
    selectedIcon: Icons.calendar_month,
    label: t.navCalendar,
  ),
  ShellDestination(
    icon: Icons.forum_outlined,
    selectedIcon: Icons.forum,
    label: t.navCoach,
  ),
  ShellDestination(
    icon: Icons.fitness_center_outlined,
    selectedIcon: Icons.fitness_center,
    label: t.navTraining,
  ),
];

/// The first path segment of every location that lives inside the shell:
/// the five tabs, and the rhythm sheets, which open over Today.
const _shellSegments = {'home', 'tasks', 'calendar', 'chats', 'athlete', 'rhythm'};

bool isShellLocation(String location) {
  final segments = Uri.parse(location).pathSegments;
  return segments.isNotEmpty && _shellSegments.contains(segments.first);
}

/// Opens [location] from outside the widget tree: a notification tap, or one
/// parked during a cold start.
///
/// A tab's location is simply gone to — the shell puts it in its branch with
/// its parent under it. A drawer page (a meeting, a link, the nutrition day)
/// is pushed over Today, so back lands somewhere real instead of closing the
/// app; that is the job `_MeetingOverList` and `_SheetOverHome` did before
/// there was a shell. If the redirect did not let Today through (signed out,
/// or the walkthrough not done), the redirect's answer stands and nothing is
/// pushed over it.
Future<void> openFromOutside(GoRouter router, String location) async {
  if (isShellLocation(location)) {
    router.go(location);
    return;
  }
  router.go(Routes.home);
  if (router.routerDelegate.currentConfiguration.uri.path != Routes.home) {
    return;
  }
  unawaited(router.push(location));
}

/// The side menu: what is not a tab, then the account.
///
/// Every item is pushed above the shell, so its page has a back arrow and no
/// bar, and back returns to the tab the member was on.
class BotvyDrawer extends StatelessWidget {
  const BotvyDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final email = context.select<AuthCubit, String?>((c) => c.state.email);

    // In display order; [NavigationDrawer] numbers only the destinations.
    final routes = [
      Routes.reminders,
      Routes.meetings,
      Routes.nutrition,
      Routes.knowledge,
      Routes.profile,
      Routes.settings,
    ];

    void open(int index) {
      final router = GoRouter.of(context);
      Navigator.of(context).pop();
      unawaited(router.push(routes[index]));
    }

    Future<void> signOut() async {
      final auth = context.read<AuthCubit>();
      final confirmed = await showConfirmDialog(
        context,
        title: t.signOutConfirm,
        confirmLabel: t.signOut,
        destructive: true,
      );
      if (!confirmed) return;
      await auth.signOut();
    }

    Widget heading(String text) => Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        BotvySpace.xxl,
        BotvySpace.lg,
        BotvySpace.lg,
        BotvySpace.sm,
      ),
      child: Text(
        text,
        style: theme.textTheme.titleSmall?.copyWith(
          color: theme.colorScheme.primary,
        ),
      ),
    );

    NavigationDrawerDestination item(
      IconData icon,
      IconData selected,
      String label,
    ) => NavigationDrawerDestination(
      icon: Icon(icon),
      selectedIcon: Icon(selected),
      label: Text(label),
    );

    return NavigationDrawer(
      selectedIndex: null,
      onDestinationSelected: open,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            BotvySpace.xxl,
            BotvySpace.xl,
            BotvySpace.lg,
            BotvySpace.sm,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t.appTitle, style: theme.textTheme.headlineSmall),
              if (email != null)
                Text(
                  email,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ),
        heading(t.drawerPlan),
        item(
          Icons.notifications_none,
          Icons.notifications,
          t.remindersTitle,
        ),
        item(Icons.videocam_outlined, Icons.videocam, t.meetingsTitle),
        heading(t.drawerHealth),
        item(Icons.restaurant_outlined, Icons.restaurant, t.nutritionTitle),
        heading(t.drawerLearn),
        item(Icons.bookmarks_outlined, Icons.bookmarks, t.knowledgeTitle),
        const Padding(
          padding: EdgeInsetsDirectional.symmetric(
            horizontal: BotvySpace.xxl,
            vertical: BotvySpace.sm,
          ),
          child: Divider(),
        ),
        item(Icons.person_outline, Icons.person, t.profileTitle),
        item(Icons.settings_outlined, Icons.settings, t.settingsTitle),
        const Padding(
          padding: EdgeInsetsDirectional.symmetric(
            horizontal: BotvySpace.xxl,
            vertical: BotvySpace.sm,
          ),
          child: Divider(),
        ),
        Padding(
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: BotvySpace.md,
          ),
          child: DangerTile(
            icon: Icons.logout,
            title: t.signOut,
            onTap: signOut,
          ),
        ),
      ],
    );
  }
}
