import 'package:alchemist/alchemist.dart';
import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/app/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

/// One scenario per theme × language: what every kit component is pinned in.
GoldenTestGroup goldenMatrix({
  required Widget Function() builder,
  double width = 360,
}) => GoldenTestGroup(
  columns: 2,
  children: [
    for (final mode in const ['light', 'dark'])
      for (final lang in const ['en', 'ar'])
        GoldenTestScenario(
          name: '$mode $lang',
          constraints: BoxConstraints.tightFor(width: width),
          child: _Host(
            theme: mode == 'light' ? AppTheme.light : AppTheme.dark,
            locale: Locale(lang),
            child: builder(),
          ),
        ),
  ],
);

class _Host extends StatelessWidget {
  const _Host({required this.theme, required this.locale, required this.child});

  final ThemeData theme;
  final Locale locale;
  final Widget child;

  @override
  Widget build(BuildContext context) => Localizations(
    locale: locale,
    delegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
    ],
    child: Directionality(
      textDirection: locale.languageCode == 'ar'
          ? TextDirection.rtl
          : TextDirection.ltr,
      child: Theme(
        data: theme,
        child: Material(color: theme.scaffoldBackgroundColor, child: child),
      ),
    ),
  );
}
