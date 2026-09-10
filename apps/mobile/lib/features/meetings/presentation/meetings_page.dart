import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:url_launcher/url_launcher.dart';

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart' show memberZone;
import '../../../core/recurrence/expander.dart';
import '../../../core/recurrence/rule_words.dart';
import '../application/meetings_cubit.dart';
import 'meeting_sheet.dart';

/// The member's meetings, as a list.
///
/// The calendar is where a member reads their *day*; this is where they read
/// their *meetings* — the standing calls, the one-offs coming up, the ones they
/// have marked as done, and the ones they deleted. Which is why the row's
/// subtitle is the repeat in words and the next occurrence rather than a
/// position in a grid.
class MeetingsPage extends StatelessWidget {
  const MeetingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<MeetingsCubit>();

    return BlocBuilder<MeetingsCubit, MeetingsState>(
      builder: (context, state) => Scaffold(
        appBar: AppBar(title: const Text('Meetings')),
        floatingActionButton: FloatingActionButton(
          onPressed: () => unawaited(showMeetingSheet(context, cubit)),
          child: const Icon(Icons.add),
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: SegmentedButton<MeetingView>(
                segments: const [
                  ButtonSegment(
                    value: MeetingView.upcoming,
                    label: Text('Upcoming'),
                  ),
                  ButtonSegment(value: MeetingView.past, label: Text('Past')),
                  ButtonSegment(
                    value: MeetingView.deleted,
                    label: Text('Deleted'),
                  ),
                ],
                selected: {state.view},
                onSelectionChanged: (choice) =>
                    unawaited(cubit.show(choice.first)),
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
                  : state.meetings.isEmpty
                        ? const Center(child: Text('Nothing here yet.'))
                        : ListView.builder(
                            itemCount: state.meetings.length,
                            itemBuilder: (context, index) => _MeetingRow(
                              meeting: state.meetings[index],
                              state: state,
                              cubit: cubit,
                            ),
                          ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MeetingRow extends StatelessWidget {
  const _MeetingRow({
    required this.meeting,
    required this.state,
    required this.cubit,
  });

  final LocalMeeting meeting;
  final MeetingsState state;
  final MeetingsCubit cubit;

  @override
  Widget build(BuildContext context) {
    final zone = memberZone(state.timezone);
    final rule = MeetingRecurrence.decode(meeting.recurrenceJson);
    final next = state.nextOccurrences[meeting.id];
    final location = MeetingLocation.decode(meeting.locationJson);

    final subtitle = [
      if (rule != null)
        describeRule(rule.rrule, Localizations.localeOf(context).languageCode),
      if (next != null)
        'next ${formatInZone(next, zone)}'
      else if (rule != null)
        'no more occurrences'
      else
        formatInZone(meeting.startAt, zone),
      if (meeting.lockTimezone != null) 'on ${meeting.lockTimezone}\'s clock',
    ].join(' · ');

    return ListTile(
      leading: Icon(
        meeting.status == 'completed'
            ? Icons.check_circle_outline
            : meeting.status == 'cancelled'
                  ? Icons.block
                  : (location.onlineLink != null
                        ? Icons.videocam_outlined
                        : Icons.place_outlined),
      ),
      title: Text(meeting.title),
      subtitle: Text(subtitle),
      trailing: state.blocked.contains(meeting.id)
          ? IconButton(
              icon: const Icon(Icons.sync_problem),
              tooltip: 'Not saved to the server. Tap to try again.',
              onPressed: () => unawaited(cubit.retry(meeting.id)),
            )
          : null,
      onTap: state.view == MeetingView.deleted
          ? () => unawaited(cubit.restore(meeting.id))
          : () => unawaited(showMeetingSheet(context, cubit, meeting: meeting)),
      onLongPress: state.view == MeetingView.deleted
          ? null
          : () => unawaited(
              showMeetingActions(context, cubit, meeting, zone: zone),
            ),
    );
  }
}

/// What a member can do to a meeting.
///
/// **Complete and cancel are here, and nowhere else** (FR-013). They are
/// statements about the meeting — "it happened", "it is off" — and within a
/// series the member's two statements about one *date* are "not this one" and
/// "this one, later", which is why [showOccurrenceActions] offers skip and move
/// and neither of these. A per-occurrence status would be a fourth
/// representation of a series' state, disagreeing with the other three the
/// first time a rule changed.
Future<void> showMeetingActions(
  BuildContext context,
  MeetingsCubit cubit,
  LocalMeeting meeting, {
  required tz.Location zone,
}) => showModalBottomSheet<void>(
  context: context,
  builder: (sheetContext) => SafeArea(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          title: Text(meeting.title),
          subtitle: Text(formatInZone(meeting.startAt, zone)),
        ),
        const Divider(height: 1),
        // Story 1, scenarios 1 and 2, and the landing place for a notification
        // tap: the link is one tap away, and an address opens in a map. First
        // in the list because that is what somebody who just read a reminder
        // came here to do.
        ..._locationTiles(sheetContext, meeting),
        if (meeting.status == 'scheduled') ...[
          ListTile(
            leading: const Icon(Icons.check),
            title: const Text('Mark as happened'),
            // The whole meeting, series included: a completed series is one
            // that has run its course. A member who wants to record one date
            // and keep the rest skips or moves instead.
            subtitle: meeting.recurrenceJson == null
                ? null
                : const Text('The whole series'),
            onTap: () {
              Navigator.of(sheetContext).pop();
              unawaited(cubit.complete(meeting.id));
            },
          ),
          ListTile(
            leading: const Icon(Icons.block),
            title: const Text('Cancel'),
            subtitle: meeting.recurrenceJson == null
                ? null
                : const Text('The whole series'),
            onTap: () {
              Navigator.of(sheetContext).pop();
              unawaited(cubit.cancelMeeting(meeting.id));
            },
          ),
        ] else
          ListTile(
            leading: const Icon(Icons.undo),
            title: const Text('Put back in the diary'),
            onTap: () {
              Navigator.of(sheetContext).pop();
              unawaited(cubit.reopen(meeting.id));
            },
          ),
        ListTile(
          leading: const Icon(Icons.delete_outline),
          title: const Text('Delete'),
          onTap: () {
            Navigator.of(sheetContext).pop();
            unawaited(deleteMeetingWithUndo(context, cubit, meeting));
          },
        ),
      ],
    ),
  ),
);

/// Join, or open the address in a map — whichever the meeting has, or both.
///
/// Both are offered when both are stored, because a room that is also dialled
/// into is one meeting and the member decides on the day which half they need.
List<Widget> _locationTiles(BuildContext context, LocalMeeting meeting) {
  final location = MeetingLocation.decode(meeting.locationJson);
  final messenger = ScaffoldMessenger.of(context);

  Future<void> open(MeetingLocation only) async {
    Navigator.of(context).pop();
    final opened = await openMeetingLocation(only);
    if (opened) return;
    // Said rather than swallowed: a member who taps Join and gets nothing has
    // no way to tell a broken link from a broken button.
    messenger.showSnackBar(
      const SnackBar(content: Text('Nothing on this phone can open that.')),
    );
  }

  return [
    if (location.onlineLink != null)
      ListTile(
        leading: const Icon(Icons.videocam),
        title: const Text('Join'),
        subtitle: Text(location.onlineLink!, maxLines: 1),
        onTap: () => unawaited(
          open(MeetingLocation(onlineLink: location.onlineLink)),
        ),
      ),
    if (location.address != null)
      ListTile(
        leading: const Icon(Icons.map),
        title: const Text('Open in a map'),
        subtitle: Text(location.address!, maxLines: 2),
        onTap: () => unawaited(open(MeetingLocation(address: location.address))),
      ),
    if (!location.isEmpty) const Divider(height: 1),
  ];
}

/// What a member can do to **one date** of a series (FR-005).
///
/// Skip and move, and nothing else. See [showMeetingActions] for why an
/// outcome is not on this list.
///
/// [originalStart] is the moment the *rule* produced — not where the occurrence
/// currently sits — because that is the key an override and an exclusion are
/// filed under. Passing the moved instant instead would file a second override
/// against a date the rule never generated, and the first move would come back
/// the next time the series was read.
Future<void> showOccurrenceActions(
  BuildContext context,
  MeetingsCubit cubit, {
  required LocalMeeting meeting,
  required DateTime originalStart,
  required DateTime startAt,
  required tz.Location zone,
}) => showModalBottomSheet<void>(
  context: context,
  builder: (sheetContext) => SafeArea(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          title: Text(meeting.title),
          subtitle: Text(formatInZone(startAt, zone)),
        ),
        const Divider(height: 1),
        ListTile(
          leading: const Icon(Icons.event_busy),
          title: const Text('Skip this one'),
          subtitle: const Text('The rest of the series is untouched'),
          onTap: () {
            Navigator.of(sheetContext).pop();
            unawaited(cubit.skipOccurrence(meeting.id, originalStart));
          },
        ),
        ListTile(
          leading: const Icon(Icons.schedule_send),
          title: const Text('Move this one'),
          onTap: () async {
            Navigator.of(sheetContext).pop();
            await moveOccurrenceWithPicker(
              context,
              cubit,
              meeting: meeting,
              originalStart: originalStart,
              startAt: startAt,
            );
          },
        ),
        ListTile(
          leading: const Icon(Icons.tune),
          title: const Text('Edit the whole series'),
          onTap: () {
            Navigator.of(sheetContext).pop();
            unawaited(showMeetingSheet(context, cubit, meeting: meeting));
          },
        ),
      ],
    ),
  ),
);

