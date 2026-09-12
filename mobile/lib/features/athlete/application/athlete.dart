import 'dart:convert';

import 'package:timezone/timezone.dart' as tz;

import '../../../core/db/database.dart';

/// The training rules the phone has to know for itself.
///
/// Every one of these is a **port of a server file**, and the pairing is the
/// point rather than an accident of layering: the next-practice card, the week
/// view and Today are all drawn from the phone's own `sessions` table so they
/// work on a plane, which means the phone decides what "next" is and what
/// "missed" is. A divergence between the two implementations is a card that
/// disagrees with the server about the member's own week.
///
/// | here | server |
/// |---|---|
/// | [nextPractice] | `contexts/training/domain/next-practice.ts` |
/// | [isMissed] | `Session.isMissed` in `session.aggregate.ts` |
/// | [setShapeFor] | `setShapeFor` in `set-entry.ts` |
/// | [kKnownSports] | `KNOWN_SPORTS` in `set-entry.ts` |
///
/// ## How the two are kept in step
///
/// `test/athlete_next_practice_test.dart` is a case-for-case port of the
/// `nextPractice` and `Session.isMissed` groups in
/// `backend/src/contexts/training/training-clock.spec.ts`, **with the same
/// test names in the same order**, so the two files diff by eye: a case added
/// on one side and not the other shows up as a missing line rather than as a
/// silent difference in behaviour. That is the whole mechanism, and it is
/// deliberately not "generate one from the other" — the two languages'
/// fixtures do not share a shape, and a generator would be a third thing to
/// keep in step.

/// The seven sports the picker offers (FR-001).
///
/// Plus the member's own word, which is why every reader of this treats it as a
/// list of *suggestions* rather than a validation rule: "other" in the picker
/// is a text field and not a bucket, so a member whose sport is padel stores
/// `padel` and sees `padel`. Storing the literal `other` would lose the one
/// thing they told us.
const List<String> kKnownSports = [
  'gym',
  'football',
  'crossfit',
  'calisthenics',
  'swimming',
  'running',
  'cycling',
];

/// Which pair of fields a sport's set editor shows.
///
/// A *hint* and deliberately not a constraint, exactly as on the server:
/// nothing refuses a set carrying the other pair, because a member who does
/// weighted carries for distance or times their squats is not wrong — and a
/// rule here would be this file deciding what their sport is from a list
/// somebody wrote down one afternoon.
enum SetShape {
  /// Repetitions and weight — gym, calisthenics, crossfit.
  reps,

  /// Distance and duration — swimming, running, cycling.
  distance,

  /// Duration alone — a game.
  duration,
}

/// Port of `setShapeFor`. Anything unrecognised falls to [SetShape.reps],
/// because a member who typed their own sport is most likely counting
/// something.
SetShape setShapeFor(String sport) => switch (sport) {
  'swimming' || 'running' || 'cycling' => SetShape.distance,
  'football' => SetShape.duration,
  _ => SetShape.reps,
};

/// One set, in every sport this product knows about.
///
/// One shape with optional fields and not one per sport — the server's
/// `SetEntry` has the long version of why, and the short one is that a member
/// who lifts *and* swims gets one history rather than two that cannot be read
/// together.
///
/// `target*` is what the session asked for and `actual*` is what happened;
/// neither overwrites the other, so a logged session shows what was done beside
/// what was planned (FR-004). [done] is separate from having an actual value on
/// purpose: a member can tick three sets off without typing numbers, and a set
/// with a weight typed and not ticked is one they are part way through.
class TrainingSet {
  const TrainingSet({
    this.targetReps,
    this.targetWeightKg,
    this.targetDurationSec,
    this.targetDistanceM,
    this.actualReps,
    this.actualWeightKg,
    this.actualDurationSec,
    this.actualDistanceM,
    this.done = false,
  });

  factory TrainingSet.fromJson(Map<String, dynamic> json) => TrainingSet(
    targetReps: _asInt(json['targetReps']),
    targetWeightKg: _asDouble(json['targetWeightKg']),
    targetDurationSec: _asInt(json['targetDurationSec']),
    targetDistanceM: _asInt(json['targetDistanceM']),
    actualReps: _asInt(json['actualReps']),
    actualWeightKg: _asDouble(json['actualWeightKg']),
    actualDurationSec: _asInt(json['actualDurationSec']),
    actualDistanceM: _asInt(json['actualDistanceM']),
    done: json['done'] == true,
  );

  final int? targetReps;
  final double? targetWeightKg;
  final int? targetDurationSec;
  final int? targetDistanceM;

  final int? actualReps;
  final double? actualWeightKg;
  final int? actualDurationSec;
  final int? actualDistanceM;

