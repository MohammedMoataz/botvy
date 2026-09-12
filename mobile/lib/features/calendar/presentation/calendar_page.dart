import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart'
    show memberDate, memberZone;
import '../../meetings/application/meetings_cubit.dart';
import '../../meetings/presentation/meeting_sheet.dart';
import '../../meetings/presentation/meetings_page.dart'
    show
        formatInZone,
        openMeetingLocation,
        showMeetingActions,
        showOccurrenceActions,
        timeInZone;
import '../application/agenda.dart';
import '../application/calendar_cubit.dart';
import 'event_sheet.dart';

/// One calendar: a month, a week and a day (story 3).
///
/// Everything on it comes from drift and is expanded on the device (FR-010).
/// There is no GraphQL call anywhere in this feature, and that is a rule rather
/// than an accident — the server's `AgendaQuery` and `MonthOverviewQuery` serve
/// the extension and the web calendar, which are online by construction. A
/// query here would break offline reading *silently*, because a developer's
/// phone always has wifi.
class CalendarPage extends StatelessWidget {
  const CalendarPage({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<CalendarCubit>();
    final meetings = context.read<MeetingsCubit>();

    return BlocBuilder<CalendarCubit, CalendarState>(
      builder: (context, state) {
        final zone = memberZone(state.timezone);
        return Scaffold(
          appBar: AppBar(
            title: const Text('Calendar'),
            actions: [
              IconButton(
                icon: const Icon(Icons.today),
                tooltip: 'Today',
                onPressed: () => unawaited(cubit.goToToday()),
              ),
            ],
          ),
          floatingActionButton: _AddButton(cubit: cubit, meetings: meetings),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: SegmentedButton<CalendarMode>(
                  segments: const [
                    ButtonSegment(
                      value: CalendarMode.month,
                      label: Text('Month'),
                    ),
                    ButtonSegment(
                      value: CalendarMode.week,
                      label: Text('Week'),
                    ),
                    ButtonSegment(value: CalendarMode.day, label: Text('Day')),
                  ],
                  selected: {state.mode},
                  onSelectionChanged: (choice) =>
                      cubit.setMode(choice.first),
                ),
              ),
              if (state.problem != null)
                MaterialBanner(
                  content: Text(state.problem!),
                  actions: [
                    TextButton(
                      onPressed: cubit.clearProblem,
                      child: const Text('Dismiss'),
                    ),
                  ],
                ),
              Expanded(
                child: state.loading
                    ? const Center(child: CircularProgressIndicator())
                    : switch (state.mode) {
                        CalendarMode.month => _MonthView(
                          state: state,
                          cubit: cubit,
                          meetings: meetings,
                          zone: zone,
                        ),
                        CalendarMode.week => _WeekView(
                          state: state,
                          cubit: cubit,
                          meetings: meetings,
                          zone: zone,
                        ),
                        CalendarMode.day => _DayView(
                          state: state,
                          cubit: cubit,
                          meetings: meetings,
                          zone: zone,
                        ),
                      },
              ),
            ],
          ),
        );
      },
    );
  }
}

/// A meeting or a personal event, from the day the member is looking at.
class _AddButton extends StatelessWidget {
  const _AddButton({required this.cubit, required this.meetings});

  final CalendarCubit cubit;
  final MeetingsCubit meetings;

