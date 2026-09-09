import 'dart:convert';

import 'package:drift/drift.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';

/// The local copy of the member's profile and preferences.
///
/// A *mirror*, not a source. The server owns both records; this holds whatever
/// the last fetch produced so the screens render offline and open instantly.
/// P2's sync loop takes over the filling; until then [fill] is called on
/// sign-in and after every write.
///
/// Writes go to the server first and the mirror second, with the server's own
/// answer. That order matters: the server normalises — it trims the name and
/// lower-cases the tag lists — so writing the local copy from the *request*
/// would leave the phone showing `Peanuts` where the server holds `peanuts`,
/// and the next save would then look like a change when it is not.
class ProfileMirror {
  ProfileMirror(this._api, this._db);

  final ApiClient _api;
  final AppDatabase _db;

  /// Fetches both records and replaces the local copies.
  ///
  /// Both together, because every screen that wants one wants the other — the
  /// profile page shows a time zone beside the daily times — and two round
  /// trips for one render is two chances to paint a half-loaded form.
  Future<void> fill() async {
    final profile = await _api.profile();
    final preferences = await _api.preferences();
    await writeProfile(profile);
    await writePreferences(preferences);
  }

  Future<void> writeProfile(Map<String, dynamic> json) async {
    final userId = json['userId'] as String;
    await _db
        .into(_db.profiles)
        .insertOnConflictUpdate(
          ProfilesCompanion.insert(
            userId: userId,
            displayName: Value(json['displayName'] as String?),
            photoPath: Value(json['photoPath'] as String?),
            timezone: json['timezone'] as String,
            locale: json['locale'] as String,
            metricsJson: Value(jsonEncode(json['metrics'] ?? const [])),
            // The API *omits* what the member has not filled in rather than
            // sending an empty list, so an absent key is not an error here —
            // it is the difference between "no allergies recorded" and
            // "allergies: none", and the coach prompt depends on it.
            foodLikesJson: Value(jsonEncode(json['foodLikes'] ?? const [])),
            foodDislikesJson: Value(
              jsonEncode(json['foodDislikes'] ?? const []),
            ),
            allergiesJson: Value(jsonEncode(json['allergies'] ?? const [])),
            symptomsJson: Value(jsonEncode(json['symptoms'] ?? const [])),
            onboardingCompletedAt: Value(
              _parseDate(json['onboardingCompletedAt']),
            ),
            fetchedAt: DateTime.now().toUtc(),
          ),
        );
  }

  Future<void> writePreferences(Map<String, dynamic> json) async {
    final quiet = Map<String, dynamic>.from(
      json['quietHours'] as Map? ?? const {},
    );
    await _db
        .into(_db.userPreferences)
        .insertOnConflictUpdate(
          UserPreferencesCompanion.insert(
            userId: json['userId'] as String,
            planTomorrowTime: json['planTomorrowTime'] as String,
            endOfDayTime: json['endOfDayTime'] as String,
            morningBriefingTime: json['morningBriefingTime'] as String,
            nextPracticeCutoff: json['nextPracticeCutoff'] as String,
            leadTimesJson: Value(jsonEncode(json['leadTimes'] ?? const [])),
            quietFrom: quiet['from'] as String? ?? '22:00',
            quietTo: quiet['to'] as String? ?? '07:00',
            weekStartsOn: json['weekStartsOn'] as String,
            checkinEnabled: json['checkinEnabled'] as bool,
            meetingDurationMin: json['meetingDurationMin'] as int,
            mealMode: json['mealMode'] as String,
            aiSuggestions: json['aiSuggestions'] as bool,
            fetchedAt: DateTime.now().toUtc(),
          ),
        );
  }

  Future<Profile?> readProfile() =>
      _db.select(_db.profiles).getSingleOrNull();

  Future<UserPreference?> readPreferences() =>
      _db.select(_db.userPreferences).getSingleOrNull();

  /// Server first, mirror second, with the server's answer.
  Future<Profile?> patchProfile(Map<String, dynamic> patch) async {
    await writeProfile(await _api.patchProfile(patch));
    return readProfile();
  }

  Future<Profile?> recordMetric(Map<String, dynamic> metric) async {
    await writeProfile(await _api.recordMetric(metric));
    return readProfile();
  }

  Future<UserPreference?> patchPreferences(Map<String, dynamic> patch) async {
    await writePreferences(await _api.patchPreferences(patch));
    return readPreferences();
  }

  /// Dropped on sign-out. The next member on this handset must not open the app
  /// to the last one's name, allergies and daily times.
  Future<void> clear() async {
    await _db.delete(_db.profiles).go();
    await _db.delete(_db.userPreferences).go();
  }

  static DateTime? _parseDate(Object? value) =>
      value is String ? DateTime.tryParse(value) : null;
}

/// The four JSON lists, decoded.
///
/// Extension methods rather than columns, because the lists are stored whole:
/// they are read together, never queried across rows, and the server caps
/// them. Decoding at the read is cheaper than four join tables.
extension ProfileLists on Profile {
  List<String> get foodLikes => _decodeStrings(foodLikesJson);
  List<String> get foodDislikes => _decodeStrings(foodDislikesJson);
  List<String> get allergies => _decodeStrings(allergiesJson);
  List<String> get symptoms => _decodeStrings(symptomsJson);

  List<Map<String, dynamic>> get metrics {
    final decoded = jsonDecode(metricsJson);
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
  }

  /// The most recent weight, height and derived BMI.
  ///
  /// Derived here as well as on the server, and that is deliberate rather than
  /// duplication: the phone shows this offline, when there is no server to ask.
  /// The formula is the definition of BMI, not a business rule that could drift.
  double? get bmi {
    final weight = _latest('weightKg');
    final height = _latest('heightCm');
    if (weight == null || height == null || height <= 0) return null;
    final metres = height / 100;
    return double.parse((weight / (metres * metres)).toStringAsFixed(1));
  }

  double? get latestWeightKg => _latest('weightKg');
  double? get latestHeightCm => _latest('heightCm');

  double? _latest(String field) {
    for (final row in metrics.reversed) {
      final value = row[field];
      if (value is num) return value.toDouble();
    }
    return null;
  }
}

extension PreferenceLists on UserPreference {
  List<String> get leadTimes => _decodeStrings(leadTimesJson);
}

List<String> _decodeStrings(String json) {
  final decoded = jsonDecode(json);
  return decoded is List ? decoded.whereType<String>().toList() : const [];
}