  final bool done;

  /// True when this set carries anything the member actually did.
  ///
  /// Reads the `actual*` fields and [done], never the targets — a session full
  /// of targets and no actuals is a *plan*, and replacing a plan is what
  /// applying a program is for.
  bool get isLogged =>
      done ||
      actualReps != null ||
      actualWeightKg != null ||
      actualDurationSec != null ||
      actualDistanceM != null;

  Map<String, dynamic> toJson() => {
    'targetReps': targetReps,
    'targetWeightKg': targetWeightKg,
    'targetDurationSec': targetDurationSec,
    'targetDistanceM': targetDistanceM,
    'actualReps': actualReps,
    'actualWeightKg': actualWeightKg,
    'actualDurationSec': actualDurationSec,
    'actualDistanceM': actualDistanceM,
    'done': done,
  };

  /// A copy with fields replaced.
  ///
  /// Every nullable field takes a `clear` flag rather than being cleared by a
  /// null argument, because null is what "leave it alone" has to mean for the
  /// eight of them — and a member wiping the weight off one set is a real
  /// action the editor performs.
  TrainingSet copyWith({
    int? targetReps,
    double? targetWeightKg,
    int? targetDurationSec,
    int? targetDistanceM,
    int? actualReps,
    double? actualWeightKg,
    int? actualDurationSec,
    int? actualDistanceM,
    bool? done,
    bool clearActuals = false,
  }) => TrainingSet(
    targetReps: targetReps ?? this.targetReps,
    targetWeightKg: targetWeightKg ?? this.targetWeightKg,
    targetDurationSec: targetDurationSec ?? this.targetDurationSec,
    targetDistanceM: targetDistanceM ?? this.targetDistanceM,
    actualReps: clearActuals ? null : (actualReps ?? this.actualReps),
    actualWeightKg: clearActuals ? null : (actualWeightKg ?? this.actualWeightKg),
    actualDurationSec:
        clearActuals ? null : (actualDurationSec ?? this.actualDurationSec),
    actualDistanceM:
        clearActuals ? null : (actualDistanceM ?? this.actualDistanceM),
    done: clearActuals ? false : (done ?? this.done),
  );
}

/// One exercise within a session or a workout, with its sets in order.
///
/// [id] exists because the editor reorders exercises and a member logging a set
/// has to say *which* one — an array index is not a name, and reordering while
/// a set is being typed would move the numbers under their fingers.
class TrainingExercise {
  const TrainingExercise({
    required this.id,
    required this.name,
    this.notes,
    this.sets = const [],
    this.mediaRefs = const [],
  });

  factory TrainingExercise.fromJson(Map<String, dynamic> json) =>
      TrainingExercise(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        notes: json['notes'] as String?,
        sets: [
          for (final raw in (json['sets'] as List? ?? const []).whereType<Map>())
            TrainingSet.fromJson(Map<String, dynamic>.from(raw)),
        ],
        // Carried and never fetched in this phase (spec Assumptions): an
        // exercise may refer to a picture or a clip and nothing loads it.
        // Kept as the raw list so a phase that starts drawing them needs no
        // migration and no re-pull.
        mediaRefs: [
          for (final raw
              in (json['mediaRefs'] as List? ?? const []).whereType<Map>())
            Map<String, dynamic>.from(raw),
        ],
      );

  final String id;
  final String name;
  final String? notes;
  final List<TrainingSet> sets;
  final List<Map<String, dynamic>> mediaRefs;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'notes': notes,
    'sets': [for (final set in sets) set.toJson()],
    'mediaRefs': mediaRefs,
  };

  TrainingExercise copyWith({
    String? name,
    String? notes,
    List<TrainingSet>? sets,
    bool clearNotes = false,
  }) => TrainingExercise(
    id: id,
    name: name ?? this.name,
    notes: clearNotes ? null : (notes ?? this.notes),
    sets: sets ?? this.sets,
    mediaRefs: mediaRefs,
  );
}

/// One weekly training slot: a day, a wall-clock time, a length, a sport.
///
/// Named `WeeklySlot` rather than `TrainingSlot` because
/// `features/rhythm/application/daily_plan.dart` already owns that name for a
/// different thing — the training *line on a plan snapshot*, which is a title
/// and a moment. Two classes one word apart, meaning "the timetable entry" and
/// "what the evening proposal said about tomorrow", is exactly the pair a
/// reader would mix up.
///
/// [start] is `HH:mm` in the member's own zone and **never an instant**, which
/// is principle XI applied to a timetable: "gym at 18:00 on Mondays" is a
/// statement about the member's clock, so a member who flies to Berlin still
/// trains at 18:00. [weekday] is 1 (Monday) to 7 (Sunday), matching ISO 8601
/// and Dart's own `DateTime.weekday` rather than JavaScript's 0-is-Sunday.
class WeeklySlot {
  const WeeklySlot({
    required this.id,
    required this.weekday,
    required this.start,
    required this.durationMin,
    required this.sport,
    this.location,
  });

