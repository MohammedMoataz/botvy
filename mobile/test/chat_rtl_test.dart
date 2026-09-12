import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/core/api/socket_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:botvy/features/chat/application/chat_cubit.dart';
import 'package:botvy/features/chat/application/conversations_cubit.dart';
import 'package:botvy/features/chat/data/chat_outbox.dart';
import 'package:botvy/features/chat/presentation/chat_page.dart';
import 'package:botvy/features/chat/presentation/conversations_page.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

/// The chat screens laid out right to left (FR-019).
///
/// Asserted as **geometry** and not as the presence of Arabic text, which is
/// the only version of this test that can fail for the right reason. Every
/// widget here reads correctly in Arabic the moment its strings are translated;
/// what breaks is the layout, and it breaks silently — `Alignment.centerRight`
/// instead of `AlignmentDirectional.centerEnd` puts the member's own bubbles on
/// the same side as Botvy's, and `EdgeInsets.only(left:)` instead of
/// `EdgeInsetsDirectional.only(start:)` indents a heading away from the text it
/// heads. Both compile, both pass every string test, and both look like a
/// translated app rather than a localised one.
///
/// So the four things T452 names are checked by where they actually are on
/// screen: the streaming bubble, the quick-question chips, the structured card
/// and the pinned divider.
///
/// The RTL **screenshots** the phase gate asks for are still outstanding: they
/// need a device or an emulator, and `flutter test` has neither. Not faked
/// here — a widget test is evidence about layout and a screenshot is evidence
/// about type, spacing and the platform's own text shaping, and one is not the
/// other.
void main() {
  late AppDatabase db;
  late SyncEngine engine;
  late OfflineApi api;
  late ChatOutbox outbox;
  late ChatCubit chat;
  late ConversationsCubit conversations;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    engine = offlineEngine(db);
    api = OfflineApi();
    outbox = ChatOutbox(api, db, engine);
    chat = ChatCubit(db, api, SocketClient(api, db), outbox, engine);
    conversations = ConversationsCubit(db, api, engine);
  });

  tearDown(() async {
    await engine.sync();
    await chat.close();
    await conversations.close();
    engine.dispose();
    await db.close();
  });

  /// Wraps a screen in the Arabic locale, which is what turns the direction
  /// right to left: the app never sets `TextDirection` itself — the locale
  /// does, through `flutter_localizations` — so a test that forced a
  /// `Directionality` widget would be testing its own wrapper.
  Widget arabic(Widget child) => MaterialApp(
    locale: const Locale('ar'),
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: MultiBlocProvider(
      providers: [
        BlocProvider<ChatCubit>.value(value: chat),
        BlocProvider<ConversationsCubit>.value(value: conversations),
      ],
      child: child,
    ),
  );

  Future<void> seedConversation(
    String id, {
    String kind = ChatKinds.free,
    bool pinned = false,
    String title = '',
  }) async {
    final now = DateTime.now().toUtc();
    await db.into(db.conversations).insert(
      ConversationsCompanion.insert(
        id: id,
        kind: Value(kind),
        title: Value(title),
        pinned: Value(pinned),
        createdAt: now,
        updatedAt: now,
        baseUpdatedAt: Value(now),
      ),
    );
  }

  testWidgets('the locale really is right to left', (tester) async {
    await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
    await tester.pumpWidget(
      arabic(const ChatPage(conversationId: 'coach-1')),
    );
    await tester.pumpAndSettle();

    expect(
      Directionality.of(tester.element(find.byType(Scaffold).first)),
      TextDirection.rtl,
    );
  });

  testWidgets('the member speaks from the left and Botvy from the right',
      (tester) async {
    // Which is the reverse of the English screen, and the whole point: the
    // member's own words are on the *trailing* edge of the reading direction,
    // wherever that happens to be.
    await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
    for (final row in [(1, 'user', 'كم بروتين أحتاج؟'), (2, 'assistant', '120')]) {
      await db.into(db.messages).insert(
        MessagesCompanion.insert(
          seq: Value(row.$1),
          conversationId: 'coach-1',
          role: row.$2,
          content: row.$3,
          createdAt: DateTime.now().toUtc(),
        ),
      );
    }

    await tester.pumpWidget(
      arabic(const ChatPage(conversationId: 'coach-1')),
    );
    await tester.pumpAndSettle();

    final screen = tester.getSize(find.byType(Scaffold).first).width;
    final mine = tester.getRect(find.text('كم بروتين أحتاج؟'));
    final theirs = tester.getRect(find.text('120'));

    expect(
      mine.left,
      lessThan(screen / 2),
      reason:
          "the member's own bubble must sit on the reading-trailing edge, "
          'which in Arabic is the left of the screen — '
          '`Alignment.centerRight` would put it on the right in both languages',
    );
    expect(theirs.right, greaterThan(screen / 2));
  });

  testWidgets('the streaming bubble, the chips and the card all follow the '
      'direction', (tester) async {
    await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
    await chat.open('coach-1');

    await tester.pumpWidget(
      arabic(const ChatPage(conversationId: 'coach-1')),
    );
    await tester.pumpAndSettle();

    // The three widgets driven by state rather than by the tables, put there
    // directly and **after** the first frame: `ChatPage.initState` re-opens the
    // conversation, which is a fresh state by design, so anything emitted
    // before the widget mounts is wiped by it.
    chat.emit(
      chat.state.copyWith(
        loading: false,
        streaming: 'حوالي ١٢٠ غرامًا من البروتين.',
        quickQuestions: const ['كيف حالي؟', 'ماذا آكل اليوم؟'],
        card: const ChatCard(
          kind: 'tasks',
          items: [
            ChatCardItem(id: 't1', title: 'الاتصال بوالدي'),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    final screen = tester.getSize(find.byType(Scaffold).first).width;

    // The streaming answer is Botvy's, so it starts on the right.
    final streaming = tester.getRect(
      find.textContaining('١٢٠', findRichText: true),
    );
    expect(streaming.right, greaterThan(screen / 2));

    // The chips run from the right: the first one offered is the one nearest
    // the reading start, and a `Row` with `EdgeInsets.only(right:)` would have
    // reversed which chip carries the gap.
    final first = tester.getRect(find.text('كيف حالي؟'));
    final second = tester.getRect(find.text('ماذا آكل اليوم؟'));
    expect(
      first.left,
      greaterThan(second.left),
      reason: 'the first chip must be the rightmost one on an Arabic screen',
    );

    // The card row's tick is on the reading-start side, beside its text.
    final tick = tester.getRect(find.byIcon(Icons.radio_button_unchecked));
    final title = tester.getRect(find.text('الاتصال بوالدي'));
    expect(tick.left, greaterThan(title.left));
  });

  testWidgets('the pinned section heading starts on the right', (tester) async {
    await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
    await seedConversation('free-9', title: 'بيرو');
    await conversations.refresh();

    await tester.pumpWidget(
      arabic(ConversationsPage(onOpen: (_) {})),
    );
    await tester.pumpAndSettle();

    final screen = tester.getSize(find.byType(Scaffold).first).width;

    // "دائمًا هنا" — the pinned heading, indented from the right rather than
    // from the left. A hard `EdgeInsets.only(left: 16)` would leave it flush
    // against the right edge and inset from the wrong side.
    final heading = tester.getRect(find.text('دائمًا هنا'));
    expect(heading.right, lessThan(screen - 8));
    expect(heading.right, greaterThan(screen / 2));

    // And the divider that makes it a section rather than the top of one list
    // is actually drawn.
    expect(find.byType(Divider), findsOneWidget);
    expect(find.text('محادثاتك الأخرى'), findsOneWidget);
  });
}
