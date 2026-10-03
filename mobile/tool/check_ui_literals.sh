#!/usr/bin/env bash
# FR-010 of specs/030-mobile-ui-kit: screens take spacing, radii, colours and
# type from the tokens and the theme, never as numbers or hex. Prints every
# offending line as path:line: text and exits 1 if there is one.
#
# Usage: tool/check_ui_literals.sh [DIR...]   (default: lib/features)
# Contract: test/ui_literals_check_test.dart and test/fixtures/ui_literals.
#
# `0` is allowed where it has a name (EdgeInsetsDirectional.zero,
# SizedBox.shrink()); a literal 0 is flagged like any other number.
set -uo pipefail

dirs=("$@")
[ ${#dirs[@]} -eq 0 ] && dirs=(lib/features)

patterns=(
  # Non-directional insets are wrong in Arabic whatever their argument.
  'EdgeInsets\.(all|symmetric|only|fromLTRB)\('
  # Directional is right, with tokens, not numbers.
  'EdgeInsetsDirectional\.[A-Za-z]+\([^)]*[0-9]'
  'SizedBox\((height|width): *[0-9]'
  'SizedBox\.square\([^)]*[0-9]'
  'BorderRadius(Directional)?\.(circular|all|only)\([^)]*[0-9]'
  'Color\(0x'
  'fontSize:'
  # Material's fixed palette; BotvyStatusColors and the scheme are not this.
  '(^|[^A-Za-z_])Colors\.'
)

regex=$(IFS='|'; echo "${patterns[*]}")
grep -rnE --include='*.dart' --exclude='*.g.dart' "$regex" "${dirs[@]}"
status=$?
# grep: 0 = found (fail), 1 = none (pass), 2 = error.
case $status in
  0) exit 1 ;;
  1) exit 0 ;;
  *) exit 2 ;;
esac
