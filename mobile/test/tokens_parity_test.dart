// The hand copy in lib/app/tokens.dart against the source the generator
// reads. The copy exists only until packages/tokens ships a pubspec; until
// then this is what stops it drifting the way it did before 030 (dark
// background, dark accent and radius all disagreed with tokens.json).
import 'dart:convert';
import 'dart:io';

import 'package:botvy/app/tokens.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';

Color _hex(String hex) => Color(int.parse('FF${hex.substring(1)}', radix: 16));

String _pascal(String s) => s[0].toUpperCase() + s.substring(1);

void main() {
  final json = jsonDecode(
    File('../packages/tokens/tokens.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  // Dart has no reflection in Flutter, so the members are listed by name.
  // A token added to the JSON without a member here fails the key check.
  const colors = <String, Color>{
    'lightBg': BotvyTokens.lightBg,
    'darkBg': BotvyTokens.darkBg,
    'lightSurface': BotvyTokens.lightSurface,
    'darkSurface': BotvyTokens.darkSurface,
    'lightText': BotvyTokens.lightText,
    'darkText': BotvyTokens.darkText,
    'lightMuted': BotvyTokens.lightMuted,
    'darkMuted': BotvyTokens.darkMuted,
    'lightLine': BotvyTokens.lightLine,
    'darkLine': BotvyTokens.darkLine,
    'lightAccent': BotvyTokens.lightAccent,
    'darkAccent': BotvyTokens.darkAccent,
    'lightAccentText': BotvyTokens.lightAccentText,
    'darkAccentText': BotvyTokens.darkAccentText,
    'lightUp': BotvyTokens.lightUp,
    'darkUp': BotvyTokens.darkUp,
    'lightDown': BotvyTokens.lightDown,
    'darkDown': BotvyTokens.darkDown,
    'lightUnknown': BotvyTokens.lightUnknown,
    'darkUnknown': BotvyTokens.darkUnknown,
  };
  const numbers = <String, num>{
    'radiusSm': BotvyTokens.radiusSm,
    'radiusMd': BotvyTokens.radiusMd,
    'radiusLg': BotvyTokens.radiusLg,
    'radiusXl': BotvyTokens.radiusXl,
    'radiusXxl': BotvyTokens.radiusXxl,
    'radiusFull': BotvyTokens.radiusFull,
    'spaceXxs': BotvyTokens.spaceXxs,
    'spaceXs': BotvyTokens.spaceXs,
    'spaceSm': BotvyTokens.spaceSm,
    'spaceMd': BotvyTokens.spaceMd,
    'spaceLg': BotvyTokens.spaceLg,
    'spaceXl': BotvyTokens.spaceXl,
    'spaceXxl': BotvyTokens.spaceXxl,
    'motionShortMs': BotvyTokens.motionShortMs,
    'motionMediumMs': BotvyTokens.motionMediumMs,
    'motionLongMs': BotvyTokens.motionLongMs,
  };

  test('every colour matches tokens.json in both modes', () {
    final expected = <String, Color>{
      for (final e in (json['color'] as Map<String, dynamic>).entries)
        for (final mode in const ['light', 'dark'])
          '$mode${_pascal(e.key)}': _hex(
            (e.value as Map<String, dynamic>)[mode] as String,
          ),
    };
    expect(colors.keys.toSet(), expected.keys.toSet());
    for (final name in expected.keys) {
      expect(colors[name], expected[name], reason: name);
    }
  });

  test('radius, space and motion match tokens.json', () {
    final expected = <String, num>{
      for (final e in (json['radius'] as Map<String, dynamic>).entries)
        'radius${_pascal(e.key)}': e.value as num,
      for (final e in (json['space'] as Map<String, dynamic>).entries)
        'space${_pascal(e.key)}': e.value as num,
      for (final e in (json['motion'] as Map<String, dynamic>).entries)
        'motion${_pascal(e.key)}Ms': e.value as num,
    };
    expect(numbers.keys.toSet(), expected.keys.toSet());
    for (final name in expected.keys) {
      expect(numbers[name], expected[name], reason: name);
    }
  });
}