/// Moves one occurrence, asking for the new date and time.
///
/// The pickers work in the handset's clock — that is the clock the member is
/// reading — and the result goes back as a UTC instant, which is what an
/// override stores. An override's `startAt` is a real moment rather than a wall
/// clock: the member has said "this one, then", about one date, and re-reading
/// it against a zone later would move the exception the series exists to
/// protect.
Future<void> moveOccurrenceWithPicker(
  BuildContext context,
  MeetingsCubit cubit, {
  required LocalMeeting meeting,
  required DateTime originalStart,
  required DateTime startAt,
}) async {
  final local = startAt.toLocal();
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

  await cubit.moveOccurrence(
    meeting.id,
    originalStart,
    DateTime(date.year, date.month, date.day, time.hour, time.minute).toUtc(),
  );
}

/// Deletes a meeting and offers the undo.
///
/// The delete never touches the status: the Deleted view is where a member
/// finds out whether the thing they removed had happened, been called off, or
/// was still in the diary.
Future<void> deleteMeetingWithUndo(
  BuildContext context,
  MeetingsCubit cubit,
  LocalMeeting meeting,
) async {
  final messenger = ScaffoldMessenger.of(context);
  await cubit.delete(meeting.id);
  messenger.showSnackBar(
    SnackBar(
      content: Text('Deleted "${meeting.title}"'),
      action: SnackBarAction(
        label: 'Undo',
        onPressed: () => unawaited(cubit.restore(meeting.id)),
      ),
    ),
  );
}

