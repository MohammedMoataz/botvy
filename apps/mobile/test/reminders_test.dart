import 'package:botvy/src/api/models.dart';
import 'package:flutter_test/flutter_test.dart';

/// One row exactly as GET /reminders returns it. Note the two-element
/// `notifications` list: a reminder created with `['1h','0m']` whose hour has
/// already passed comes back with fewer, which is correct, not a failure.
const _row = {
  'id': 'r1',
  'userId': 'u1',
  'title': 'Call the dentist',
  'remindAt': '2026-09-01T14:30:00.000Z',
  'status': 'active',
  'createdAt': '2026-08-30T08:00:00.000Z',
  'notifications': [
    {
      'id': 'n1',
      'reminderId': 'r1',
      'notifyAt': '2026-09-01T13:30:00.000Z',
      'label': '1h',
      'sentAt': null,
    },
    {
      'id': 'n2',
      'reminderId': 'r1',
      'notifyAt': '2026-09-01T14:30:00.000Z',
      'label': 'now',
      'sentAt': '2026-09-01T14:30:02.000Z',
    },
  ],
};

String _pad(int n) => n.toString().padLeft(2, '0');

Reminder _at(String id, DateTime remindAt, {String status = 'active'}) =>
    Reminder(id: id, title: id, remindAt: remindAt, status: status);

void main() {
  group('Reminder.fromJson', () {
    final reminder = Reminder.fromJson(Map<String, dynamic>.from(_row));

    test('parses the wire shape and converts UTC to local', () {
      expect(reminder.id, 'r1');
      expect(reminder.title, 'Call the dentist');
      expect(reminder.status, 'active');
      expect(reminder.isActive, isTrue);
      // Same instant, expressed locally -- whatever zone the test host is in.
      expect(reminder.remindAt.isUtc, isFalse);
      expect(reminder.remindAt.toUtc(), DateTime.utc(2026, 9, 1, 14, 30));
      expect(reminder.createdAt!.toUtc(), DateTime.utc(2026, 8, 30, 8));
    });

    test('parses notifications, including the nullable sentAt', () {
      expect(reminder.notifications.map((n) => n.label).toList(),
          ['1h', 'now']);
      expect(reminder.notifications.first.sentAt, isNull);
      expect(reminder.notifications.first.sent, isFalse);
      expect(reminder.notifications.last.sent, isTrue);
      expect(reminder.notifications.last.notifyAt.toUtc(),
          DateTime.utc(2026, 9, 1, 14, 30));
    });

    test('a shorter notification list is not an error', () {
      final trimmed = Map<String, dynamic>.from(_row)
        ..['notifications'] = [(_row['notifications'] as List).last];
      expect(Reminder.fromJson(trimmed).notifications.single.label, 'now');
    });

    test('tolerates a missing notifications key', () {
      final bare = Map<String, dynamic>.from(_row)..remove('notifications');
      expect(Reminder.fromJson(bare).notifications, isEmpty);
    });
  });

  group('what a reminder is now', () {
    final now = DateTime(2026, 9, 1, 12);

    test('one whose moment has passed is overdue, not merely active', () {
      // The state nobody writes: it arrives because the clock moved. Storing it
      // would need a job to do the writing, and the job would be the bug.
      final past = _at('r1', now.subtract(const Duration(hours: 1)));
      expect(past.state(now), ReminderState.overdue);
      expect(past.status, 'active'); // the stored value is untouched
    });

    test('one still ahead is upcoming', () {
      expect(_at('r1', now.add(const Duration(hours: 1))).state(now),
          ReminderState.upcoming);
    });

    test('a finished one keeps saying which way it finished', () {
      // The distinction deleting used to destroy: it stamped 'cancelled' over
      // everything, so a completed reminder came back from the dead as an
      // abandoned one.
      final done = _at('r1', now.subtract(const Duration(days: 1)), status: 'done');
      final cancelled =
          _at('r2', now.subtract(const Duration(days: 1)), status: 'cancelled');

      expect(done.state(now), ReminderState.completed);
      expect(cancelled.state(now), ReminderState.cancelled);
    });

    test('a finished reminder is never reported as overdue', () {
      final done = _at('r1', now.subtract(const Duration(days: 9)), status: 'done');
      expect(done.state(now), isNot(ReminderState.overdue));
    });

    test('every state has something to show the user', () {
      for (final state in ReminderState.values) {
        expect(state.label, isNotEmpty);
      }
    });
  });

  group('formatRemindAt', () {
    // DateTime(...) is always local, so these read the same in every zone.
    final now = DateTime(2026, 9, 1, 9, 0);

    test('names today, tomorrow and yesterday', () {
      expect(formatRemindAt(DateTime(2026, 9, 1, 14, 30), now: now),
          'Today 14:30');
      expect(formatRemindAt(DateTime(2026, 9, 2, 9, 5), now: now),
          'Tomorrow 09:05');
      expect(formatRemindAt(DateTime(2026, 8, 31, 23, 0), now: now),
          'Yesterday 23:00');
    });

    test('falls back to a dated form, with the year only when it differs', () {
      // 2026-10-03 is a Saturday.
      expect(formatRemindAt(DateTime(2026, 10, 3, 9, 0), now: now),
          'Sat 3 Oct, 09:00');
      // 2027-01-04 is a Monday.
      expect(formatRemindAt(DateTime(2027, 1, 4, 7, 45), now: now),
          'Mon 4 Jan 2027, 07:45');
    });

    test('renders a UTC instant in the host local zone', () {
      final utc = DateTime.utc(2026, 9, 1, 14, 30);
      final local = utc.toLocal();
      expect(formatRemindAt(utc, now: local),
          'Today ${_pad(local.hour)}:${_pad(local.minute)}');
    });

    test('counts calendar days across a DST switch', () {
      // In a zone that springs forward on 2026-03-29 these two local times are
      // 23h apart, which naive day math rounds down to zero.
      expect(formatRemindAt(DateTime(2026, 3, 29, 12), now: DateTime(2026, 3, 28, 12)),
          'Tomorrow 12:00');
    });
  });

  group('sortReminders', () {
    final now = DateTime(2026, 9, 1, 9, 0);

    test('puts the soonest pending first and the rest newest-first after', () {
      final sorted = sortReminders([
        _at('past-active', DateTime(2026, 8, 20, 9)),
        _at('cancelled', DateTime(2026, 9, 5, 9), status: 'cancelled'),
        _at('soon', DateTime(2026, 9, 1, 18)),
        _at('done', DateTime(2026, 8, 31, 9), status: 'done'),
        _at('later', DateTime(2026, 9, 4, 9)),
      ], now: now);

      expect(sorted.map((r) => r.id).toList(),
          ['soon', 'later', 'cancelled', 'done', 'past-active']);
    });

    test('treats a non-active future reminder as past', () {
      final sorted = sortReminders([
        _at('cancelled-future', DateTime(2026, 9, 9, 9), status: 'cancelled'),
        _at('active-future', DateTime(2026, 9, 10, 9)),
      ], now: now);
      expect(sorted.first.id, 'active-future');
    });

    test('is a no-op on an empty list', () {
      expect(sortReminders(const [], now: now), isEmpty);
    });
  });
}
