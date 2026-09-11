// `widgets.dart` re-exports `foundation.dart`, which is where
// `@visibleForTesting` comes from — importing both is what the analyzer calls
// an unnecessary import, and it was failing `flutter analyze` on exit code
// while reading as a harmless info line in the output.
import 'package:flutter/widgets.dart';

import '../../core/i18n/counted.dart';

/// English and Arabic, by hand.
///
/// `flutter gen-l10n` would put the same map behind a build step and a
/// generated file that has to exist before `flutter analyze` will pass. Two
/// locales and a dozen strings do not pay for that; the day the catalogue is
/// translated by someone who is not editing Dart, swap this for .arb files.
class AppLocalizations {
  const AppLocalizations(this.locale);

  final Locale locale;

  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('ar'),
  ];

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  static AppLocalizations of(BuildContext context) =>
      Localizations.of<AppLocalizations>(context, AppLocalizations) ??
      const AppLocalizations(Locale('en'));

  /// The whole reason the locale is carried around: Arabic reads right to
  /// left, and every layout in the app has to follow it rather than assume.
  TextDirection get textDirection =>
      locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr;

  String _t(String key) =>
      _strings[locale.languageCode]?[key] ?? _strings['en']![key] ?? key;

  /// Which agreement rule a counted noun follows. See `core/i18n/counted.dart`.
  bool get _isArabic => locale.languageCode == 'ar';

  /// A string with values substituted for `{name}` placeholders.
  ///
  /// Substitution rather than concatenation, because the pieces do not come in
  /// the same order in both languages - and a sentence assembled by `+` reads
  /// backwards in one of them.
  String _f(String key, Map<String, String> values) {
    var out = _t(key);
    for (final entry in values.entries) {
      out = out.replaceAll('{${entry.key}}', entry.value);
    }
    return out;
  }

  String get appTitle => _t('appTitle');
  String get signInTitle => _t('signInTitle');
  String get email => _t('email');
  String get password => _t('password');
  String get signInAction => _t('signInAction');
  String get serverUrl => _t('serverUrl');
  String get emailRequired => _t('emailRequired');
  String get passwordRequired => _t('passwordRequired');

  // -- auth ------------------------------------------------------------------
  String get registerTitle => _t('registerTitle');
  String get registerAction => _t('registerAction');
  String get haveAccount => _t('haveAccount');
  String get needAccount => _t('needAccount');
  String get displayName => _t('displayName');
  String get confirmPassword => _t('confirmPassword');
  String get passwordsDoNotMatch => _t('passwordsDoNotMatch');
  String get passwordTooShort => _t('passwordTooShort');
  String get invalidCredentials => _t('invalidCredentials');
  String get registrationClosed => _t('registrationClosed');
  String get emailTaken => _t('emailTaken');
  String get offline => _t('offline');
  String get somethingWentWrong => _t('somethingWentWrong');
  String get signOut => _t('signOut');
  String get changeYourPassword => _t('changeYourPassword');

  // -- profile ---------------------------------------------------------------
  String get profileTitle => _t('profileTitle');
  String get timezone => _t('timezone');
  String get language => _t('language');
  String get bodyMetrics => _t('bodyMetrics');
  String get addMetric => _t('addMetric');
  String get weightKg => _t('weightKg');
  String get heightCm => _t('heightCm');
  String get bodyFatPct => _t('bodyFatPct');
  String get bmi => _t('bmi');
  String get noMetricsYet => _t('noMetricsYet');
  String get needOneMeasurement => _t('needOneMeasurement');
  String get foodLikes => _t('foodLikes');
  String get foodDislikes => _t('foodDislikes');
  String get allergies => _t('allergies');
  String get allergiesHelp => _t('allergiesHelp');
  String get symptoms => _t('symptoms');
  String get addTagHint => _t('addTagHint');
  String get save => _t('save');
  String get saved => _t('saved');

  // -- preferences -----------------------------------------------------------
  String get preferencesTitle => _t('preferencesTitle');
  String get dailyTimes => _t('dailyTimes');
  String get planTomorrowTime => _t('planTomorrowTime');
  String get endOfDayTime => _t('endOfDayTime');
  String get morningBriefingTime => _t('morningBriefingTime');
  String get nextPracticeCutoff => _t('nextPracticeCutoff');
  String get quietHours => _t('quietHours');
  String get quietFrom => _t('quietFrom');
  String get quietTo => _t('quietTo');
  String get quietHoursHelp => _t('quietHoursHelp');
  String get weekStartsOn => _t('weekStartsOn');
  String get monday => _t('monday');
  String get sunday => _t('sunday');
  String get saturday => _t('saturday');
  String get checkinEnabled => _t('checkinEnabled');
  String get meetingDuration => _t('meetingDuration');
  String get mealMode => _t('mealMode');
  String get mealModeLlm => _t('mealModeLlm');
  String get mealModeLibrary => _t('mealModeLibrary');
  String get aiSuggestions => _t('aiSuggestions');
  String get leadTimes => _t('leadTimes');
  String get leadTimesHelp => _t('leadTimesHelp');

  // -- the gateway -----------------------------------------------------------
  String get serverTitle => _t('serverTitle');
  String get serverSettings => _t('serverSettings');
  String get serverExplain => _t('serverExplain');
  String get testConnection => _t('testConnection');
  String get serverSaved => _t('serverSaved');
  String get serverUrlRequired => _t('serverUrlRequired');
  String get serverUrlInvalid => _t('serverUrlInvalid');
  String get serverUrlNeedsScheme => _t('serverUrlNeedsScheme');
  String get serverUrlNoPath => _t('serverUrlNoPath');
  String get serverNotBotvy => _t('serverNotBotvy');
  String get serverUnreachable => _t('serverUnreachable');
  String serverReachable(String version) =>
      _f('serverReachable', {'version': version});
  String serverDegraded(String version) =>
      _f('serverDegraded', {'version': version});

  // -- onboarding ------------------------------------------------------------
  String get welcomeTitle => _t('welcomeTitle');
  String get welcomeBody => _t('welcomeBody');
  String get onboardingTimezone => _t('onboardingTimezone');
  String get onboardingTimezoneBody => _t('onboardingTimezoneBody');
  String get onboardingTimes => _t('onboardingTimes');
  String get onboardingTimesBody => _t('onboardingTimesBody');
  String get skip => _t('skip');
  String get next => _t('next');
  String get finish => _t('finish');
  String get resumeOnboarding => _t('resumeOnboarding');

  // -- tasks and labels ------------------------------------------------------
  //
  // English only for now: `016` T262 owns the Arabic for tasks and reminders
  // and the RTL screenshots that go with it. `_t` falls back to English for a
  // key Arabic has not got yet, so an untranslated string reads oddly rather
  // than showing a key.
  String get taskToday => _t('taskToday');
  String get taskToDoToday => _t('taskToDoToday');
  String get taskUpcoming => _t('taskUpcoming');
  String get taskOverdue => _t('taskOverdue');
  String get taskCompleted => _t('taskCompleted');
  String get taskCancelled => _t('taskCancelled');
  String get taskOpen => _t('taskOpen');
  String get taskDeleted => _t('taskDeleted');
  String get taskByLabel => _t('taskByLabel');
  String get taskNothingHere => _t('taskNothingHere');
  String get taskNothingToday => _t('taskNothingToday');
  String get taskComplete => _t('taskComplete');
  String get taskCancel => _t('taskCancel');
  String get taskRestore => _t('taskRestore');
  String get taskEraseForGood => _t('taskEraseForGood');
  String get taskRepeats => _t('taskRepeats');
  String get taskNotSyncedYet => _t('taskNotSyncedYet');
  String get taskTitle => _t('taskTitle');
  String get taskNotes => _t('taskNotes');
  String get taskNoDate => _t('taskNoDate');
  String get taskAllDay => _t('taskAllDay');
  String get taskClearDate => _t('taskClearDate');
  String get taskPriority => _t('taskPriority');
  String get taskNoLabel => _t('taskNoLabel');
  String get taskRepeat => _t('taskRepeat');
  String get taskNoRepeat => _t('taskNoRepeat');
  String get taskEstimate => _t('taskEstimate');
  String get taskNoEstimate => _t('taskNoEstimate');
  String get priorityHighest => _t('priorityHighest');
  String get priorityHigh => _t('priorityHigh');
  String get priorityNormal => _t('priorityNormal');
  String get priorityNone => _t('priorityNone');
  String get labels => _t('labels');
  String get labelName => _t('labelName');
  String get labelNoneYet => _t('labelNoneYet');
  String get labelNoPalette => _t('labelNoPalette');
  String get labelOwnColour => _t('labelOwnColour');
  String get undo => _t('undo');
  String get delete => _t('delete');

  String taskCarriedOver(int times) =>
      _f('taskCarriedOver', {'times': '$times'});
  String taskDeletedMessage(String title) =>
      _f('taskDeletedMessage', {'title': title});
  String labelOpenCount(int count) =>
      _f('labelOpenCount', {'count': '$count'});

  // -- reminders -------------------------------------------------------------
  String get remindersTitle => _t('remindersTitle');
  String get reminderUpcoming => _t('reminderUpcoming');
  String get reminderOverdue => _t('reminderOverdue');
  String get reminderDone => _t('reminderDone');
  String get reminderCancelled => _t('reminderCancelled');
  String get reminderActive => _t('reminderActive');
  String get reminderDeleted => _t('reminderDeleted');
  String get reminderNothingHere => _t('reminderNothingHere');
  String get reminderTitle => _t('reminderTitle');
  String get reminderSnooze => _t('reminderSnooze');
  String get reminderComplete => _t('reminderComplete');
  String get reminderRestore => _t('reminderRestore');
  String get reminderReactivate => _t('reminderReactivate');
  String get reminderErase => _t('reminderErase');
  String get reminderLeadsHelp => _t('reminderLeadsHelp');
  String get syncNotSaved => _t('syncNotSaved');

  String reminderSnoozedFrom(String moment) =>
      _f('reminderSnoozedFrom', {'moment': moment});
  String reminderDeletedMessage(String title) =>
      _f('reminderDeletedMessage', {'title': title});

  // -- home ------------------------------------------------------------------
  String get homeGreetingNoName => _t('homeGreetingNoName');
  String get homeTodayPlan => _t('homeTodayPlan');
  String get homeNothingPlanned => _t('homeNothingPlanned');
  String get homeTraining => _t('homeTraining');
  String get homeMeals => _t('homeMeals');
  String get homeStreak => _t('homeStreak');
  String get homeWeek => _t('homeWeek');
  String get homeAdhered => _t('homeAdhered');
  String get homeMissed => _t('homeMissed');
  String get homeUnanswered => _t('homeUnanswered');
  String get homePlanTomorrow => _t('homePlanTomorrow');
  String get homePlanTomorrowBody => _t('homePlanTomorrowBody');
  String get homeCheckinBody => _t('homeCheckinBody');

  String homeGreeting(String name) => _f('homeGreeting', {'name': name});
  String homeDoneOfTotal(int done, int total) =>
      _f('homeDoneOfTotal', {'done': '$done', 'total': '$total'});
  /// The streak's length, in days, agreeing with the number in both languages.
  ///
  /// Not `_f('homeStreakDays', {'count': …})`, which is what this was — a
  /// single template per language, so English said "1 days" and Arabic said
  /// `2 يومًا` for a two-day streak and `5 يومًا` for a five-day one. Arabic has
  /// four forms here and `_f` can substitute a placeholder but cannot *choose*
  /// between them, so the choice is made in code and the words stay in the
  /// tables below.
  ///
  /// `counted.dart` carries the rule and why it is not a plural framework.
  String homeStreakDays(int count) => _isArabic
      ? arabicCounted(
          count,
          one: _t('homeStreakDaysOne'),
          two: _t('homeStreakDaysTwo'),
          few: _t('homeStreakDaysFew'),
          many: _t('homeStreakDaysMany'),
        )
      : englishCounted(
          count,
          one: _t('homeStreakDaysOne'),
          other: _t('homeStreakDaysMany'),
        );
  String homeStreakBest(int count) =>
      _f('homeStreakBest', {'count': '$count'});

  // -- the rhythm ------------------------------------------------------------
  String get rhythmConfirmTitle => _t('rhythmConfirmTitle');
  String get rhythmConfirmBody => _t('rhythmConfirmBody');
  String get rhythmConfirmAction => _t('rhythmConfirmAction');
  String get rhythmSkipAction => _t('rhythmSkipAction');
  String get rhythmNoCandidates => _t('rhythmNoCandidates');
  String get rhythmNothingDrafted => _t('rhythmNothingDrafted');
  String get rhythmTraining => _t('rhythmTraining');
  String get rhythmTrainingAsProposed => _t('rhythmTrainingAsProposed');
  String get rhythmTrainingYes => _t('rhythmTrainingYes');
  String get rhythmTrainingNo => _t('rhythmTrainingNo');
  String get rhythmPlanConfirmed => _t('rhythmPlanConfirmed');
  String get rhythmPlanSkipped => _t('rhythmPlanSkipped');
  String get rhythmCheckinTitle => _t('rhythmCheckinTitle');
  String get rhythmCheckinSaved => _t('rhythmCheckinSaved');
  String get rhythmMood => _t('rhythmMood');
  String get rhythmFollowed => _t('rhythmFollowed');
  String get rhythmNote => _t('rhythmNote');
  String get rhythmYes => _t('rhythmYes');
  String get rhythmNo => _t('rhythmNo');
  String get rhythmOffline => _t('rhythmOffline');
  String get rhythmRefused => _t('rhythmRefused');

  // -- P4: the chat ----------------------------------------------------------

  /// "Cancel", for a dialog that is a question rather than a command.
  ///
  /// Its own key and not `taskCancel`, which means cancelling a *task* — a
  /// status, not a dismissal. They are the same word in English and the same
  /// word in Arabic today, and they are still two different sentences: the day
  /// one of them is rephrased the other must not follow it.
  String get dismiss => _t('dismiss');

  String get chatsTitle => _t('chatsTitle');
  String get chatNewChat => _t('chatNewChat');
  String get chatPinned => _t('chatPinned');
  String get chatOthers => _t('chatOthers');
  String get chatNoneYet => _t('chatNoneYet');

  /// The two pinned chats are named by the app rather than by the row, because
  /// their titles are seeded on the server in one language.
  String get chatCoach => _t('chatCoach');
  String get chatPlanner => _t('chatPlanner');

  String get chatUntitled => _t('chatUntitled');
  String get chatClear => _t('chatClear');
  String get chatClearWarning => _t('chatClearWarning');
  String get chatClearInstead => _t('chatClearInstead');
  String get chatRename => _t('chatRename');
  String get chatUnpin => _t('chatUnpin');
  String get chatArchive => _t('chatArchive');
  String get chatProtectedTitle => _t('chatProtectedTitle');
  String get chatProtectedBody => _t('chatProtectedBody');
  String get chatOffline => _t('chatOffline');
  String get chatRefused => _t('chatRefused');
  String get chatEmpty => _t('chatEmpty');
  String get chatQueued => _t('chatQueued');
  String get chatWriting => _t('chatWriting');
  String get chatComposeHint => _t('chatComposeHint');
  String get chatSend => _t('chatSend');
  String get chatStop => _t('chatStop');

  /// Fallbacks only. A `quota` or `model_unavailable` error that arrives with a
  /// message is shown **verbatim**: the server's sentence names the limit and
  /// the moment it resets in the member's own time zone, and this one cannot.
  String get chatModelUnavailable => _t('chatModelUnavailable');
  String get chatTooFast => _t('chatTooFast');
  String get chatQuotaReached => _t('chatQuotaReached');

  String get chatMovedBodyUntitled => _t('chatMovedBodyUntitled');
  String get chatMovedOpen => _t('chatMovedOpen');
  String get chatCardComplete => _t('chatCardComplete');
  String get chatCardEmpty => _t('chatCardEmpty');
  String get chatCardMeetings => _t('chatCardMeetings');
  String get chatCardSessions => _t('chatCardSessions');
  String get chatCardOther => _t('chatCardOther');
  String get chatLinkRefused => _t('chatLinkRefused');
  String get chatLinkCopied => _t('chatLinkCopied');

  /// The title is the member's own opening words, so it is substituted rather
  /// than concatenated: the two languages do not put it in the same place in
  /// the sentence, and a string assembled with `+` reads backwards in one.
  String chatMovedBody(String title) => _f('chatMovedBody', {'title': title});

  // -- training (P6) ---------------------------------------------------------

  /// The seven known sports, by their stored name.
  ///
  /// A lookup and not a getter each, because the stored value is the member's
  /// own word whenever it is not one of the seven — "other" in the picker is a
  /// text field and not a bucket — so an unrecognised name has to fall through
  /// to itself rather than to a key that does not exist. `_t` would answer the
  /// key back, which is right by accident for `padel` and wrong for anything
  /// with a capital letter in it.
  ///
  /// "Do I have a translation for this" is asked of the table rather than of a
  /// second copy of the seven names. A list here would be `kKnownSports`
  /// duplicated — and this file must not import a feature to find it, which
  /// would point the dependency backwards.
  String sportName(String sport) => _strings['en']!.containsKey('sport_$sport')
      ? _t('sport_$sport')
      : sport;

  /// Monday is 1, Sunday is 7 — ISO 8601, as the slot stores it.
  String weekdayName(int weekday) =>
      _t('weekday_${weekday.clamp(1, 7)}');

  // ── P7: saved links and suggestions ─────────────────────────────────────
  //
  // The member reads three words where the server has six states — waiting,
  // reading, summarising — because `fetching` and `extracting` are one thing
  // from outside. `spec.md`'s glossary records the translation and
  // `knowledge_cubit.dart`'s `phaseOf` performs it, so a screen never sees a
  // server status.
  String get knowledgeTitle => _t('knowledgeTitle');
  String get knowledgeEmptyTitle => _t('knowledgeEmptyTitle');
  String get knowledgeEmptyBody => _t('knowledgeEmptyBody');
  String get knowledgeAdd => _t('knowledgeAdd');
  String get knowledgeUrl => _t('knowledgeUrl');
  String get knowledgeTags => _t('knowledgeTags');
  String get knowledgeSaveAction => _t('knowledgeSaveAction');
  String get knowledgeAll => _t('knowledgeAll');
  String get knowledgeWaiting => _t('knowledgeWaiting');
  String get knowledgeReading => _t('knowledgeReading');
  String get knowledgeSummarising => _t('knowledgeSummarising');
  String get knowledgeDone => _t('knowledgeDone');
  String get knowledgeFailed => _t('knowledgeFailed');
  String get knowledgeRetry => _t('knowledgeRetry');
  String get knowledgeRemove => _t('knowledgeRemove');
  String get knowledgeSummary => _t('knowledgeSummary');
  String get knowledgeKeyPoints => _t('knowledgeKeyPoints');
  String get knowledgeOpenOriginal => _t('knowledgeOpenOriginal');
  String get knowledgeNoSummaryYet => _t('knowledgeNoSummaryYet');
  String get knowledgeOffline => _t('knowledgeOffline');
  String get knowledgeNoTranscript => _t('knowledgeNoTranscript');
  String get knowledgeVideos => _t('knowledgeVideos');
  String get knowledgeSuggestions => _t('knowledgeSuggestions');
  String get knowledgeSuggestionsEmpty => _t('knowledgeSuggestionsEmpty');
  String get knowledgeAccept => _t('knowledgeAccept');
  String get knowledgeDismiss => _t('knowledgeDismiss');
  String get knowledgeSources => _t('knowledgeSources');
  String get knowledgeAlreadySaved => _t('knowledgeAlreadySaved');

  /// "…and {count} more were left out." The playlist limit, said plainly
  /// (FR-002's edge case). Substituted rather than concatenated, because the
  /// number sits in a different place in Arabic.
  String knowledgeSkipped(int count) =>
      _f('knowledgeSkipped', {'count': '$count'});

  // ── P8: meals and the day's food half ───────────────────────────────────
  //
  // The three withholding reasons are **codes** on the wire and sentences here,
  // which is the whole reason they are codes: the server stores
  // `allergen` | `empty_library` | `model_unavailable` and each surface says it
  // in the member's own language. Before P8 the server stored the English
  // sentence itself, into a column an Arabic-reading member syncs.
  String get nutritionTitle => _t('nutritionTitle');
  String get nutritionEmptyTitle => _t('nutritionEmptyTitle');
  String get nutritionEmptyBody => _t('nutritionEmptyBody');
  String get nutritionAdd => _t('nutritionAdd');
  String get nutritionName => _t('nutritionName');
  String get nutritionIngredients => _t('nutritionIngredients');
  String get nutritionIngredientsHelp => _t('nutritionIngredientsHelp');
  String get nutritionTags => _t('nutritionTags');
  String get nutritionSaveAction => _t('nutritionSaveAction');
  String get nutritionDelete => _t('nutritionDelete');
  String get nutritionKindAny => _t('nutritionKindAny');
  String get nutritionKindBreakfast => _t('nutritionKindBreakfast');
  String get nutritionKindLunch => _t('nutritionKindLunch');
  String get nutritionKindDinner => _t('nutritionKindDinner');
  String get nutritionKindSnack => _t('nutritionKindSnack');
  String get nutritionModeTitle => _t('nutritionModeTitle');
  String get nutritionModeLibrary => _t('nutritionModeLibrary');
  String get nutritionModeLlm => _t('nutritionModeLlm');
  String get nutritionTodayTitle => _t('nutritionTodayTitle');
  String get nutritionRegenerate => _t('nutritionRegenerate');
  String get nutritionUseMine => _t('nutritionUseMine');
  String get nutritionNoneToday => _t('nutritionNoneToday');
  String get nutritionWithheldAllergen => _t('nutritionWithheldAllergen');
  String get nutritionWithheldEmptyLibrary =>
      _t('nutritionWithheldEmptyLibrary');
  String get nutritionWithheldModelUnavailable =>
      _t('nutritionWithheldModelUnavailable');

  /// One of the three codes, as a sentence — or the plain "none today" line for
  /// a day nothing has chosen yet, which is not a refusal and must not read
  /// like one.
  String nutritionWithheld(String? code) {
    switch (code) {
      case 'allergen':
        return nutritionWithheldAllergen;
      case 'empty_library':
        return nutritionWithheldEmptyLibrary;
      case 'model_unavailable':
        return nutritionWithheldModelUnavailable;
      default:
        return nutritionNoneToday;
    }
  }

  /// A meal's part of the day, as the member picked it.
  String nutritionKind(String kind) {
    switch (kind) {
      case 'breakfast':
        return nutritionKindBreakfast;
      case 'lunch':
        return nutritionKindLunch;
      case 'dinner':
        return nutritionKindDinner;
      case 'snack':
        return nutritionKindSnack;
      default:
        return nutritionKindAny;
    }
  }

  String get athleteTitle => _t('athleteTitle');
  String get athleteNextPractice => _t('athleteNextPractice');
  String get athleteToday => _t('athleteToday');
  String get athleteNext => _t('athleteNext');
  String get athleteNoneTitle => _t('athleteNoneTitle');
  String get athleteNoneBody => _t('athleteNoneBody');
  String get athleteAddSession => _t('athleteAddSession');
  String get athleteNoSlotsTitle => _t('athleteNoSlotsTitle');
  String get athleteNoSlotsBody => _t('athleteNoSlotsBody');
  String get athleteSetSlots => _t('athleteSetSlots');
  String get athleteSports => _t('athleteSports');
  String get athleteChooseSports => _t('athleteChooseSports');
  String get athleteOtherSport => _t('athleteOtherSport');
  String get athleteSlots => _t('athleteSlots');
  String get athleteAddSlot => _t('athleteAddSlot');
  String get athleteSlotDay => _t('athleteSlotDay');
  String get athleteSlotTime => _t('athleteSlotTime');
  String get athleteSlotLength => _t('athleteSlotLength');
  String get athleteSlotPlace => _t('athleteSlotPlace');
  String get athleteWeek => _t('athleteWeek');
  String get athleteRestDay => _t('athleteRestDay');
  String get athleteThisWeek => _t('athleteThisWeek');
  String get athleteSave => _t('athleteSave');

  /// The four statuses, plus the derived reading that is not one of them.
  ///
  /// `athleteMissed` is deliberately in the same group and is deliberately not
  /// a status: it is `planned` plus a clock, answered by `isMissed` and stored
  /// nowhere (FR-018). Wording it like the four is right for the member and the
  /// comment is here so nobody adds a fifth column to match the fifth word.
  String get athletePlanned => _t('athletePlanned');
  String get athleteCompleted => _t('athleteCompleted');
  String get athleteCancelled => _t('athleteCancelled');
  String get athleteSkipped => _t('athleteSkipped');
  String get athleteMissed => _t('athleteMissed');

  String athleteMinutes(int minutes) =>
      _f('athleteMinutes', {'count': '$minutes'});

  // -- the session logger ----------------------------------------------------
  String get sessionAddExercise => _t('sessionAddExercise');
  String get sessionExerciseName => _t('sessionExerciseName');
  String get sessionAddSet => _t('sessionAddSet');
  String get sessionRepeatLast => _t('sessionRepeatLast');
  String get sessionRepeatLastNone => _t('sessionRepeatLastNone');
  String get sessionNotes => _t('sessionNotes');
  String get sessionNoExercises => _t('sessionNoExercises');
  String get sessionPlannedLabel => _t('sessionPlannedLabel');
  String get sessionReps => _t('sessionReps');
  String get sessionWeight => _t('sessionWeight');
  String get sessionDistance => _t('sessionDistance');
  String get sessionDuration => _t('sessionDuration');
  String get sessionComplete => _t('sessionComplete');
  String get sessionCancel => _t('sessionCancel');
  String get sessionSkip => _t('sessionSkip');
  String get sessionReopen => _t('sessionReopen');
  String get sessionApplyWorkout => _t('sessionApplyWorkout');
  String get sessionMissedStillLoggable => _t('sessionMissedStillLoggable');

  // -- programs and the workout library --------------------------------------
  String get programsTitle => _t('programsTitle');
  String get programsActive => _t('programsActive');
  String get programsArchived => _t('programsArchived');
  String get programsNone => _t('programsNone');
  String get programApply => _t('programApply');
  String get programApplyFrom => _t('programApplyFrom');
  String get programArchive => _t('programArchive');
  String get programApplied => _t('programApplied');
  String get programReplaceTitle => _t('programReplaceTitle');
  String get programReplaceBody => _t('programReplaceBody');
  String get programReplaceConfirm => _t('programReplaceConfirm');
  String get programKeep => _t('programKeep');
  String get workoutsTitle => _t('workoutsTitle');
  String get workoutsNone => _t('workoutsNone');
  String get workoutApplied => _t('workoutApplied');

  String programWeeks(int count) => _f('programWeeks', {'count': '$count'});

  // -- onboarding, the sports-and-slots step (FR-016) ------------------------
  String get onboardingSports => _t('onboardingSports');
  String get onboardingSportsBody => _t('onboardingSportsBody');
  String get onboardingSlotsBody => _t('onboardingSlotsBody');

  /// The tables, for the parity test and nothing else.
  ///
  /// Every key must exist in every locale, because `_t` falls back to English
  /// on a miss — which does not fail, it just puts an English sentence in the
  /// middle of an Arabic screen. That is a defect nobody notices until a member
  /// reports it, so a test enumerates these rather than a person enumerating
  /// getters: the hand-written list in `gateway_url_test` could only ever cover
  /// the keys somebody remembered to add to it.
  @visibleForTesting
  static Map<String, Map<String, String>> get tables => _strings;

  static const Map<String, Map<String, String>> _strings = {
    'en': {
      'taskToday': 'Today',
      'taskToDoToday': 'To Do — Today',
      'taskUpcoming': 'Upcoming',
      'taskOverdue': 'Overdue',
      'taskCompleted': 'Completed',
      'taskCancelled': 'Cancelled',
      'taskOpen': 'Open',
      'taskDeleted': 'Deleted',
      'taskByLabel': 'By label',
      'taskNothingHere': 'Nothing here.',
      'taskNothingToday': 'Nothing due today.',
      'taskComplete': 'Complete',
      'taskCancel': 'Cancel',
      'taskRestore': 'Restore',
      'taskEraseForGood': 'Erase for good',
      'taskRepeats': 'Repeats',
      'taskNotSyncedYet': 'Not uploaded yet',
      'taskTitle': 'What needs doing',
      'taskNotes': 'Notes',
      'taskNoDate': 'No date',
      'taskAllDay': 'All day',
      'taskClearDate': 'Clear the date',
      'taskPriority': 'Priority',
      'taskNoLabel': 'No label',
      'taskRepeat': 'Repeat',
      'taskNoRepeat': 'Never',
      'taskEstimate': 'Estimate (minutes)',
      'taskNoEstimate': 'None',
      'taskCarriedOver': 'Carried over {times}×',
      'taskDeletedMessage': 'Deleted "{title}"',
      'priorityHighest': 'Highest',
      'priorityHigh': 'High',
      'priorityNormal': 'Normal',
      'priorityNone': 'None',
      'labels': 'Labels',
      'labelName': 'Label name',
      'labelNoneYet': 'No labels yet.',
      'labelNoPalette':
          'The colour palette is set by whoever runs this Botvy, and this '
          'account cannot read it. Type a colour instead.',
      'labelOwnColour': 'Your own colour',
      'labelOpenCount': '{count} open',
      'undo': 'Undo',
      'delete': 'Delete',
      'remindersTitle': 'Reminders',
      'reminderUpcoming': 'Upcoming',
      'reminderOverdue': 'Overdue',
      'reminderDone': 'Done',
      'reminderCancelled': 'Cancelled',
      'reminderActive': 'Active',
      'reminderDeleted': 'Deleted',
      'reminderNothingHere': 'Nothing here.',
      'reminderTitle': 'Remind me to',
      'reminderSnooze': 'Snooze',
      'reminderComplete': 'Done',
      'reminderRestore': 'Restore',
      'reminderReactivate': 'Set a new time',
      'reminderErase': 'Erase for good',
      'reminderLeadsHelp':
          'Leave these empty to use your own defaults, so changing them later '
          'changes this reminder too.',
      'reminderSnoozedFrom': 'snoozed from {moment}',
      'reminderDeletedMessage': 'Deleted "{title}"',
      'syncNotSaved': 'Not saved — tap to try again',
      'appTitle': 'Botvy',
      'signInTitle': 'Sign in',
      'email': 'Email',
      'password': 'Password',
      'signInAction': 'Sign in',
      'serverUrl': 'Server URL',
      'emailRequired': 'Enter your email.',
      'passwordRequired': 'Enter your password.',
      'registerTitle': 'Create an account',
      'registerAction': 'Create account',
      'haveAccount': 'I already have an account',
      'needAccount': 'I need an account',
      'displayName': 'Your name',
      'confirmPassword': 'Confirm password',
      'passwordsDoNotMatch': 'The two passwords do not match.',
      'passwordTooShort': 'Use at least 8 characters.',
      'invalidCredentials': 'Email or password is incorrect.',
      'registrationClosed': 'This Botvy is not accepting new accounts.',
      'emailTaken': 'An account with that email already exists.',
      'offline': 'Cannot reach Botvy. Check the server address in settings.',
      'somethingWentWrong': 'That did not work. Please try again.',
      'signOut': 'Sign out',
      'changeYourPassword':
          'You signed in with the default password. Change it in Settings.',
      'profileTitle': 'Profile',
      'timezone': 'Time zone',
      'language': 'Language',
      'bodyMetrics': 'Body',
      'addMetric': 'Add a reading',
      'weightKg': 'Weight (kg)',
      'heightCm': 'Height (cm)',
      'bodyFatPct': 'Body fat (%)',
      'bmi': 'BMI',
      'noMetricsYet': 'No readings yet.',
      'needOneMeasurement': 'Fill in at least one measurement.',
      'foodLikes': 'Foods you like',
      'foodDislikes': 'Foods you avoid',
      'allergies': 'Allergies',
      'allergiesHelp': 'Meal suggestions never include anything on this list.',
      'symptoms': 'Symptoms',
      'addTagHint': 'Type and press enter',
      'save': 'Save',
      'saved': 'Saved.',
      'preferencesTitle': 'Preferences',
      'dailyTimes': 'Daily times',
      'planTomorrowTime': 'Plan tomorrow at',
      'endOfDayTime': 'End of day at',
      'morningBriefingTime': 'Morning briefing at',
      'nextPracticeCutoff': 'After this hour, next practice means tomorrow',
      'quietHours': 'Quiet hours',
      'quietFrom': 'From',
      'quietTo': 'Until',
      'quietHoursHelp':
          'Botvy waits during these hours. A time you chose yourself is never moved.',
      'weekStartsOn': 'Week starts on',
      'monday': 'Monday',
      'sunday': 'Sunday',
      'saturday': 'Saturday',
      'checkinEnabled': 'Ask how the day went',
      'meetingDuration': 'Default meeting length',
      'mealMode': 'Meal suggestions',
      'mealModeLlm': 'Drafted for me',
      'mealModeLibrary': 'From my saved meals',
      'aiSuggestions': 'Suggest training from saved links',
      'leadTimes': 'Remind me before',
      'leadTimesHelp': 'How far ahead of a timed thing to warn you.',
      'welcomeTitle': 'Welcome to Botvy',
      'welcomeBody':
          'A few questions, and you can change any of them later in Settings.',
      'onboardingTimezone': 'Where are you?',
      'onboardingTimezoneBody':
          'Your reminders and daily times follow this, not the server.',
      'onboardingTimes': 'Your day',
      'onboardingTimesBody':
          'These are the three moments Botvy will talk to you.',
      'skip': 'Skip',
      'next': 'Next',
      'finish': 'Finish',
      'resumeOnboarding': 'Finish setting up',
      'serverTitle': 'Server',
      'serverSettings': 'Server settings',
      'serverExplain':
          'Botvy runs on your own machine. Enter the address it is served from '
          'and test it before signing in.',
      'testConnection': 'Test connection',
      'serverSaved': 'Saved. Sign in to continue.',
      'serverUrlRequired': 'Enter the address your server is served from.',
      'serverUrlInvalid': 'That is not an address this app can reach.',
      'serverUrlNeedsScheme': 'Start with http:// or https://',
      'serverUrlNoPath': 'Enter the address only, with no path after it.',
      'serverNotBotvy': 'Something answered, but it is not a Botvy server.',
      'serverUnreachable': 'Nothing answered at that address.',
      'serverReachable': 'Connected to Botvy {version}.',
      'serverDegraded':
          'Connected to Botvy {version}, but it reports a problem. You can '
          'still sign in.',

      // ---- P3: home and the daily rhythm ------------------------------
      'homeGreeting': 'Hello, {name}',
      'homeGreetingNoName': 'Hello',
      'homeTodayPlan': "Today's plan",
      'homeNothingPlanned': 'Nothing planned for today, and no training either.',
      'homeTraining': 'Training',
      'homeMeals': 'Meals',
      'homeDoneOfTotal': '{done} of {total} done',
      'homeStreak': 'Streak',
      /*
       * Four keys, of which English uses two. The rule that picks between them
       * is in `core/i18n/counted.dart`; these are only the words, which is the
       * part a translator changes.
       */
      'homeStreakDaysOne': 'day',
      'homeStreakDaysTwo': 'days',
      'homeStreakDaysFew': 'days',
      'homeStreakDaysMany': 'days',
      'homeStreakBest': 'Best so far: {count}',
      'homeWeek': 'The last seven days',
      'homeAdhered': 'followed the plan',
      'homeMissed': 'did not follow the plan',
      // The third state, and the one that must never read as a miss.
      'homeUnanswered': 'not answered',
      'homePlanTomorrow': 'Plan tomorrow',
      'homePlanTomorrowBody': 'Botvy has drafted tomorrow. Confirm it or change it.',
      'homeCheckinBody': 'Answer and your streak keeps going.',
      'rhythmConfirmTitle': 'Tomorrow',
      'rhythmConfirmBody': 'Tick what tomorrow is for. Untick anything that can wait.',
      'rhythmConfirmAction': 'Confirm tomorrow',
      'rhythmSkipAction': 'Skip planning tomorrow',
      'rhythmNoCandidates': 'Nothing open to choose from.',
      'rhythmNothingDrafted': 'There is nothing drafted for that day.',
      'rhythmTraining': 'Training tomorrow',
      'rhythmTrainingAsProposed': 'As proposed',
      'rhythmTrainingYes': 'Yes',
      'rhythmTrainingNo': 'No',
      'rhythmPlanConfirmed': 'Tomorrow is set.',
      'rhythmPlanSkipped': 'Tomorrow is left as it is.',
      'rhythmCheckinTitle': 'How did today go?',
      'rhythmCheckinSaved': 'Recorded.',
      'rhythmMood': 'How did it feel?',
      'rhythmFollowed': 'Did you follow the plan?',
      'rhythmNote': 'Anything to add?',
      'rhythmYes': 'Yes',
      'rhythmNo': 'No',
      'rhythmOffline':
          'Botvy could not be reached, so this was not saved. Try again when '
          'you are back online.',
      'rhythmRefused': 'Botvy refused that. Nothing was saved.',

      // ---- P4: the chat ---------------------------------------------------
      'dismiss': 'Cancel',
      'chatsTitle': 'Chats',
      'chatNewChat': 'New chat',
      'chatPinned': 'Always here',
      'chatOthers': 'Your other chats',
      'chatNoneYet': 'No chats yet.',
      'chatCoach': 'Coach',
      'chatPlanner': 'Planner',
      'chatUntitled': 'Untitled chat',
      'chatClear': 'Empty this chat',
      'chatClearWarning':
          'Everything said here goes, on every one of your devices, and it '
          'does not come back.',
      'chatClearInstead': 'Empty it instead',
      'chatRename': 'Rename',
      'chatUnpin': 'Move out of this section',
      'chatArchive': 'Archive',
      'chatProtectedTitle': 'This chat stays',
      'chatProtectedBody':
          'Coach and Planner are always here, so they cannot be removed. You '
          'can empty this one instead.',
      'chatOffline':
          'Botvy could not be reached, so that was not saved. Try again when '
          'you are back online.',
      'chatRefused': 'Botvy refused that. Nothing was changed.',
      'chatEmpty': 'Nothing here yet. Ask something.',
      'chatQueued': 'Waiting to send',
      'chatWriting': 'Botvy is writing',
      'chatComposeHint': 'Ask Botvy',
      'chatSend': 'Send',
      'chatStop': 'Stop',
      'chatModelUnavailable':
          'Botvy cannot answer right now. Your message is kept, and your '
          'reminders and plans are unaffected.',
      'chatTooFast': 'That was a lot at once. Give it a moment.',
      'chatQuotaReached': 'You have used up today’s allowance.',
      'chatMovedBody': 'That did not belong here, so Botvy answered in {title}.',
      'chatMovedBodyUntitled': 'That did not belong here, so Botvy answered in a new chat.',
      'chatMovedOpen': 'Open it',
      'chatCardComplete': 'Mark as done',
      'chatCardEmpty': 'Nothing to show.',
      'chatCardMeetings': 'Meetings',
      'chatCardSessions': 'Training',
      'chatCardOther': 'Results',
      'chatLinkRefused': 'That link was not opened. Botvy only opens web links.',
      'chatLinkCopied': 'Link copied.',

      // -- training (P6) -----------------------------------------------------
      'sport_gym': 'Gym',
      'sport_football': 'Football',
      'sport_crossfit': 'CrossFit',
      'sport_calisthenics': 'Calisthenics',
      'sport_swimming': 'Swimming',
      'sport_running': 'Running',
      'sport_cycling': 'Cycling',

      'weekday_1': 'Monday',
      'weekday_2': 'Tuesday',
      'weekday_3': 'Wednesday',
      'weekday_4': 'Thursday',
      'weekday_5': 'Friday',
      'weekday_6': 'Saturday',
      'weekday_7': 'Sunday',

      'knowledgeTitle': 'Saved links',
      'knowledgeEmptyTitle': 'Nothing saved yet',
      'knowledgeEmptyBody':
          'Paste an article, a video or a playlist and Botvy will read it for you.',
      'knowledgeAdd': 'Save a link',
      'knowledgeUrl': 'Paste a link',
      'knowledgeTags': 'Tags, for matching sessions',
      'knowledgeSaveAction': 'Save',
      'knowledgeAll': 'All',
      'knowledgeWaiting': 'Waiting',
      'knowledgeReading': 'Reading',
      'knowledgeSummarising': 'Summarising',
      'knowledgeDone': 'Done',
      'knowledgeFailed': 'Failed',
      'knowledgeRetry': 'Try again',
      'knowledgeRemove': 'Remove',
      'knowledgeSummary': 'Summary',
      'knowledgeKeyPoints': 'Key points',
      'knowledgeOpenOriginal': 'Open the original',
      'knowledgeNoSummaryYet': 'Botvy has not finished reading this yet.',
      'knowledgeOffline': 'The summary is on the server. Connect to read it.',
      'knowledgeNoTranscript':
          'This video had no captions, so the summary was built from its title and description.',
      'knowledgeVideos': 'Videos',
      'knowledgeSuggestions': 'Suggestions',
      'knowledgeSuggestionsEmpty':
          'Nothing suggested. Save something about your training and Botvy will draw on it.',
      'knowledgeAccept': 'Use this',
      'knowledgeDismiss': 'No thanks',
      'knowledgeSources': 'From',
      'knowledgeAlreadySaved': 'You already have that one.',
      'knowledgeSkipped': 'and {count} more were left out',
      'nutritionTitle': 'Meals',
      'nutritionEmptyTitle': 'No meals yet',
      'nutritionEmptyBody':
          'Add the meals you actually eat and Botvy can build your day from them.',
      'nutritionAdd': 'Add a meal',
      'nutritionName': 'What is it?',
      'nutritionIngredients': "What's in it?",
      'nutritionIngredientsHelp':
          'Worth filling in: this is what the allergy check reads.',
      'nutritionTags': 'Tags',
      'nutritionSaveAction': 'Save',
      'nutritionDelete': 'Delete',
      'nutritionKindAny': 'Any time',
      'nutritionKindBreakfast': 'Breakfast',
      'nutritionKindLunch': 'Lunch',
      'nutritionKindDinner': 'Dinner',
      'nutritionKindSnack': 'Snack',
      'nutritionModeTitle': 'Where the day comes from',
      'nutritionModeLibrary': 'My meals',
      'nutritionModeLlm': 'Suggest for me',
      'nutritionTodayTitle': 'Today',
      'nutritionRegenerate': 'Again',
      'nutritionUseMine': 'Use one of mine',
      'nutritionNoneToday': 'Nothing planned for today yet.',
      'nutritionWithheldAllergen':
          'Nothing could be suggested that avoided something you are allergic to.',
      'nutritionWithheldEmptyLibrary':
          'Your meal list is empty. Add a few and Botvy will use them.',
      'nutritionWithheldModelUnavailable':
          'Meals could not be produced today. Your plan is unaffected.',
      'athleteTitle': 'Training',
      'athleteNextPractice': 'Next practice',
      'athleteToday': 'Today',
      'athleteNext': 'Next',
      'athleteNoneTitle': 'Nothing scheduled',
      'athleteNoneBody': 'You have no training coming up. Add a session, or set the days you train.',
      'athleteAddSession': 'Add a session',
      'athleteNoSlotsTitle': 'Tell Botvy when you train',
      'athleteNoSlotsBody': 'Set the days, times and sports, and the weeks fill themselves.',
      'athleteSetSlots': 'Set your slots',
      'athleteSports': 'Sports',
      'athleteChooseSports': 'Which sports do you practise?',
      'athleteOtherSport': 'Another sport',
      'athleteSlots': 'Weekly slots',
      'athleteAddSlot': 'Add a slot',
      'athleteSlotDay': 'Day',
      'athleteSlotTime': 'Time',
      'athleteSlotLength': 'Length',
      'athleteSlotPlace': 'Place (optional)',
      'athleteWeek': 'Week',
      'athleteRestDay': 'Rest day',
      'athleteThisWeek': 'This week',
      'athleteSave': 'Save',
      'athletePlanned': 'Planned',
      'athleteCompleted': 'Done',
      'athleteCancelled': 'Cancelled',
      'athleteSkipped': 'Skipped',
      'athleteMissed': 'Missed',
      'athleteMinutes': '{count} min',

      'sessionAddExercise': 'Add an exercise',
      'sessionExerciseName': 'Exercise',
      'sessionAddSet': 'Add a set',
      'sessionRepeatLast': 'Repeat last',
      'sessionRepeatLastNone': 'No earlier record of that exercise.',
      'sessionNotes': 'Notes',
      'sessionNoExercises': 'Nothing planned for this session yet.',
      'sessionPlannedLabel': 'Planned',
      'sessionReps': 'Reps',
      'sessionWeight': 'Weight (kg)',
      'sessionDistance': 'Distance (m)',
      'sessionDuration': 'Minutes',
      'sessionComplete': 'Completed',
      'sessionCancel': 'Cancel it',
      'sessionSkip': 'Skip it',
      'sessionReopen': 'Put it back',
      'sessionApplyWorkout': 'Use a saved workout',
      'sessionMissedStillLoggable': 'This one passed unlogged. You can still log it.',

      'programsTitle': 'Programs',
      'programsActive': 'Active',
      'programsArchived': 'Archived',
      'programsNone': 'No programs yet.',
      'programApply': 'Apply',
      'programApplyFrom': 'Start from',
      'programArchive': 'Archive',
      'programApplied': 'Applied. Your weeks are filling in.',
      'programReplaceTitle': 'This would replace planned sessions',
      'programReplaceBody': 'These sessions already hold planned content. Anything you have logged is left alone.',
      'programReplaceConfirm': 'Replace them',
      'programKeep': 'Keep them',
      'programWeeks': '{count} weeks',
      'workoutsTitle': 'My workouts',
      'workoutsNone': 'No saved workouts yet.',
      'workoutApplied': 'Added to the session.',

      'onboardingSports': 'What do you train?',
      'onboardingSportsBody': 'Pick the sports you practise. You can add your own.',
      'onboardingSlotsBody': 'Add the days and times you usually train. Botvy fills the weeks ahead from them.',
    },
    'ar': {
      'appTitle': 'بوتفي',
      'signInTitle': 'تسجيل الدخول',
      'email': 'البريد الإلكتروني',
      'password': 'كلمة المرور',
      'signInAction': 'تسجيل الدخول',
      'serverUrl': 'عنوان الخادم',
      'emailRequired': 'أدخل بريدك الإلكتروني.',
      'passwordRequired': 'أدخل كلمة المرور.',
      'registerTitle': 'إنشاء حساب',
      'registerAction': 'إنشاء الحساب',
      'haveAccount': 'لديّ حساب بالفعل',
      'needAccount': 'أحتاج إلى حساب',
      'displayName': 'اسمك',
      'confirmPassword': 'تأكيد كلمة المرور',
      'passwordsDoNotMatch': 'كلمتا المرور غير متطابقتين.',
      'passwordTooShort': 'استخدم ٨ أحرف على الأقل.',
      'invalidCredentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'registrationClosed': 'هذا التثبيت لا يقبل حسابات جديدة.',
      'emailTaken': 'يوجد حساب بهذا البريد الإلكتروني بالفعل.',
      'offline': 'تعذّر الوصول إلى بوتفي. تحقّق من عنوان الخادم في الإعدادات.',
      'somethingWentWrong': 'لم ينجح ذلك. حاول مرة أخرى.',
      'signOut': 'تسجيل الخروج',
      'changeYourPassword':
          'سجّلت الدخول بكلمة المرور الافتراضية. غيّرها من الإعدادات.',
      'profileTitle': 'الملف الشخصي',
      'timezone': 'المنطقة الزمنية',
      'language': 'اللغة',
      'bodyMetrics': 'الجسم',
      'addMetric': 'إضافة قياس',
      'weightKg': 'الوزن (كجم)',
      'heightCm': 'الطول (سم)',
      'bodyFatPct': 'نسبة الدهون (٪)',
      'bmi': 'مؤشر كتلة الجسم',
      'noMetricsYet': 'لا توجد قياسات بعد.',
      'needOneMeasurement': 'أدخل قياسًا واحدًا على الأقل.',
      'foodLikes': 'أطعمة تحبها',
      'foodDislikes': 'أطعمة تتجنبها',
      'allergies': 'الحساسية',
      'allergiesHelp': 'اقتراحات الطعام لا تتضمن أبدًا ما في هذه القائمة.',
      'symptoms': 'الأعراض',
      'addTagHint': 'اكتب ثم اضغط إدخال',
      'save': 'حفظ',
      'saved': 'تم الحفظ.',
      'preferencesTitle': 'التفضيلات',
      'dailyTimes': 'المواعيد اليومية',
      'planTomorrowTime': 'التخطيط للغد في',
      'endOfDayTime': 'نهاية اليوم في',
      'morningBriefingTime': 'ملخص الصباح في',
      'nextPracticeCutoff': 'بعد هذه الساعة، يعني التدريب القادم غدًا',
      'quietHours': 'ساعات الهدوء',
      'quietFrom': 'من',
      'quietTo': 'إلى',
      'quietHoursHelp':
          'ينتظر بوتفي خلال هذه الساعات. أما الموعد الذي تختاره أنت فلا يؤجل أبدًا.',
      'weekStartsOn': 'يبدأ الأسبوع يوم',
      'monday': 'الاثنين',
      'sunday': 'الأحد',
      'saturday': 'السبت',
      'checkinEnabled': 'اسألني كيف كان اليوم',
      'meetingDuration': 'مدة الاجتماع الافتراضية',
      'mealMode': 'اقتراحات الطعام',
      'mealModeLlm': 'يقترح لي',
      'mealModeLibrary': 'من وجباتي المحفوظة',
      'aiSuggestions': 'اقترح تدريبات من الروابط المحفوظة',
      'leadTimes': 'نبهني قبل',
      'leadTimesHelp': 'كم من الوقت قبل الموعد يجري تنبيهك.',
      'welcomeTitle': 'مرحبًا بك في بوتفي',
      'welcomeBody': 'أسئلة قليلة، ويمكنك تغيير أي منها لاحقًا من الإعدادات.',
      'onboardingTimezone': 'أين أنت؟',
      'onboardingTimezoneBody': 'تنبيهاتك ومواعيدك اليومية تتبع هذا، لا الخادم.',
      'onboardingTimes': 'يومك',
      'onboardingTimesBody': 'هذه هي اللحظات الثلاث التي سيحدثك فيها بوتفي.',
      'skip': 'تخط',
      'next': 'التالي',
      'finish': 'إنهاء',
      'resumeOnboarding': 'أكمل الإعداد',
      'serverTitle': 'الخادم',
      'serverSettings': 'إعدادات الخادم',
      'serverExplain':
          'يعمل بوتفي على جهازك الخاص. أدخل العنوان الذي يُقدَّم منه واختبره '
          'قبل تسجيل الدخول.',
      'testConnection': 'اختبار الاتصال',
      'serverSaved': 'تم الحفظ. سجّل الدخول للمتابعة.',
      'serverUrlRequired': 'أدخل العنوان الذي يُقدَّم منه الخادم.',
      'serverUrlInvalid': 'هذا ليس عنوانًا يمكن للتطبيق الوصول إليه.',
      'serverUrlNeedsScheme': 'ابدأ بـ http:// أو https://',
      'serverUrlNoPath': 'أدخل العنوان فقط، دون أي مسار بعده.',
      'serverNotBotvy': 'استجاب شيء ما، لكنه ليس خادم بوتفي.',
      'serverUnreachable': 'لم يستجب شيء على هذا العنوان.',
      'serverReachable': 'تم الاتصال ببوتفي {version}.',
      'serverDegraded':
          'تم الاتصال ببوتفي {version}، لكنه يبلّغ عن مشكلة. لا يزال بإمكانك '
          'تسجيل الدخول.',

    // ---- P2: tasks, labels and reminders ----------------------------
    'taskToday': 'اليوم',
    'taskToDoToday': 'المطلوب — اليوم',
    'taskUpcoming': 'القادمة',
    'taskOverdue': 'متأخرة',
    'taskCompleted': 'المنجزة',
    'taskCancelled': 'ملغاة',
    'taskOpen': 'مفتوحة',
    'taskDeleted': 'المحذوفة',
    'taskByLabel': 'حسب التصنيف',
    'taskNothingHere': 'لا يوجد شيء هنا.',
    'taskNothingToday': 'لا شيء مستحق اليوم.',
    'taskComplete': 'إنجاز',
    'taskCancel': 'إلغاء',
    'taskRestore': 'استعادة',
    'taskEraseForGood': 'حذف نهائي',
    'taskRepeats': 'تتكرر',
    'taskNotSyncedYet': 'لم تُرسل بعد',
    'taskTitle': 'ما المطلوب عمله',
    'taskNotes': 'ملاحظات',
    'taskNoDate': 'بدون تاريخ',
    'taskAllDay': 'طوال اليوم',
    'taskClearDate': 'إزالة التاريخ',
    'taskPriority': 'الأولوية',
    'taskNoLabel': 'بدون تصنيف',
    'taskRepeat': 'التكرار',
    'taskNoRepeat': 'لا يتكرر',
    'taskEstimate': 'الوقت المتوقع (دقائق)',
    'taskNoEstimate': 'بدون',
    'taskCarriedOver': 'مُرحَّلة {times}×',
    'taskDeletedMessage': 'تم حذف «{title}»',
    'priorityHighest': 'الأعلى',
    'priorityHigh': 'عالية',
    'priorityNormal': 'عادية',
    'priorityNone': 'بدون',
    'labels': 'التصنيفات',
    'labelName': 'اسم التصنيف',
    'labelNoneYet': 'لا توجد تصنيفات بعد.',
    'labelOwnColour': 'لون من اختيارك',
    'labelOpenCount': '{count} مفتوحة',
    'undo': 'تراجع',
    'delete': 'حذف',
    'remindersTitle': 'التذكيرات',
    'reminderUpcoming': 'القادمة',
    'reminderOverdue': 'متأخرة',
    'reminderDone': 'تم',
    'reminderCancelled': 'ملغاة',
    'reminderActive': 'نشطة',
    'reminderDeleted': 'المحذوفة',
    'reminderNothingHere': 'لا يوجد شيء هنا.',
    'reminderTitle': 'ذكّرني بأن',
    'reminderSnooze': 'تأجيل',
    'reminderComplete': 'تم',
    'reminderRestore': 'استعادة',
    'reminderReactivate': 'تحديد وقت جديد',
    'reminderErase': 'حذف نهائي',
    'reminderSnoozedFrom': 'مؤجَّل من {moment}',
    'reminderDeletedMessage': 'تم حذف «{title}»',
    'syncNotSaved': 'لم يُحفظ — اضغط للمحاولة مرة أخرى',
    'reminderLeadsHelp':
        'اتركها فارغة لاستخدام إعداداتك الافتراضية، فأي تغيير فيها '
        'لاحقًا يسري على هذا التذكير أيضًا.',
    'labelNoPalette':
        'مجموعة الألوان يحدّدها من يدير هذه النسخة من Botvy، وهذا '
        'الحساب لا يستطيع قراءتها. اكتب لونًا بنفسك.',

    // ---- P3: الرئيسية والإيقاع اليومي --------------------------------
    'homeGreeting': 'مرحبًا، {name}',
    'homeGreetingNoName': 'مرحبًا',
    'homeTodayPlan': 'خطة اليوم',
    'homeNothingPlanned': 'لا شيء مخطط لليوم، ولا تدريب أيضًا.',
    'homeTraining': 'التدريب',
    'homeMeals': 'الوجبات',
    'homeDoneOfTotal': 'أُنجز {done} من {total}',
    'homeStreak': 'التتابع',
    /*
     * The four Arabic forms. `يومان` is the nominative dual, which is what a
     * bare count reads as under the "التتابع" label — `يومين` is the form after
     * a preposition, as in the repeat picker's `كل يومين`. Both are on the
     * native-review list for this phase.
     */
    'homeStreakDaysOne': 'يوم واحد',
    'homeStreakDaysTwo': 'يومان',
    'homeStreakDaysFew': 'أيام',
    'homeStreakDaysMany': 'يومًا',
    'homeStreakBest': 'الأفضل حتى الآن: {count}',
    'homeWeek': 'الأيام السبعة الماضية',
    'homeAdhered': 'التزمت بالخطة',
    'homeMissed': 'لم تلتزم بالخطة',
    'homeUnanswered': 'بلا إجابة',
    'homePlanTomorrow': 'خطّط للغد',
    'homePlanTomorrowBody': 'أعدّ بوتفي مسودة للغد. أكّدها أو غيّرها.',
    'homeCheckinBody': 'أجب ليستمر تتابعك.',
    'rhythmConfirmTitle': 'الغد',
    'rhythmConfirmBody': 'اختر ما الغد مخصص له. أزل ما يمكن أن ينتظر.',
    'rhythmConfirmAction': 'تأكيد الغد',
    'rhythmSkipAction': 'تخطّي التخطيط للغد',
    'rhythmNoCandidates': 'لا توجد مهام مفتوحة للاختيار منها.',
    'rhythmNothingDrafted': 'لا توجد مسودة لذلك اليوم.',
    'rhythmTraining': 'تدريب الغد',
    'rhythmTrainingAsProposed': 'كما هو مقترح',
    'rhythmTrainingYes': 'نعم',
    'rhythmTrainingNo': 'لا',
    'rhythmPlanConfirmed': 'تم تحديد خطة الغد.',
    'rhythmPlanSkipped': 'تُرك الغد كما هو.',
    'rhythmCheckinTitle': 'كيف كان يومك؟',
    'rhythmCheckinSaved': 'تم التسجيل.',
    'rhythmMood': 'كيف كان شعورك؟',
    'rhythmFollowed': 'هل التزمت بالخطة؟',
    'rhythmNote': 'هل تريد إضافة شيء؟',
    'rhythmYes': 'نعم',
    'rhythmNo': 'لا',
    'rhythmOffline':
        'تعذّر الوصول إلى بوتفي، فلم يُحفظ ذلك. حاول مرة أخرى عند '
        'عودة الاتصال.',
    'rhythmRefused': 'رفض بوتفي ذلك. لم يُحفظ شيء.',

    // ---- P4: المحادثة ------------------------------------------------
    'dismiss': 'إلغاء',
    'chatsTitle': 'المحادثات',
    'chatNewChat': 'محادثة جديدة',
    'chatPinned': 'دائمًا هنا',
    'chatOthers': 'محادثاتك الأخرى',
    'chatNoneYet': 'لا توجد محادثات بعد.',
    'chatCoach': 'المدرّب',
    'chatPlanner': 'المنظّم',
    'chatUntitled': 'محادثة بلا عنوان',
    'chatClear': 'إفراغ هذه المحادثة',
    'chatClearWarning':
        'سيُحذف كل ما قيل هنا، من جميع أجهزتك، ولا يمكن استرجاعه.',
    'chatClearInstead': 'أفرغها بدلًا من ذلك',
    'chatRename': 'إعادة التسمية',
    'chatUnpin': 'إخراجها من هذا القسم',
    'chatArchive': 'أرشفة',
    'chatProtectedTitle': 'هذه المحادثة تبقى',
    'chatProtectedBody':
        'المدرّب والمنظّم موجودان دائمًا، فلا يمكن إزالتهما. يمكنك '
        'إفراغ هذه المحادثة بدلًا من ذلك.',
    'chatOffline':
        'تعذّر الوصول إلى بوتفي، فلم يُحفظ ذلك. حاول مرة أخرى عند '
        'عودة الاتصال.',
    'chatRefused': 'رفض بوتفي ذلك. لم يتغيّر شيء.',
    'chatEmpty': 'لا يوجد شيء هنا بعد. اسأل عن أي شيء.',
    'chatQueued': 'في انتظار الإرسال',
    'chatWriting': 'بوتفي يكتب',
    'chatComposeHint': 'اسأل بوتفي',
    'chatSend': 'إرسال',
    'chatStop': 'إيقاف',
    'chatModelUnavailable':
        'لا يستطيع بوتفي الإجابة الآن. رسالتك محفوظة، وتذكيراتك وخططك '
        'لم تتأثر.',
    'chatTooFast': 'هذا كثير في وقت واحد. أمهله لحظة.',
    'chatQuotaReached': 'استنفدت حصّتك لهذا اليوم.',
    'chatMovedBody': 'لم يكن هذا في مكانه، فأجاب بوتفي في {title}.',
    'chatMovedBodyUntitled': 'لم يكن هذا في مكانه، فأجاب بوتفي في محادثة جديدة.',
    'chatMovedOpen': 'افتحها',
    'chatCardComplete': 'تحديدها كمنجزة',
    'chatCardEmpty': 'لا يوجد ما يُعرض.',
    'chatCardMeetings': 'الاجتماعات',
    'chatCardSessions': 'التدريب',
    'chatCardOther': 'النتائج',
    'chatLinkRefused': 'لم يُفتح هذا الرابط. بوتفي لا يفتح إلا روابط الويب.',
    'chatLinkCopied': 'تم نسخ الرابط.',

    // -- التدريب --------------------------------------------------------------
    'sport_gym': 'الجيم',
    'sport_football': 'كرة القدم',
    'sport_crossfit': 'كروس فيت',
    'sport_calisthenics': 'تمارين الجسم',
    'sport_swimming': 'السباحة',
    'sport_running': 'الجري',
    'sport_cycling': 'الدراجة',

    'weekday_1': 'الإثنين',
    'weekday_2': 'الثلاثاء',
    'weekday_3': 'الأربعاء',
    'weekday_4': 'الخميس',
    'weekday_5': 'الجمعة',
    'weekday_6': 'السبت',
    'weekday_7': 'الأحد',

    'knowledgeTitle': 'الروابط المحفوظة',
    'knowledgeEmptyTitle': 'لا يوجد شيء محفوظ بعد',
    'knowledgeEmptyBody':
        'الصق مقالًا أو فيديو أو قائمة تشغيل وسيقرأها بوتفي نيابة عنك.',
    'knowledgeAdd': 'احفظ رابطًا',
    'knowledgeUrl': 'الصق رابطًا',
    'knowledgeTags': 'وسوم، لمطابقة الحصص',
    'knowledgeSaveAction': 'احفظ',
    'knowledgeAll': 'الكل',
    'knowledgeWaiting': 'في الانتظار',
    'knowledgeReading': 'قيد القراءة',
    'knowledgeSummarising': 'قيد التلخيص',
    'knowledgeDone': 'تم',
    'knowledgeFailed': 'فشل',
    'knowledgeRetry': 'حاول مرة أخرى',
    'knowledgeRemove': 'احذف',
    'knowledgeSummary': 'الملخص',
    'knowledgeKeyPoints': 'أهم النقاط',
    'knowledgeOpenOriginal': 'افتح المصدر',
    'knowledgeNoSummaryYet': 'لم ينتهِ بوتفي من قراءة هذا بعد.',
    'knowledgeOffline': 'الملخص على الخادم. اتصل بالإنترنت لقراءته.',
    'knowledgeNoTranscript':
        'لا توجد ترجمة نصية لهذا الفيديو، لذا بُني الملخص من عنوانه ووصفه.',
    'knowledgeVideos': 'الفيديوهات',
    'knowledgeSuggestions': 'الاقتراحات',
    'knowledgeSuggestionsEmpty':
        'لا توجد اقتراحات. احفظ شيئًا عن تدريبك وسيعتمد عليه بوتفي.',
    'knowledgeAccept': 'استخدم هذا',
    'knowledgeDismiss': 'لا شكرًا',
    'knowledgeSources': 'من',
    'knowledgeAlreadySaved': 'هذا الرابط محفوظ لديك بالفعل.',
    'knowledgeSkipped': 'و{count} أخرى لم تُضَف',
    'nutritionTitle': 'الوجبات',
    'nutritionEmptyTitle': 'لا توجد وجبات بعد',
    'nutritionEmptyBody':
        'أضف الوجبات التي تأكلها فعلًا ليبني بوتفي يومك منها.',
    'nutritionAdd': 'أضف وجبة',
    'nutritionName': 'ما هي؟',
    'nutritionIngredients': 'ما مكوّناتها؟',
    'nutritionIngredientsHelp':
        'يستحق الملء: هذا ما يقرأه فحص الحساسية.',
    'nutritionTags': 'وسوم',
    'nutritionSaveAction': 'احفظ',
    'nutritionDelete': 'احذف',
    'nutritionKindAny': 'أي وقت',
    'nutritionKindBreakfast': 'الفطار',
    'nutritionKindLunch': 'الغداء',
    'nutritionKindDinner': 'العشاء',
    'nutritionKindSnack': 'وجبة خفيفة',
    'nutritionModeTitle': 'مصدر وجبات اليوم',
    'nutritionModeLibrary': 'وجباتي',
    'nutritionModeLlm': 'اقترح لي',
    'nutritionTodayTitle': 'اليوم',
    'nutritionRegenerate': 'مرة أخرى',
    'nutritionUseMine': 'استخدم واحدة من وجباتي',
    'nutritionNoneToday': 'لا توجد وجبات لليوم بعد.',
    'nutritionWithheldAllergen':
        'لم يكن هناك اقتراح يخلو مما لديك حساسية منه.',
    'nutritionWithheldEmptyLibrary':
        'قائمة وجباتك فارغة. أضف بعضها وسيستخدمها بوتفي.',
    'nutritionWithheldModelUnavailable':
        'تعذّر إنتاج وجبات اليوم. خطتك لم تتأثر.',
    'athleteTitle': 'التدريب',
    'athleteNextPractice': 'التدريب القادم',
    'athleteToday': 'اليوم',
    'athleteNext': 'التالي',
    'athleteNoneTitle': 'لا يوجد تدريب مجدول',
    'athleteNoneBody': 'ليس لديك تدريب قادم. أضف حصة، أو حدّد أيام تدريبك.',
    'athleteAddSession': 'أضف حصة',
    'athleteNoSlotsTitle': 'أخبر بوتفي بمواعيد تدريبك',
    'athleteNoSlotsBody': 'حدّد الأيام والأوقات والرياضات، وستُملأ الأسابيع تلقائيًا.',
    'athleteSetSlots': 'حدّد مواعيدك',
    'athleteSports': 'الرياضات',
    'athleteChooseSports': 'ما الرياضات التي تمارسها؟',
    'athleteOtherSport': 'رياضة أخرى',
    'athleteSlots': 'المواعيد الأسبوعية',
    'athleteAddSlot': 'أضف موعدًا',
    'athleteSlotDay': 'اليوم',
    'athleteSlotTime': 'الوقت',
    'athleteSlotLength': 'المدة',
    'athleteSlotPlace': 'المكان (اختياري)',
    'athleteWeek': 'الأسبوع',
    'athleteRestDay': 'يوم راحة',
    'athleteThisWeek': 'هذا الأسبوع',
    'athleteSave': 'حفظ',
    'athletePlanned': 'مجدولة',
    'athleteCompleted': 'مكتملة',
    'athleteCancelled': 'ملغاة',
    'athleteSkipped': 'متروكة',
    'athleteMissed': 'فائتة',
    'athleteMinutes': '{count} دقيقة',

    'sessionAddExercise': 'أضف تمرينًا',
    'sessionExerciseName': 'التمرين',
    'sessionAddSet': 'أضف مجموعة',
    'sessionRepeatLast': 'كرّر الأخيرة',
    'sessionRepeatLastNone': 'لا يوجد سجل سابق لهذا التمرين.',
    'sessionNotes': 'ملاحظات',
    'sessionNoExercises': 'لا شيء مخطط لهذه الحصة بعد.',
    'sessionPlannedLabel': 'المخطط',
    'sessionReps': 'التكرارات',
    'sessionWeight': 'الوزن (كجم)',
    'sessionDistance': 'المسافة (م)',
    'sessionDuration': 'الدقائق',
    'sessionComplete': 'أُنجزت',
    'sessionCancel': 'ألغِها',
    'sessionSkip': 'اتركها',
    'sessionReopen': 'أعِدها',
    'sessionApplyWorkout': 'استخدم تمرينًا محفوظًا',
    'sessionMissedStillLoggable': 'فاتت هذه الحصة دون تسجيل. ما زال بإمكانك تسجيلها.',

    'programsTitle': 'البرامج',
    'programsActive': 'نشطة',
    'programsArchived': 'مؤرشفة',
    'programsNone': 'لا توجد برامج بعد.',
    'programApply': 'تطبيق',
    'programApplyFrom': 'ابدأ من',
    'programArchive': 'أرشفة',
    'programApplied': 'تم التطبيق. تُملأ أسابيعك الآن.',
    'programReplaceTitle': 'سيستبدل هذا حصصًا مجدولة',
    'programReplaceBody': 'هذه الحصص تحتوي بالفعل على محتوى مخطط. ما سجّلته يبقى كما هو.',
    'programReplaceConfirm': 'استبدلها',
    'programKeep': 'أبقِها',
    'programWeeks': '{count} أسابيع',
    'workoutsTitle': 'تماريني',
    'workoutsNone': 'لا توجد تمارين محفوظة بعد.',
    'workoutApplied': 'أُضيف إلى الحصة.',

    'onboardingSports': 'ما الذي تتدرب عليه؟',
    'onboardingSportsBody': 'اختر الرياضات التي تمارسها. ويمكنك إضافة رياضتك.',
    'onboardingSlotsBody': 'أضف الأيام والأوقات التي تتدرب فيها عادة، ليملأ بوتفي الأسابيع القادمة منها.',
    },
  };
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => AppLocalizations.supportedLocales.any(
    (l) => l.languageCode == locale.languageCode,
  );

  @override
  Future<AppLocalizations> load(Locale locale) async =>
      AppLocalizations(locale);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}