  @override
  Widget build(BuildContext context) => FloatingActionButton(
    onPressed: () => showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.videocam_outlined),
              title: const Text('Meeting'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                unawaited(showMeetingSheet(context, meetings));
              },
            ),
            ListTile(
              leading: const Icon(Icons.cake_outlined),
              title: const Text('Personal event'),
              subtitle: const Text('A birthday, a holiday, focus time'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                unawaited(
                  showEventSheet(
                    context,
                    cubit,
                    on: cubit.state.selected.isEmpty
                        ? null
                        : dayWindow(
                            cubit.state.selected,
                            cubit.state.timezone,
                          ).from.toLocal(),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    ),
    child: const Icon(Icons.add),
  );
}

/// The month, with a marker on every busy day (FR-009).
///
/// A day is busy when it holds **at least one item of any kind** — the
/// requirement verbatim — which is why the marker is driven by
/// [CalendarState.busy] and not by a meetings query: a day with one timed task
/// and nothing else is a busy day, and a month that only marked meetings would
/// tell a member their Thursday was free.
class _MonthView extends StatelessWidget {
  const _MonthView({
    required this.state,
    required this.cubit,
    required this.meetings,
    required this.zone,
  });

  final CalendarState state;
  final CalendarCubit cubit;
  final MeetingsCubit meetings;
  final tz.Location zone;

  @override
  Widget build(BuildContext context) {
    final focus = state.selected.isEmpty
        ? (state.focus ?? DateTime.now())
        : dayWindow(state.selected, state.timezone).from;

    return Column(
      children: [
        TableCalendar<int>(
          // Bounds relative to the focused month rather than pinned years: a
          // literal `firstDay: DateTime(2020)` is a bound that starts refusing
          // legitimate dates the day somebody scrolls past it.
          firstDay: DateTime(focus.year - 5),
          lastDay: DateTime(focus.year + 5),
          focusedDay: focus.toLocal(),
          startingDayOfWeek: state.weekStartsOn == 'sunday'
              ? StartingDayOfWeek.sunday
              : StartingDayOfWeek.monday,
          selectedDayPredicate: (day) =>
              memberDate(day.toUtc(), zone) == state.selected,
          // The marker count, from the already-expanded window. `eventLoader`
          // is called for every cell on every build, so it must be a map
          // lookup and not a query — which is the difference SC-003 measures.
          eventLoader: (day) {
            final count = state.busy[_dateOf(day)] ?? 0;
            return List<int>.filled(count > 3 ? 3 : count, 0);
          },
          onDaySelected: (selected, focused) =>
              unawaited(cubit.select(_dateOf(selected))),
          onPageChanged: (focused) =>
              unawaited(cubit.load(focus: focused.toUtc())),
          calendarFormat: CalendarFormat.month,
          availableGestures: AvailableGestures.horizontalSwipe,
          headerStyle: const HeaderStyle(formatButtonVisible: false),
        ),
        const Divider(height: 1),
        // Tapping a day opens that day (story 3, scenario 3): the agenda for
        // the selection sits under the grid rather than on another route, so
        // the member can see both at once.
        Expanded(
          child: _Agenda(
            items: state.today,
            state: state,
            cubit: cubit,
            meetings: meetings,
            zone: zone,
          ),
        ),
      ],
    );
  }

  /// A `DateTime` from the grid, as the member's own local date.
  ///
  /// `table_calendar` hands back a local `DateTime` at midnight; the busy map
  /// is keyed by the member's date, which is the profile's zone and not the
  /// handset's. Formatting the grid's own fields rather than converting the
  /// instant is what keeps the two agreeing for a member whose phone is in a
  /// different zone from their profile.
  String _dateOf(DateTime day) =>
      '${day.year.toString().padLeft(4, '0')}-'
      '${day.month.toString().padLeft(2, '0')}-'
      '${day.day.toString().padLeft(2, '0')}';
}

/// Seven days side by side, each with its items in time order (story 3,
/// scenario 4), steppable forward and back.
class _WeekView extends StatelessWidget {
  const _WeekView({
    required this.state,
    required this.cubit,
    required this.meetings,
    required this.zone,
  });

  final CalendarState state;
  final CalendarCubit cubit;
  final MeetingsCubit meetings;
  final tz.Location zone;

  @override
  Widget build(BuildContext context) {
    final dates = state.week;
    return Column(
      children: [
        Row(
          children: [
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: () => unawaited(cubit.step(-1)),
            ),
            Expanded(
              child: Center(
                child: Text(
                  dates.isEmpty ? '' : '${dates.first} — ${dates.last}',
                ),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: () => unawaited(cubit.step(1)),
            ),
          ],
        ),
        const Divider(height: 1),
        Expanded(
          // Seven columns that scroll together horizontally: on a phone the
          // week does not fit, and a column per day compressed to fit shows
          // nothing legible. The scroll is on the row rather than on each
          // column so the seven days stay aligned.
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final date in dates)
                  SizedBox(
                    width: 168,
                    child: _WeekColumn(
                      date: date,
                      items: state.byDay[date] ?? const [],
                      selected: date == state.selected,
                      zone: zone,
                      onSelect: () => unawaited(cubit.select(date)),
                      onOpen: (item) => unawaited(
                        _openItem(context, item, state, cubit, meetings, zone),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _WeekColumn extends StatelessWidget {
  const _WeekColumn({
    required this.date,
    required this.items,
    required this.selected,
    required this.zone,
    required this.onSelect,
    required this.onOpen,
  });

  final String date;
  final List<AgendaItem> items;
  final bool selected;
  final tz.Location zone;
  final VoidCallback onSelect;
  final void Function(AgendaItem item) onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onSelect,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              color: selected
                  ? theme.colorScheme.primaryContainer
                  : Colors.transparent,
              child: Column(
                children: [
                  Text(
                    _weekdayShort(date),
                    style: theme.textTheme.labelMedium,
                  ),
                  Text(
                    date.substring(8, 10),
                    style: theme.textTheme.titleMedium,
                  ),
                  // The same "busy" as the month's marker: at least one item of
                  // any kind.
                  if (items.isNotEmpty)
                    Text('${items.length}', style: theme.textTheme.bodySmall),
                ],
              ),
            ),
          ),
          const SizedBox(height: 4),
          // Already in time order: `localAgenda` sorts the whole window once
          // and this is a slice of it, so a column never re-sorts and never
          // re-expands.
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: _ItemChip(item: item, zone: zone, onTap: () => onOpen(item)),
            ),
        ],
      ),
    );
  }
}

/// One day, everything on it in order (story 3, scenario 1).
class _DayView extends StatelessWidget {
  const _DayView({
    required this.state,
    required this.cubit,
    required this.meetings,
    required this.zone,
  });

  final CalendarState state;
  final CalendarCubit cubit;
  final MeetingsCubit meetings;
  final tz.Location zone;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: () => unawaited(cubit.step(-1)),
          ),
          Expanded(child: Center(child: Text(state.selected))),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: () => unawaited(cubit.step(1)),
          ),
        ],
      ),
      const Divider(height: 1),
      Expanded(
        child: _Agenda(
          items: state.today,
          state: state,
          cubit: cubit,
          meetings: meetings,
          zone: zone,
        ),
      ),
    ],
  );
}

