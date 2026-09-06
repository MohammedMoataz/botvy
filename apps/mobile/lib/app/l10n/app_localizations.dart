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
  String get signInNotYetAvailable => _t('signInNotYetAvailable');

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
      'signInNotYetAvailable':
          'Sign-in arrives with the next phase. The server is reachable.',
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
      'signInNotYetAvailable':
          'تسجيل الدخول يصل في المرحلة التالية. الخادم متاح.',
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
