import 'dart:async';

import 'package:alchemist/alchemist.dart';

/// Goldens are alchemist CI goldens only: text renders as blocks, so the
/// images are identical on every OS and font set. Platform goldens (real
/// glyphs) are not committed — they differ between a Windows laptop and the
/// Ubuntu runner.
Future<void> testExecutable(FutureOr<void> Function() testMain) =>
    AlchemistConfig.runWithConfig(
      config: const AlchemistConfig(
        platformGoldensConfig: PlatformGoldensConfig(enabled: false),
      ),
      run: () async => testMain(),
    );