  factory WeeklySlot.fromJson(Map<String, dynamic> json) => WeeklySlot(
    id: json['id'] as String? ?? '',
    weekday: _asInt(json['weekday']) ?? DateTime.monday,
    start: json['start'] as String? ?? '18:00',
    durationMin: _asInt(json['durationMin']) ?? 60,
    sport: json['sport'] as String? ?? '',
    location: json['location'] as String?,
  );

  final String id;
  final int weekday;
  final String start;
  final int durationMin;
  final String sport;
  final String? location;

  Map<String, dynamic> toJson() => {
    'id': id,
    'weekday': weekday,
    'start': start,
    'durationMin': durationMin,
    'sport': sport,
    'location': location,
  };

  WeeklySlot copyWith({
    int? weekday,
    String? start,
    int? durationMin,
    String? sport,
    String? location,
    bool clearLocation = false,
  }) => WeeklySlot(
    id: id,
    weekday: weekday ?? this.weekday,
    start: start ?? this.start,
    durationMin: durationMin ?? this.durationMin,
    sport: sport ?? this.sport,
    location: clearLocation ? null : (location ?? this.location),
  );
}

/// Why the card is showing what it is showing (story 2's three scenarios).
///
/// Returned rather than left to the screen to work out, because the three
/// sentences are different — "here is today's", "today is done, here is the
/// next one", "you have nothing scheduled" — and a screen guessing from a null
/// gets the third when it means the second.
///
/// [afterCutoff] is named for the case that motivated it and covers one more:
/// it means **"this is a future session"**, which is also the honest answer for
/// a member whose today holds nothing while Friday does. The server fixes three
/// reasons for exactly that reason — a fourth code would have to be handled by
/// every client to say the same sentence.
enum NextPracticeReason { today, afterCutoff, noneScheduled }

/// The session to show, and why.
class NextPractice {
  const NextPractice(this.session, this.reason);

  final LocalSession? session;
  final NextPracticeReason reason;
}

/// The default cut-off, used only when the preferences mirror is empty.
///
/// Not a hard-coded default: `defaults.nextPracticeCutoff` is a registry key
/// and the member's own value lives in `user_preferences`, which is what
/// [AthleteState.cutoff] reads. This is the value for a member who has just
/// signed in on a plane and has no mirror yet, and it is the same string the
/// registry seeds — a card that drew nothing until the first sync would be
/// worse.
const String kDefaultCutoff = '21:00';

/// The session to show, and why (FR-006). Port of the server's `nextPractice`.
///
/// ## The rule
///
/// Before the member's cut-off hour, today's session — **whatever its status**.
/// After it, the first `planned` session strictly after today ends.
///
/// Story 2 scenario 1 is why status is ignored before the cut-off: a session
/// trained this morning is what the member wants to see at noon, not
/// tomorrow's, and filtering to `planned` would make the card jump forward the
/// moment they ticked it off. After the cut-off the question has changed from
/// "what is my day" to "what is next", and a cancelled or skipped future
/// session is not next — the member has already said it is not happening.
///
/// ## The edge case the cut-off makes tempting to get wrong
///
/// The spec's last edge case: the cut-off falls before a session that is still
/// to happen today. A member with a 21:00 cut-off and a 22:00 session, opening
/// the card at 21:30, must be shown **tonight's**. So the first branch is taken
/// when the clock is before the cut-off **or** today holds a session that has
/// not finished, and the reason is still [NextPracticeReason.today] — one
/// condition rather than a special case. The cut-off exists to stop an evening
/// being spent looking at a session already done, not to hide one not yet done.
///
/// [todays] is every session on the member's local today, [upcoming] every
/// session after today ends. Both are handed in rather than queried here so
/// this function is a rule and nothing else, which is what lets the test drive
/// it with fourteen days of fixtures and no database.
NextPractice nextPractice(
  List<LocalSession> todays,
  List<LocalSession> upcoming,
  DateTime now,
  tz.Location zone,
  String cutoff,
) {
  final today = _pickToday(todays);
  final stillToCome = todays.any(
    (session) =>
        session.status == 'planned' &&
        !session.plannedAt
            .add(Duration(minutes: session.durationMin))
            .isBefore(now),
  );

  final beforeCutoff = localHhMm(now, zone).compareTo(cutoff) < 0;

  if ((beforeCutoff || stillToCome) && today != null) {
    return NextPractice(today, NextPracticeReason.today);
  }

  final ahead = [
    for (final session in upcoming)
      if (session.status == 'planned' && session.deletedAt == null) session,
  ]..sort((a, b) => a.plannedAt.compareTo(b.plannedAt));

  if (ahead.isNotEmpty) {
    return NextPractice(ahead.first, NextPracticeReason.afterCutoff);
  }

  // Nothing ahead. If today held something we still show it rather than an
  // empty state — a member whose only session was this morning has *had* a
  // training day, and telling them at 22:00 that they have nothing scheduled
  // is true about the future and useless about the day they just had.
  if (today != null) return NextPractice(today, NextPracticeReason.today);

  return const NextPractice(null, NextPracticeReason.noneScheduled);
}

