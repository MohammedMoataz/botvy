import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

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
