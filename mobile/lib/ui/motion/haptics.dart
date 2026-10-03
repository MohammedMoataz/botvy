import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../app/appearance/appearance_cubit.dart';

/// A light tap from the phone, when the member has haptics on (Settings →
/// Appearance). Outside an app that provides [AppearanceCubit] — a widget
/// pumped alone in a test — it stays silent.
abstract final class Haptics {
  /// Something done: a task completed.
  static void light(BuildContext context) {
    if (_on(context)) HapticFeedback.lightImpact();
  }

  /// A choice made: a switch flipped, a segment picked.
  static void selection(BuildContext context) {
    if (_on(context)) HapticFeedback.selectionClick();
  }

  static bool _on(BuildContext context) {
    try {
      return BlocProvider.of<AppearanceCubit>(context).state.haptics;
    } on FlutterError {
      // flutter_bloc's answer to "no such provider above this widget".
      return false;
    }
  }
}