/// The day's items, whole-day ones above the timed ones.
///
/// The split is story 4, scenario 1: an all-day event is shown apart from the
/// timed items rather than stretched across them, because a birthday drawn as
/// a 00:00–23:59 block reads as an all-day meeting.
class _Agenda extends StatelessWidget {
  const _Agenda({
    required this.items,
    required this.state,
    required this.cubit,
    required this.meetings,
    required this.zone,
  });

  final List<AgendaItem> items;
  final CalendarState state;
  final CalendarCubit cubit;
  final MeetingsCubit meetings;
  final tz.Location zone;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const Center(child: Text('Nothing on this day.'));
    }

    final allDay = [for (final item in items) if (item.allDay) item];
    final timed = [for (final item in items) if (!item.allDay) item];

    return ListView(
      children: [
        if (allDay.isNotEmpty) ...[
          for (final item in allDay)
            _ItemTile(
              item: item,
              zone: zone,
              onTap: () => unawaited(
                _openItem(context, item, state, cubit, meetings, zone),
              ),
            ),
          const Divider(),
        ],
        for (final item in timed)
          _ItemTile(
            item: item,
            zone: zone,
            onTap: () => unawaited(
              _openItem(context, item, state, cubit, meetings, zone),
            ),
          ),
      ],
    );
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({
    required this.item,
    required this.zone,
    required this.onTap,
  });

  final AgendaItem item;
  final tz.Location zone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(_iconFor(item), color: _tintFor(context, item)),
    title: Text(item.title),
    subtitle: Text(
      [
        if (item.allDay)
          'All day'
        else if (item.endAt.isAfter(item.startAt))
          '${timeInZone(item.startAt, zone)}–${timeInZone(item.endAt, zone)}'
        else
          timeInZone(item.startAt, zone),
        if (item.moved) 'moved',
        if (item.location.address != null) item.location.address!,
        if (item.location.onlineLink != null) 'online',
      ].join(' · '),
    ),
    trailing: item.location.isEmpty
        ? null
        : IconButton(
            icon: Icon(
              item.location.onlineLink != null ? Icons.videocam : Icons.map,
            ),
            tooltip: item.location.onlineLink != null
                ? 'Join'
                : 'Open in a map',
            onPressed: () => unawaited(_openLocation(context, item)),
          ),
    onTap: onTap,
  );
}

