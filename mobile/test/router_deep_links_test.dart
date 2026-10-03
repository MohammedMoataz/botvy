// Every deep link the gateway or this phone can produce, and the route it
// opens. Pinned before 030 moved five routes into a shell, and unchanged by
// it: notification payloads already in the field carry these strings.
import 'package:botvy/app/router.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const table = <String, String?>{
    'botvy://rhythm/plan/2026-10-02': '/rhythm/plan/2026-10-02',
    '/rhythm/plan/2026-10-02': '/rhythm/plan/2026-10-02',
    'botvy://rhythm/checkin': '/rhythm/checkin',
    '/rhythm/checkin': '/rhythm/checkin',
    'botvy://chat/c1': '/chats/c1',
    '/conversations/c1': '/chats/c1',
    'botvy://chat': '/chats',
    '/conversations': '/chats',
    'botvy://meeting/m1': '/meetings/m1',
    '/meetings/m1': '/meetings/m1',
    'botvy://meetings': '/meetings',
    'botvy://session/s1': '/athlete/session/s1',
    '/sessions/s1': '/athlete/session/s1',
    'botvy://sessions': '/athlete',
    'botvy://knowledge/suggestions': '/knowledge',
    '/links/l1': '/knowledge',
    '/suggestions': '/knowledge',
    'botvy://nutrition': '/nutrition',
    '/meals/today': '/nutrition',
    'botvy://athlete': '/athlete',
    '/training': '/athlete',
    'botvy://programs': '/athlete/programs',
    '/calendar': '/calendar',
    'botvy://tasks/t1': '/tasks',
    '/tasks': '/tasks',
    'botvy://reminders/r1': '/reminders',
    'botvy://unknown/thing': null,
    '/settings': null,
    '': null,
    '   ': null,
  };

  for (final entry in table.entries) {
    test('"${entry.key}" opens ${entry.value ?? 'nothing'}', () {
      expect(routeForDeepLink(entry.key), entry.value);
    });
  }
}