/// Which of today's sessions is *the* one, when a member trains twice.
///
/// The earliest that has not finished, and otherwise the last that has — which
/// reads as "what is next today", falling back to "what you did today".
/// Ordering by `plannedAt` alone would show the morning's finished session all
/// afternoon while the evening's sat waiting.
LocalSession? _pickToday(List<LocalSession> todays) {
  final live = [
    for (final session in todays)
      if (session.deletedAt == null) session,
  ];
  if (live.isEmpty) return null;

  final byTime = [...live]..sort((a, b) => a.plannedAt.compareTo(b.plannedAt));
  for (final session in byTime) {
    if (session.status == 'planned') return session;
  }
  return byTime.last;
}

/// Whether a session reads as missed (FR-018).
///
/// One line, and the same one line the server's `Session.isMissed` is: a
/// `planned` session whose moment has passed with nothing logged. **Nothing
/// writes it** — there is no column and no status, here or there. Storing it
/// would mean a sweep rewriting rows the member never touched, and then
/// un-writing them the moment they logged the session late; because it is
/// derived, logging late needs no correction first and the reading changes by
/// itself when the status does.
///
/// No zone argument, and that mirrors the server too: this is a comparison of
/// two instants, and the member's zone does not move either of them. The zone
/// matters for deciding which sessions are *today's*, which is
/// [AthleteCubit]'s question and not this one.
bool isMissed(LocalSession session, DateTime now) =>
    session.status == 'planned' &&
    session.deletedAt == null &&
    session.plannedAt
        .add(Duration(minutes: session.durationMin))
        .isBefore(now);

/// The wall clock where the member is, as `HH:mm`.
///
/// A string compared with a string, which is what the server does and is right:
/// `'09:30' < '21:00'` lexicographically for every zero-padded time of day, and
/// the arithmetic versions of the same comparison are the ones that go wrong at
/// the ends of the day.
String localHhMm(DateTime instant, tz.Location zone) {
  final local = tz.TZDateTime.from(instant, zone);
  return '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

/// The exercises on a session or a workout row, decoded.
///
/// Never throws: a session the phone cannot parse draws with no exercises
/// rather than taking the screen down with it, the same rule
/// `decodePlanSnapshot` follows. The server's copy is authoritative and the
/// next pull replaces it.
List<TrainingExercise> decodeExercises(String encoded) {
  if (encoded.isEmpty) return const [];
  try {
    final decoded = jsonDecode(encoded);
    if (decoded is! List) return const [];
    return [
      for (final raw in decoded.whereType<Map>())
        TrainingExercise.fromJson(Map<String, dynamic>.from(raw)),
    ];
  } catch (_) {
    return const [];
  }
}

String encodeExercises(List<TrainingExercise> exercises) =>
    jsonEncode([for (final exercise in exercises) exercise.toJson()]);

/// The member's weekly slots, decoded. Never throws, as [decodeExercises].
List<WeeklySlot> decodeSlots(String encoded) {
  if (encoded.isEmpty) return const [];
  try {
    final decoded = jsonDecode(encoded);
    if (decoded is! List) return const [];
    return [
      for (final raw in decoded.whereType<Map>())
        WeeklySlot.fromJson(Map<String, dynamic>.from(raw)),
    ];
  } catch (_) {
    return const [];
  }
}

String encodeSlots(List<WeeklySlot> slots) =>
    jsonEncode([for (final slot in slots) slot.toJson()]);

int? _asInt(Object? value) => switch (value) {
  final int i => i,
  final double d => d.round(),
  final String s => int.tryParse(s),
  _ => null,
};

double? _asDouble(Object? value) => switch (value) {
  final double d => d,
  final int i => i.toDouble(),
  final String s => double.tryParse(s),
  _ => null,
};
