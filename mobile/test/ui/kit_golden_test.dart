import 'package:alchemist/alchemist.dart';
import 'package:botvy/app/tokens.dart';
import 'package:botvy/ui/scroll_aware_fab.dart';
import 'package:botvy/ui/section.dart';
import 'package:botvy/ui/settings_tiles.dart';
import 'package:botvy/ui/states.dart';
import 'package:botvy/ui/status_chip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'golden_matrix.dart';

void main() {
  goldenTest(
    'section with every tile',
    fileName: 'section',
    builder: () => goldenMatrix(
      builder: () => Section(
        title: 'Appearance',
        children: [
          NavTile(
            icon: Icons.person_outline,
            title: 'Profile',
            subtitle: 'Name, photo',
            onTap: () {},
          ),
          SwitchTile(
            icon: Icons.vibration,
            title: 'Haptics',
            value: true,
            onChanged: (_) {},
          ),
          ChoiceTile<String>(
            icon: Icons.language,
            title: 'Language',
            value: 'en',
            options: const {'en': 'English', 'ar': 'العربية'},
            onChanged: (_) {},
          ),
          DangerTile(icon: Icons.logout, title: 'Sign out', onTap: () {}),
        ],
      ),
    ),
  );

  goldenTest(
    'empty, error and loading states',
    fileName: 'states',
    builder: () => goldenMatrix(
      builder: () => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          EmptyState(
            icon: Icons.checklist,
            message: 'No tasks yet',
            actionLabel: 'New task',
            onAction: () {},
          ),
          ErrorState(message: 'Could not load', onRetry: () {}),
        ],
      ),
    ),
  );

  goldenTest(
    'status chips',
    fileName: 'status_chip',
    builder: () => goldenMatrix(
      builder: () => const Padding(
        padding: EdgeInsetsDirectional.all(BotvySpace.lg),
        child: Wrap(
          spacing: BotvySpace.sm,
          children: [
            StatusChip(status: BotvyStatus.up, label: 'Up'),
            StatusChip(status: BotvyStatus.down, label: 'Down'),
            StatusChip(status: BotvyStatus.unknown, label: 'Unknown'),
          ],
        ),
      ),
    ),
  );

  goldenTest(
    'a card under the theme',
    fileName: 'card',
    builder: () => goldenMatrix(
      builder: () => const Padding(
        padding: EdgeInsetsDirectional.all(BotvySpace.lg),
        child: Card.filled(
          margin: EdgeInsetsDirectional.zero,
          child: ListTile(
            leading: Icon(Icons.event),
            title: Text('Stand-up'),
            subtitle: Text('09:30'),
          ),
        ),
      ),
    ),
  );

  goldenTest(
    'the FAB under the theme',
    fileName: 'fab',
    builder: () => goldenMatrix(
      builder: () => Padding(
        padding: const EdgeInsetsDirectional.all(BotvySpace.lg),
        child: Align(
          alignment: AlignmentDirectional.centerEnd,
          child: ScrollAwareFab(
            icon: Icons.add_task,
            label: 'New task',
            tooltip: 'New task',
            onPressed: () {},
          ),
        ),
      ),
    ),
  );

  testWidgets('loading is one centred indicator', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoadingView()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
