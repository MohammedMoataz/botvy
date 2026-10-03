#!/usr/bin/env bash
# FR-010 of specs/030-mobile-ui-kit: screens take spacing, radii, colours and
# type from the tokens and the theme, never as numbers or hex. Prints every
# offending call as path:line: text (the line the call starts on) and exits 1
# if there is one.
#
# Usage: tool/check_ui_literals.sh [DIR...]   (default: lib/features)
# Contract: test/ui_literals_check_test.dart and test/fixtures/ui_literals.
#
# Whole files, not lines: `SizedBox(\n  height: 20,\n)` is the same literal as
# `SizedBox(height: 20)`, and a line-based grep let it through.
#
# `0` is allowed where it has a name (EdgeInsetsDirectional.zero,
# SizedBox.shrink()); a literal 0 is flagged like any other number.
set -uo pipefail

dirs=("$@")
[ ${#dirs[@]} -eq 0 ] && dirs=(lib/features)

find "${dirs[@]}" -name '*.dart' ! -name '*.g.dart' -print0 |
  xargs -0 -r perl -0777 -ne '
    my @patterns = (
      # Non-directional insets are wrong in Arabic whatever their argument.
      qr/EdgeInsets\.(?:all|symmetric|only|fromLTRB)\(/,
      # Directional is right, with tokens, not numbers.
      qr/EdgeInsetsDirectional\.[A-Za-z]+\([^)]*[0-9]/,
      qr/SizedBox\(\s*(?:height|width):\s*[0-9]/,
      qr/SizedBox\.square\([^)]*[0-9]/,
      qr/BorderRadius(?:Directional)?\.(?:circular|all|only)\([^)]*[0-9]/,
      qr/Color\(0x/,
      qr/fontSize:/,
      # Material'"'"'s fixed palette; BotvyStatusColors and the scheme are not this.
      qr/(?:^|[^A-Za-z_])Colors\./m,
    );
    my %hits;
    for my $re (@patterns) {
      while (/$re/g) {
        my $start = $-[0];
        my $line = 1 + (substr($_, 0, $start) =~ tr/\n//);
        my $bol = rindex($_, "\n", $start - 1) + 1;
        my $eol = index($_, "\n", $start);
        $eol = length($_) if $eol < 0;
        $hits{$line} = substr($_, $bol, $eol - $bol);
      }
    }
    print "$ARGV:$_:$hits{$_}\n" for sort { $a <=> $b } keys %hits;
    $found ||= %hits ? 1 : 0;
    END { exit($found ? 1 : 0) }
  '
# xargs: 0 = every file clean, 123 = some file had a hit, else an error.
case ${PIPESTATUS[1]} in
  0) exit 0 ;;
  123) exit 1 ;;
  *) exit 2 ;;
esac