/// Opens a meeting's link, or its address in whatever map the handset has.
///
/// Story 1, scenarios 1 and 2: an online meeting is one tap from the reminder,
/// and an address can be opened in a map. `geo:` first because it is what an
/// Android map handler registers for; the web fallback is what an iPhone and a
/// desktop answer.
///
/// Returns false when nothing could open it, so the caller can say so rather
/// than leaving a tap that appears not to work.
Future<bool> openMeetingLocation(MeetingLocation location) async {
  /// One attempt. `launchUrl` answers false on some platforms and *throws* a
  /// `PlatformException` on others when nothing can handle the intent, so both
  /// are the same answer here — the caller's job is to say "nothing on this
  /// phone can open that", not to distinguish two ways of being told.
  Future<bool> tryOpen(Uri uri) async {
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }

  final link = location.onlineLink;
  if (link != null) {
    final uri = Uri.tryParse(link);
    if (uri != null && await tryOpen(uri)) return true;
  }

  final address = location.address;
  if (address == null) return false;

  final query = Uri.encodeComponent(address);
  for (final candidate in [
    Uri.parse('geo:0,0?q=$query'),
    Uri.parse('https://www.google.com/maps/search/?api=1&query=$query'),
  ]) {
    if (await tryOpen(candidate)) return true;
  }
  return false;
}

/// "Tue 2 Sep, 18:00" in the member's own zone.
///
/// Formatted from a [tz.TZDateTime] rather than from `toLocal()`, because the
/// member's zone is the profile's and not the handset's — a member whose
/// profile says Cairo reads Cairo times on a phone that thinks it is in Berlin.
String formatInZone(DateTime instant, tz.Location zone) {
  final local = tz.TZDateTime.from(instant, zone);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${days[local.weekday - 1]} ${local.day} ${months[local.month - 1]}, '
      '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

/// "18:00", for a row that already says which day it is on.
String timeInZone(DateTime instant, tz.Location zone) {
  final local = tz.TZDateTime.from(instant, zone);
  return '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}
