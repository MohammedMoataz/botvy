import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every string exists in every language.
///
/// `AppLocalizations._t` falls back to English on a missing key, which does not
/// throw and does not fail anything — it just puts an English sentence in the
/// middle of an Arabic screen. That is the kind of defect that ships and is
/// reported by a member rather than by a build.
///
/// P2 added fifty-nine keys for tasks, labels and reminders and, for a while,
/// added them to English only: 235 English keys against 87 Arabic. Nothing
/// caught it, because the only locale test in the suite enumerated eleven
/// getters *by hand* — so it could never notice a key nobody had added to the
/// list. This reads the tables instead, which means it covers every key that
/// exists now and every key a later phase adds without anybody touching this
/// file.
void main() {
  group('localisation parity', () {
    final tables = AppLocalizations.tables;

    test('declares the locales the app supports', () {
      // If a third language is ever added, the loops below pick it up
      // automatically — but the app has to know about it too.
      expect(tables.keys, containsAll(<String>['en', 'ar']));
    });

    test('every English key has an Arabic translation', () {
      final english = tables['en']!;
      final arabic = tables['ar']!;

      final missing = english.keys.where((key) => !arabic.containsKey(key)).toList()
        ..sort();

      expect(
        missing,
        isEmpty,
        reason:
            'these keys would render in English on an Arabic screen: '
            '${missing.join(', ')}',
      );
    });

    test('no locale carries a key English does not', () {
      // The other direction, which matters less but is still a bug: a key only
      // Arabic has is a string no English-reading member can ever see, so it is
      // either a typo or a translation of something that was deleted.
      final english = tables['en']!;

      for (final entry in tables.entries) {
        if (entry.key == 'en') continue;
        final extra = entry.value.keys.where((key) => !english.containsKey(key)).toList()
          ..sort();
        expect(
          extra,
          isEmpty,
          reason: '${entry.key} has keys English does not: ${extra.join(', ')}',
        );
      }
    });

    test('no translation is left as the English text', () {
      /*
       * A placeholder that was never translated reads as finished.
       *
       * Not every match is a mistake — a proper noun, a number, a unit — so
       * this allows the handful that are legitimately identical and fails on
       * anything new. The list is the exception, and adding to it should feel
       * like a decision.
       */
      const identicalOnPurpose = <String>{
        'appName', // "Botvy" is a name in both.
      };

      final english = tables['en']!;
      final arabic = tables['ar']!;

      final untranslated = <String>[];
      for (final entry in english.entries) {
        if (identicalOnPurpose.contains(entry.key)) continue;
        final translation = arabic[entry.key];
        if (translation == null) continue;
        // Anything with no Arabic letter at all is suspicious; anything
        // byte-identical to the English is almost certainly a copy.
        if (translation == entry.value && _hasLatinLetters(entry.value)) {
          untranslated.add(entry.key);
        }
      }
      untranslated.sort();

      expect(
        untranslated,
        isEmpty,
        reason: 'these are still the English text: ${untranslated.join(', ')}',
      );
    });

    test('a placeholder in English survives into the translation', () {
      /*
       * `_f()` substitutes `{name}` by exact match, so a translation that
       * dropped or renamed a placeholder renders the brace literally — the
       * member sees "تم الاتصال ببوتفي {version}" with no version in it.
       *
       * Checked per key rather than globally, because which placeholders a
       * string uses is part of its meaning.
       */
      final english = tables['en']!;
      final arabic = tables['ar']!;

      final broken = <String>[];
      for (final entry in english.entries) {
        final translation = arabic[entry.key];
        if (translation == null) continue;

        final wanted = _placeholders(entry.value);
        final got = _placeholders(translation);
        if (!_sameSet(wanted, got)) {
          broken.add('${entry.key} (wants ${wanted.join('+')}, has ${got.join('+')})');
        }
      }

      expect(broken, isEmpty, reason: broken.join('; '));
    });
  });
}

final _placeholderPattern = RegExp(r'\{(\w+)\}');

List<String> _placeholders(String text) =>
    (_placeholderPattern.allMatches(text).map((m) => m.group(1)!).toList()..sort());

bool _sameSet(List<String> a, List<String> b) =>
    a.length == b.length && List.generate(a.length, (i) => a[i] == b[i]).every((x) => x);

/// True when the string contains a-z, which an Arabic translation should not
/// unless it is quoting a name, a URL or a scheme.
bool _hasLatinLetters(String text) => RegExp(r'[A-Za-z]{3,}').hasMatch(text);