class _ItemChip extends StatelessWidget {
  const _ItemChip({
    required this.item,
    required this.zone,
    required this.onTap,
  });

  final AgendaItem item;
  final tz.Location zone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(6),
          border: Border(
            left: BorderSide(color: _tintFor(context, item), width: 3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              item.allDay ? 'All day' : timeInZone(item.startAt, zone),
              style: theme.textTheme.labelSmall,
            ),
            Text(
              item.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

/// A tap on an item, routed to whatever owns it (FR-009's "tap-through").
///
/// The kind is switched on rather than guessed, for the reason `di.dart` gives
/// about a chat card: an id routed to the wrong feature would be looked up in
/// the wrong table, find nothing, and silently do nothing — a tap that appears
/// not to work.
///
/// A meeting *occurrence* opens the occurrence actions and a one-off opens the
/// meeting's, which is FR-013 in the one place a member could confuse the two:
/// skip and move are about a date, complete and cancel are about the meeting.
Future<void> _openItem(
  BuildContext context,
  AgendaItem item,
  CalendarState state,
  CalendarCubit cubit,
  MeetingsCubit meetings,
  tz.Location zone,
) async {
  switch (item.kind) {
    case AgendaKind.meeting:
    case AgendaKind.preparation:
      final meeting = await meetings.byId(item.id);
      if (meeting == null || !context.mounted) return;
      final originalStart = item.originalStart;
      if (meeting.recurrenceJson != null && originalStart != null) {
        await showOccurrenceActions(
          context,
          meetings,
          meeting: meeting,
          originalStart: originalStart,
          startAt: item.startAt,
          zone: zone,
        );
      } else {
        await showMeetingActions(context, meetings, meeting, zone: zone);
      }
    case AgendaKind.event:
      final event = await cubit.eventById(item.id);
      if (event == null || !context.mounted) return;
      final originalStart = item.originalStart;
      if (event.recurrenceJson != null && originalStart != null) {
        await _showEventOccurrenceActions(
          context,
          cubit,
          event: event,
          item: item,
          originalStart: originalStart,
          zone: zone,
        );
      } else {
        await showEventSheet(context, cubit, event: event);
      }
    case AgendaKind.task:
      // Planning owns the task. No per-row route exists for one yet, so the
      // list is where a tap lands — better than nowhere, and it is the screen
      // the member was going to have to reach anyway. The same answer
      // `routeForDeepLink` gives.
      if (context.mounted) Navigator.of(context).maybePop();
    case AgendaKind.training:
      // Nothing produces one until P6. Reaching here means a newer build wrote
      // rows this one has no screen for; doing nothing beats guessing.
      break;
  }
}

/// Skip and move on one occurrence of a repeating event (FR-011).
///
/// The same two actions a meeting's occurrence offers, and no outcome — an
/// event has no status at all, so there is nothing here that could be confused
/// with completing one.
Future<void> _showEventOccurrenceActions(
  BuildContext context,
  CalendarCubit cubit, {
  required LocalCalendarEvent event,
  required AgendaItem item,
  required DateTime originalStart,
  required tz.Location zone,
}) => showModalBottomSheet<void>(
  context: context,
  builder: (sheetContext) => SafeArea(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          title: Text(item.title),
          subtitle: Text(formatInZone(item.startAt, zone)),
        ),
        const Divider(height: 1),
        ListTile(
          leading: const Icon(Icons.event_busy),
          title: const Text('Skip this one'),
          onTap: () {
            Navigator.of(sheetContext).pop();
            unawaited(cubit.skipEventOccurrence(item.id, originalStart));
          },
        ),
        ListTile(
          leading: const Icon(Icons.schedule_send),
          title: const Text('Move this one'),
          onTap: () async {
            Navigator.of(sheetContext).pop();
            final local = item.startAt.toLocal();
            final date = await showDatePicker(
              context: context,
              initialDate: local,
              firstDate: DateTime.now().subtract(const Duration(days: 365)),
              lastDate: DateTime.now().add(const Duration(days: 3650)),
            );
            if (date == null || !context.mounted) return;
            final time = await showTimePicker(
              context: context,
              initialTime: TimeOfDay(hour: local.hour, minute: local.minute),
            );
            if (time == null || !context.mounted) return;
            await cubit.moveEventOccurrence(
              item.id,
              originalStart,
              DateTime(
                date.year,
                date.month,
                date.day,
                time.hour,
                time.minute,
              ).toUtc(),
            );
          },
        ),
        ListTile(
          leading: const Icon(Icons.tune),
          title: const Text('Edit the whole event'),
          onTap: () {
            Navigator.of(sheetContext).pop();
            unawaited(showEventSheet(context, cubit, event: event));
          },
        ),
      ],
    ),
  ),
);

