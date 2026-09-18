/**
 * Number agreement, for the two languages this installation speaks.
 *
 * A straight port of `mobile/lib/core/i18n/counted.dart`, and deliberately a
 * port rather than a fresh design: the phone's version was written with a
 * native reader's eye on it and is the one the member already sees, so the
 * server saying something *different* in Arabic would be worse than the server
 * saying nothing. Where the two could drift, the words are the caller's — which
 * is the part a translator changes — and only the rule lives here.
 *
 * ## Why it is in `shared/`
 *
 * Two callers in two contexts: Planning renders a repeat rule
 * (`shared/i18n/rule-words.ts`, reached from `Recurrence.humanText`) and the
 * rhythm composes its three daily touches. Agreement is not either context's
 * business and neither owns it, which is the same argument `shared/time` was
 * moved on.
 */

/**
 * Arabic agreement for a counted noun.
 *
 * Four forms, because Arabic has four cases here and collapsing any of them
 * produces text a native reader marks as wrong:
 *
 *  - **1** — the number is dropped entirely. `كل أسبوع`, not `كل 1 أسبوع`.
 *  - **2** — the *dual*, which is its own word rather than two-plus-plural:
 *    `أسبوعين`, `يومين`, `شهرين`. The single most visible error available —
 *    `2 أسابيع` is the one a reader notices immediately.
 *  - **3 to 10** — the number, then the **plural** (جمع): `3 أسابيع`, `5 أيام`.
 *  - **11 and above** — the number, then the **singular** in the accusative
 *    (تمييز مفرد منصوب): `12 أسبوعًا`. Not a rounding of the rule above; the
 *    singular really does return.
 *
 * `two` is given whole rather than derived, because the dual is formed
 * differently for different nouns and a rule that tried would be a rule with
 * exceptions.
 *
 * **Zero falls into the last branch and is not a fifth form.** No caller can
 * reach it — an interval is floored at 1 and a count of zero is omitted from
 * the rule rather than rendered — so a branch for it would be a branch no test
 * could exercise.
 *
 * The digits are Western, matching what the phone does with every number that
 * comes from *data*; Arabic-Indic digits appear only where they are written
 * into a sentence by hand. Choosing ٣ here would make the server disagree with
 * the app it is writing into.
 */
export function arabicCounted(
  n: number,
  words: { one: string; two: string; few: string; many: string },
): string {
  if (n === 1) return words.one;
  if (n === 2) return words.two;
  if (n >= 3 && n <= 10) return `${n} ${words.few}`;
  return `${n} ${words.many}`;
}

/**
 * English agreement, which is one branch and still worth naming.
 *
 * It exists because the bug it fixes was real on the phone: a template with a
 * fixed plural rendered "1 days" for a one-day streak, and the alternative —
 * every caller writing its own `n === 1 ? … : …` — is the same decision made
 * repeatedly in places where it can be forgotten once.
 */
export function englishCounted(
  n: number,
  words: { one: string; other: string },
): string {
  return `${n} ${n === 1 ? words.one : words.other}`;
}

/**
 * Which of the tables a locale reads from.
 *
 * `ar`, `ar-EG`, `AR` — anything whose language subtag is Arabic. Everything
 * else, including an empty string, a locale we have no table for and a member
 * whose profile row has not been written yet, is English. That last case is the
 * rule stated in E-012: a member with no locale gets English rather than a
 * guess.
 */
export function isArabic(locale: string | null | undefined): boolean {
  return (locale ?? '').toLowerCase().startsWith('ar');
}
