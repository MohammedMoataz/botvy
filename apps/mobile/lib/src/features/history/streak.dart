/// Adherence maths, over the check-ins already on the device.
///
/// A transcription of the gateway's own rules (`coaching/adherence.ts`) rather
/// than a mirror of the number it computes: the server's answer would be stale
/// the moment a check-in is answered offline, on the very screen whose point is
/// today. Keep this a literal copy of that logic — the two are tested against
/// the same cases.
library;

/// One answered day, keyed by its local calendar date (YYYY-MM-DD).
typedef CheckinDay = ({String date, bool adhered});

String _previousDate(String date) {
  final parsed = DateTime.parse('${date}T00:00:00Z').subtract(const Duration(days: 1));
  return parsed.toIso8601String().substring(0, 10);
}

/// Consecutive adhered days ending today, or at yesterday when today has not
/// been answered yet — an unanswered day is not a broken streak, it is a day
/// still in progress. A day answered "no" ends it.
int currentStreak(List<CheckinDay> checkins, String today) {
  final byDate = {for (final c in checkins) c.date: c.adhered};

  var cursor = byDate.containsKey(today) ? today : _previousDate(today);
  var streak = 0;
  while (byDate[cursor] == true) {
    streak += 1;
    cursor = _previousDate(cursor);
  }
  return streak;
}

/// The share of the *answered* days in the last [days] that were adhered to.
///
/// Unanswered days are not misses — they are out of the denominator, which is
/// why a user who answers twice and adheres twice reads as 100%, not 29%.
/// Zero rather than NaN when nothing in the window was answered.
double completionRatio(List<CheckinDay> checkins, String today, {int days = 7}) {
  final answered = _inWindow(checkins, today, days);
  if (answered.isEmpty) return 0;
  return answered.where((c) => c.adhered).length / answered.length;
}

/// How many of the last [days] were answered at all — the denominator behind
/// [completionRatio], which the screen shows so a ratio off one answer is not
/// read as a whole good week.
int answeredCount(List<CheckinDay> checkins, String today, {int days = 7}) =>
    _inWindow(checkins, today, days).length;

List<CheckinDay> _inWindow(List<CheckinDay> checkins, String today, int days) {
  final window = <String>{};
  var cursor = today;
  for (var i = 0; i < days; i++) {
    window.add(cursor);
    cursor = _previousDate(cursor);
  }
  return checkins.where((c) => window.contains(c.date)).toList();
}

/// The device's own calendar date, which is what the user is looking at.
String todayLocal([DateTime? now]) {
  final d = now ?? DateTime.now();
  return '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}