Future<void> _openLocation(BuildContext context, AgendaItem item) async {
  final messenger = ScaffoldMessenger.of(context);
  final opened = await openMeetingLocation(item.location);
  if (opened) return;
  // Said rather than swallowed: a member who taps Join and gets nothing has no
  // way to tell a broken link from a broken button.
  messenger.showSnackBar(
    const SnackBar(content: Text('Nothing on this phone can open that.')),
  );
}

IconData _iconFor(AgendaItem item) => switch (item.kind) {
  AgendaKind.meeting => item.location.onlineLink != null
      ? Icons.videocam_outlined
      : Icons.groups_outlined,
  AgendaKind.preparation => Icons.timer_outlined,
  AgendaKind.task => Icons.check_box_outline_blank,
  AgendaKind.training => Icons.fitness_center,
  AgendaKind.event => Icons.cake_outlined,
};

/// The colour that says what kind of thing this is (FR-009: "each
/// recognisable").
///
/// A personal event's own colour wins where it has one, because that is the
/// point of the field; everything else takes a role from the theme rather than
/// a literal, so both light and dark are legible without a second palette.
Color _tintFor(BuildContext context, AgendaItem item) {
  final scheme = Theme.of(context).colorScheme;
  if (item.color != null) {
    final cleaned = item.color!.replaceFirst('#', '');
    final value = int.tryParse(cleaned, radix: 16);
    if (value != null && cleaned.length == 6) return Color(0xFF000000 | value);
  }
  return switch (item.kind) {
    AgendaKind.meeting => scheme.primary,
    AgendaKind.preparation => scheme.tertiary,
    AgendaKind.task => scheme.secondary,
    AgendaKind.training => scheme.error,
    AgendaKind.event => scheme.outline,
  };
}

String _weekdayShort(String date) {
  final parts = date.split('-').map(int.parse).toList();
  final weekday = DateTime.utc(parts[0], parts[1], parts[2], 12).weekday;
  return const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1];
}
