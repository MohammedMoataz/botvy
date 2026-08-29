/**
 * Classifies a reply to the nightly check-in.
 *
 * The predecessor system spent a model call on this and then lost the
 * whole feature to a `=== true` comparison against a SQLite integer. Most
 * replies are a plain yes or no, so those are decided here without a model
 * call at all; anything genuinely ambiguous falls through to the caller,
 * which can then ask the model.
 */

const AFFIRMATIVE = [
  'yes', 'yep', 'yeah', 'yup', 'ya', 'sure', 'done', 'did', 'complete', 'completed',
  'finished', 'trained', 'workout done', 'all good', 'of course', 'affirmative',
  'نعم', 'ايوه', 'أيوه', 'اه', 'آه', 'تمام', 'خلصت', 'عملت',
];

const NEGATIVE = [
  'no', 'nope', 'nah', 'not', 'skip', 'skipped', 'missed', 'miss', 'failed',
  'couldn', 'could not', 'didn', 'did not', 'rest',
  'لا', 'لأ', 'مش', 'ما', 'فاتني',
];

export type CheckinVerdict = 'adhered' | 'missed' | 'unclear';

/**
 * Whole-word match. Both boundaries are required: anchoring only the start
 * makes "not" fire inside "nothing". Contraction stems like "didn" still
 * match "didn't", because the apostrophe is itself a word boundary.
 */
function containsWord(haystack: string, needle: string): boolean {
  if (/^[\x00-\x7F]+$/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
  }
  // Arabic and other non-Latin scripts have no \b semantics in JS regex,
  // so fall back to substring matching for them.
  return haystack.includes(needle);
}

export function classifyCheckin(reply: string): CheckinVerdict {
  const text = reply.trim().toLowerCase();
  if (text === '') return 'unclear';

  const negative = NEGATIVE.some((w) => containsWord(text, w));
  const affirmative = AFFIRMATIVE.some((w) => containsWord(text, w));

  // Negation wins: "yeah I didn't manage it" is a miss, and treating a
  // missed day as adhered would corrupt the streak the user relies on.
  if (negative) return 'missed';
  if (affirmative) return 'adhered';
  return 'unclear';
}
