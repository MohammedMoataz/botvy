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

  static const Map<String, Map<String, String>> _strings = {
    'en': {
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
