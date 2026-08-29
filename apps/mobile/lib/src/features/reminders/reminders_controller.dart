import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';

class RemindersState {
  const RemindersState({
    this.items = const [],
    this.loading = false,
    this.busy = false,
    this.error,
  });

  final List<Reminder> items;

  /// The list is being fetched.
  final bool loading;

  /// A create or cancel is in flight.
  final bool busy;

  final String? error;

  RemindersState copyWith({
    List<Reminder>? items,
    bool? loading,
    bool? busy,
    String? error,
    bool clearError = false,
  }) =>
      RemindersState(
        items: items ?? this.items,
        loading: loading ?? this.loading,
        busy: busy ?? this.busy,
        error: clearError ? null : (error ?? this.error),
      );
}

/// autoDispose for the same reason ChatController uses it: the list must not
/// survive into the next account signed in on this device.
class RemindersController extends AutoDisposeNotifier<RemindersState> {
  /// Riverpod 2's Notifier has no `mounted`, and touching `state` after
  /// disposal throws -- logging out mid-request is exactly that race.
  bool _disposed = false;

  @override
  RemindersState build() {
    ref.onDispose(() => _disposed = true);
    Future.microtask(load);
    return const RemindersState(loading: true);
  }

  ApiClient get _api => ref.read(apiClientProvider);

  bool _update(RemindersState Function(RemindersState current) transform) {
    if (_disposed) return false;
    state = transform(state);
    return true;
  }

  Future<void> load() async {
    if (!_update((s) => s.copyWith(loading: true, clearError: true))) return;
    try {
      final items = await _api.reminders();
      _update((s) => s.copyWith(items: sortReminders(items), loading: false));
    } on ApiException catch (e) {
      _update((s) => s.copyWith(loading: false, error: e.message));
    }
  }

  /// Returns true if the reminder was created. The response is merged straight
  /// into the list -- it is the full object, so a refetch would buy nothing.
  Future<bool> create(String title, DateTime remindAt) async {
    final trimmed = title.trim();
    if (trimmed.isEmpty || !remindAt.isAfter(DateTime.now())) return false;
    if (!_update((s) => s.copyWith(busy: true, clearError: true))) return false;
    try {
      final created =
          await _api.createReminder(title: trimmed, remindAt: remindAt);
      _update((s) => s.copyWith(
            items: sortReminders([...s.items, created]),
            busy: false,
          ));
      return true;
    } on ApiException catch (e) {
      _update((s) => s.copyWith(busy: false, error: e.message));
      return false;
    }
  }

  Future<void> cancel(String id) async {
    if (!_update((s) => s.copyWith(busy: true, clearError: true))) return;
    try {
      final updated = await _api.cancelReminder(id);
      _update((s) => s.copyWith(
            items: sortReminders(
                [for (final r in s.items) r.id == id ? updated : r]),
            busy: false,
          ));
    } on ApiException catch (e) {
      // 404 means gone or never ours -- the gateway refuses to distinguish so
      // ids cannot be probed. Drop the stale row either way.
      if (e.statusCode == 404) {
        _update((s) => s.copyWith(
              items: [for (final r in s.items) if (r.id != id) r],
              busy: false,
              error: 'That reminder no longer exists.',
            ));
      } else {
        _update((s) => s.copyWith(busy: false, error: e.message));
      }
    }
  }

  void clearError() => _update((s) => s.copyWith(clearError: true));
}

final remindersControllerProvider =
    NotifierProvider.autoDispose<RemindersController, RemindersState>(
        RemindersController.new);
