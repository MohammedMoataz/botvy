import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../app_providers.dart';
import '../../db/database.dart';

class CoachingState {
  const CoachingState({this.profile, this.loading = false});

  final CoachingProfile? profile;
  final bool loading;

  /// True while this device holds a change the server has not accepted.
  bool get pending => profile?.pendingSync ?? false;
}

/// The coaching settings, read from and written to the device.
///
/// Every edit is a local write plus a sync nudge — the network is not on this
/// path. The screen used to fetch the profile on open and PATCH on every
/// change, which meant the whole section was unusable without a connection.
class CoachingController extends AutoDisposeNotifier<CoachingState> {
  bool _disposed = false;

  @override
  CoachingState build() {
    ref.onDispose(() => _disposed = true);

    final subscription = ref.read(databaseProvider).watchProfile().listen(_onRow);
    ref.onDispose(subscription.cancel);

    ref.read(syncServiceProvider).kick();
    return const CoachingState(loading: true);
  }

  AppDatabase get _db => ref.read(databaseProvider);

  void _onRow(LocalProfile? row) {
    if (_disposed) return;
    state = CoachingState(profile: row == null ? null : _toProfile(row), loading: false);
  }

  /// Applies one change locally and asks sync to carry it up.
  ///
  /// Only the fields this device owns are ever written here; the server's own
  /// scheduling state arrives by pull and is never sent back.
  Future<void> patch({
    bool? optedIn,
    List<int>? trainingDays,
    List<String>? allergies,
    String? gymTime,
    String? checkinTime,
    String? programTime,
    String? language,
  }) async {
    await _db.writeProfile(CoachingProfilesCompanion(
      optedIn: optedIn == null ? const Value.absent() : Value(optedIn),
      trainingDays:
          trainingDays == null ? const Value.absent() : Value(jsonEncode(trainingDays)),
      allergies: allergies == null ? const Value.absent() : Value(jsonEncode(allergies)),
      gymTime: gymTime == null ? const Value.absent() : Value(gymTime),
      checkinTime: checkinTime == null ? const Value.absent() : Value(checkinTime),
      programTime: programTime == null ? const Value.absent() : Value(programTime),
      language: language == null ? const Value.absent() : Value(language),
      dirty: const Value(true),
      updatedAt: Value(DateTime.now()),
    ));
    ref.read(syncServiceProvider).kick();
  }

  /// Records the handset's zone. Called when the device has travelled: the
  /// gateway resolves "8pm" against this, so it has to follow the phone.
  Future<void> setTimezone(String timezone) async {
    await _db.writeProfile(CoachingProfilesCompanion(
      timezone: Value(timezone),
      dirty: const Value(true),
      updatedAt: Value(DateTime.now()),
    ));
    ref.read(syncServiceProvider).kick();
  }
}

CoachingProfile _toProfile(LocalProfile row) => CoachingProfile(
      optedIn: row.optedIn,
      timezone: row.timezone,
      trainingDays: _decode(row.trainingDays).map((e) => (e as num).toInt()).toList(),
      allergies: _decode(row.allergies).map((e) => '$e').toList(),
      gymTime: row.gymTime,
      checkinTime: row.checkinTime,
      programTime: row.programTime,
      language: row.language,
      awaitingCheckin: row.awaitingCheckin,
      awaitingSince: row.awaitingSince,
      pendingSync: row.dirty,
    );

List<Object?> _decode(String encoded) {
  try {
    return jsonDecode(encoded) as List;
  } catch (_) {
    return const [];
  }
}

final coachingControllerProvider =
    NotifierProvider.autoDispose<CoachingController, CoachingState>(
        CoachingController.new);
