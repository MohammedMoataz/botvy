/**
 * Classifies a reply to the end-of-day check-in.
 *
 * Ported from v1 unchanged in behaviour, including the two bugs it had already
 * been fixed for, because both are the kind that come back:
 *
 * 1. **Whole words, both boundaries.** Anchoring only the start makes `not`
 *    fire inside `nothing`, so "nothing went wrong" was recorded as a missed
 *    day.
 * 2. **Arabic has no `\b`.** JavaScript's word boundary is defined against
 *    `[A-Za-z0-9_]`, so it matches nothing useful in Arabic and the old
 *    fallback was a substring test. `ما` (a negation) sits inside `تمام` (an
 *    affirmative), and negation wins — so a member answering "تمام" was logged
 *    as having missed their day and their streak went to zero. Arabic is
 *    tokenised and compared whole.
 *
 * Most replies are one word, so this decides them without a model call at all.
 * Anything genuinely ambiguous returns `unclear`, and the caller falls through
 * to an ordinary chat turn rather than guessing — recording the wrong verdict
 * costs the member their streak, and asking again costs a sentence.
 */

const AFFIRMATIVE = [
  'yes', 'yep', 'yeah', 'yup', 'ya', 'sure', 'done', 'did', 'complete',
  'completed', 'finished', 'trained', 'all good', 'of course', 'affirmative',
  'نعم', 'ايوه', 'أيوه', 'اه', 'آه', 'تمام', 'خلصت', 'عملت',
];

const NEGATIVE = [
  'no', 'nope', 'nah', 'not', 'skip', 'skipped', 'missed', 'miss', 'failed',
  'couldn', 'could not', 'didn', 'did not', 'rest',
  'لا', 'لأ', 'مش', 'ما', 'فاتني',
];

export type CheckinVerdict = 'adhered' | 'missed' | 'unclear';

/*
 * `\p{ASCII}` rather than v1's `[\x00-\x7F]`.
 *
 * The same set of characters, and `no-control-regex` refuses the second form —
 * correctly, in general: a literal control character in a pattern is nearly
 * always a typo rather than an intent. Here it was deliberate, but the Unicode
 * property escape says the same thing without the escape, so there is nothing
 * to suppress and no comment for a future reader to have to trust. v1's version
 * was never linted, because v1 is excluded from the toolchain.
 */
const ASCII_ONLY = /^\p{ASCII}+$/u;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const NON_WORD = /[^\p{L}\p{N}]+/u;

/**
 * Whole-word match, by whichever rule the script admits.
 *
 * Contraction stems like `didn` still match "didn't", because the apostrophe is
 * itself a word boundary — which is why the list carries the stem rather than
 * both spellings.
 */
function containsWord(haystack: string, needle: string): boolean {
  if (ASCII_ONLY.test(needle)) {
    const escaped = needle.replace(REGEX_SPECIALS, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
  }
  return tokenise(haystack).includes(needle);
}

/** Words, for a script with no word-boundary escape. */
function tokenise(text: string): string[] {
  return text.split(NON_WORD).filter(Boolean);
}

export function classifyCheckin(reply: string): CheckinVerdict {
  const text = reply.trim().toLowerCase();
  if (text === '') return 'unclear';

  const negative = NEGATIVE.some((word) => containsWord(text, word));
  const affirmative = AFFIRMATIVE.some((word) => containsWord(text, word));

  // Negation wins: "yeah, I didn't manage it" is a miss, and reading a missed
  // day as adhered corrupts the one number the member is actually watching.
  if (negative) return 'missed';
  if (affirmative) return 'adhered';
  return 'unclear';
}

/**
 * A mood the member typed alongside their answer, when there is one.
 *
 * Deliberately narrow: a bare number nought to a hundred, optionally with a
 * `/100`. Anything cleverer — "pretty good", "7 out of 10" — is left to P4's
 * model turn, because a heuristic that guesses a number from prose will
 * sometimes guess, and this value is stored as if the member had said it.
 */
export function extractMood(reply: string): number | null {
  const match = /(?:^|\s)(\d{1,3})(?:\s*\/\s*100)?(?:$|\s|[.,!])/.exec(reply);
  if (!match) return null;
  const mood = Number(match[1]);
  if (!Number.isFinite(mood) || mood < 0 || mood > 100) return null;
  return mood;
}
