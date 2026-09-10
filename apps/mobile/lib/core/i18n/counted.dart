/// Number agreement, for the two languages this app speaks.
///
/// ## Why this is its own file
///
/// It arrived in `core/recurrence/rule_words.dart` as a private helper for the
/// repeat picker, which is where the problem is most visible — كل أسبوعين is
/// not كل ٢ أسابيع, and a picker that says the second reads as broken Arabic.
/// Then the *second* caller turned up: `homeStreakDays` had been rendering
/// `'{count} يومًا'` for every count, so a two-day streak read `2 يومًا` and a
/// five-day streak `5 يومًا`, and the English side said "1 days".
///
/// Two callers in two layers — `core/recurrence/` and `app/l10n/` — is the
/// point at which the rule stops belonging to either. It is pure Dart with no
/// Flutter import, deliberately: `rule_words.dart` and both expanders are free
/// of the widget layer and their tests run without it, and a shared helper that
/// dragged `package:flutter/widgets.dart` in would end that.
///
/// ## What it does not do
///
/// It is not a plural-category framework. There is no CLDR table, no locale
/// negotiation and no gender: two languages, one rule each, and the caller
/// supplies the words. A general resolver for two locales and two callers would
/// be a framework standing where a function is enough — and the words have to
/// come from the caller anyway, because that is the part a translator changes.
library;

/// Arabic agreement for a counted noun.
///
/// Four forms, because Arabic has four cases here and collapsing any of them
/// produces text a native reader marks as wrong:
///
///  - **1** — the number is dropped entirely. `كل أسبوع`, not `كل 1 أسبوع`.
///  - **2** — the *dual*, which is its own word rather than two-plus-plural.
///    `أسبوعين`, `يومين`, `شهرين`. This is the single most visible error
///    available: `2 أسابيع` is the one a reader notices immediately.
///  - **3 to 10** — the number, then the **plural** of the noun (جمع):
///    `3 أسابيع`, `5 أيام`.
///  - **11 and above** — the number, then the **singular** in the accusative
///    (تمييز مفرد منصوب): `12 أسبوعًا`. Not a rounding of the rule above; the
///    singular really does return.
///
/// `two` is given whole rather than derived, because the dual is formed
/// differently for different nouns and a rule that tried would be a rule with
/// exceptions.
///
/// **Zero falls into the last branch and is not a fifth form.** `صفر مرة` would
/// be one, and no caller can reach it: an interval is floored at 1 and a count
/// of zero is omitted from the rule rather than rendered. A branch for it would
/// be a branch no test could exercise.
///
/// The digits are Western, matching what the rest of this app does with a
/// number that comes from *data* — `homeDoneOfTotal` renders `أُنجز 3 من 5`.
/// Arabic-Indic digits appear only where they are written into a sentence by
/// hand, as in `استخدم ٨ أحرف`. Choosing ٣ here would make these two screens
/// the only ones that disagree with the rest.
String arabicCounted(
  int n, {
  required String one,
  required String two,
  required String few,
  required String many,
}) => switch (n) {
  1 => one,
  2 => two,
  >= 3 && <= 10 => '$n $few',
  _ => '$n $many',
};

/// English agreement, which is one branch and still worth naming.
///
/// It exists because the bug it fixes was real: `'{count} days'` rendered
/// "1 days" for a one-day streak. A template with a fixed plural cannot say
/// this, and the alternative — every caller writing its own `n == 1 ? … : …` —
/// is the same decision made repeatedly in places where it can be forgotten
/// once.
String englishCounted(int n, {required String one, required String other}) =>
    n == 1 ? '$n $one' : '$n $other';
