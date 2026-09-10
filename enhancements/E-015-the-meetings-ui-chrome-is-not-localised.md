# E-015 — The meetings UI's chrome never reached the string table

**Area**: product · **Status**: open · **Found**: P5, finishing the repeat picker's Arabic

## What

`AppLocalizations` holds the app's strings for `en` and `ar`, and every screen
before P5 reads from it. P5's two new features do not, in one specific way: the
*content* is localised and the *chrome* is not.

What is localised: the repeat rule in the member's own words, in both languages,
with Arabic number agreement done properly (`كل أسبوعين` for two weeks, the
plural from three to ten, the singular again from eleven) — `core/i18n/counted.dart`
and `core/recurrence/rule_words.dart`. Also the weekday names and the ، separator.

What is not, and is hard-coded English in the widget files:

- **`repeat_picker.dart`** — "Repeat", "Daily" / "Weekly" / "Monthly", "Every",
  "day" / "week" / "month", "Ends", "Never" / "After" / "On date", "times",
  "Does not repeat", "Set repeat", and the line explaining what the 31st does in
  February.
- **`meeting_sheet.dart`** and **`event_sheet.dart`** — "Does not repeat" and the
  field labels around it.
- **`meetings_page.dart`** — the action labels.

So an Arabic-reading member opening the repeat picker sees an English form whose
one Arabic sentence is the confirmation line at the bottom.

## Why it is not simply a bug

Because the phase's own task line asked for a specific thing and it was
delivered. T560 says *"Arabic strings for the repeat picker (plural and dual
forms)"*, and the plural-and-dual clause is the part with linguistic risk in it —
getting the dual wrong produces text a native reader marks as broken, where a
missing translation produces text they can still act on. That is the part that
needed doing in the phase that built the picker, by somebody holding the rule in
their head, and it is done and tested.

The chrome is a different kind of work: mechanical, large, and identical for
every screen. Doing it inside T560 would have widened the change past what could
be reviewed alongside the recurrence logic, and it would have been the same edit
in five files with no judgment in any of them.

It is also not the same thing as `E-008` or `E-012`. Those are about *composed
prose* — a rule rendered by `rrule.toText()`, and the server's own sentences —
where the fix needs a translation table or a decision to stop sending prose.
This is a string table that exists, works, and simply was not used.

## What it costs

An Arabic-reading member gets a bilingual form. That is worse than it sounds for
one reason beyond the reading: **the layout is right-to-left and the labels are
left-to-right**, so a form of English labels inside an RTL column is where
alignment and punctuation-direction defects live. Nobody has seen it yet,
because the RTL screenshots need a physical Android device and have been
outstanding since P2 — which means this file and that gap are the same finding
seen from two sides.

The cost of leaving it is bounded and visible rather than silent: no data is
wrong, no notification goes to the wrong place, and a member can still operate
the picker. It reads as unfinished, which is exactly what it is.

## What fixing it takes

Roughly forty keys added to both tables in `app_localizations.dart` and five
widget files reading `AppLocalizations.of(context)` instead of literals. No
design decision, one caveat, and one thing to be careful of:

**The caveat.** Two of the strings are not translations. "times" is a counted
noun, so it needs the four Arabic forms — `arabicCounted` already exists and
already carries `مرة واحدة / مرتين / مرات / مرةً` for the rule's own occurrence
count, so the picker's label should use the same call rather than a fifth
spelling. And the February explanation is a sentence about a calendar rule; it
wants a translator's judgment, not a literal rendering.

**The thing to be careful of.** `core/i18n/counted.dart` is deliberately free of
Flutter imports, because `rule_words.dart` and both recurrence expanders are,
and their tests run without a widget binding. Localising the chrome must not
pull `AppLocalizations` into `core/` to reach it — the rule takes the words as
arguments precisely so the caller can be the one holding the context.

**Recommendation:** do it in P9 or P10, whichever first has somebody looking at
these screens with a device in hand, and do it in the same change as the RTL
screenshots. A pass of forty strings is worth doing once, with the result
visible, rather than twice.
