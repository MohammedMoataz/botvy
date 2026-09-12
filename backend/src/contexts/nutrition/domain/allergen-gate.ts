/**
 * The one rule in this context that can hurt somebody.
 *
 * FR-006 does not say "warn". It says a suggestion containing a declared
 * allergen is **withheld entirely**, and that word is the whole design: a line
 * shown with a caution beside it is a line a member reads at seven in the
 * morning with one eye open. So this answers a question — does this text name
 * something this member declared? — and the caller withholds on a yes.
 *
 * ## It is given lists, never a prose summary
 *
 * `ProfileQueryHandler.summary` assembles "Allergies: peanuts, dairy" into a
 * sentence for a prompt, and matching an allergen word against a sentence is
 * precisely the fragile thing that ends with a member being handed an allergen —
 * a summary that ever grows "Allergies: none recorded" would make every gate
 * match on "none". The gate takes `string[]`.
 *
 * ## It expands both ways, and that is deliberately asymmetric
 *
 * A member who declares **"nuts"** is held away from almonds, because a family
 * name has to cover its family or the feature does nothing.
 *
 * A member who declares **"almond"** is *also* held away from walnuts, and that
 * is over-broad on purpose. The two errors are not the same size: withholding
 * too much costs a member one line of food suggestions, and withholding too
 * little costs them a reaction. The spec's own edge case says it — *when in
 * doubt the line is withheld* — and this is the only place in the product where
 * "when in doubt" has a direction.
 *
 * ## What it does not do
 *
 * It does not filter. Removing the offending word from a generated list leaves
 * the model's intent intact and produces half a sentence — "chicken salad with
 * and rice" — and, worse, leaves the member believing the list was composed for
 * them. The caller retries once with the matches named as prohibitions and
 * withholds if the retry still matches; `plan.md`'s complexity table records
 * that as a deliberate cost.
 */

/** What each word covers, beyond itself. `nutrition.allergenFamilies`. */
export type AllergenFamilies = Record<string, string[]>;

export interface AllergenMatch {
  /** The member's own word, as they wrote it. */
  declared: string;
  /** The word in the text that matched it. */
  found: string;
}

/**
 * Everything the member declared that this text names.
 *
 * Returns matches rather than a boolean, because the caller needs them twice:
 * to name them as prohibitions on the retry, and to say in the log which
 * allergy withheld a line. A boolean would make the retry a blind second guess.
 */
export function findAllergens(
  text: string,
  allergies: string[],
  families: AllergenFamilies,
): AllergenMatch[] {
  const haystack = words(text);
  if (haystack.size === 0) return [];

  const matches: AllergenMatch[] = [];
  const seen = new Set<string>();

  for (const declared of allergies) {
    const normalised = normalise(declared);
    if (normalised === '') continue;

    for (const candidate of expand(normalised, families)) {
      const found = [...haystack].find((word) => covers(word, candidate));
      if (!found) continue;
      const key = `${normalised}:${candidate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // The word as the *text* wrote it, not the candidate that matched it —
      // the retry has to prohibit what the model actually said, and "buttered"
      // is what it said.
      matches.push({ declared, found });
    }
  }

  return matches;
}

/**
 * One declared word, plus everything in any family it touches.
 *
 * Exported for the spec, because the expansion *is* the rule and asserting it
 * through `findAllergens` alone would test the matcher and the vocabulary
 * together — so a family that quietly lost a word would look like a matching
 * bug.
 */
export function expand(
  declared: string,
  families: AllergenFamilies,
): Set<string> {
  const normalised = normalise(declared);
  const out = new Set<string>([normalised]);
  // Singular and plural both, so "nuts" declared against "nut" written, and the
  // reverse, are one word. Crude on purpose: a stemmer would be a dependency
  // and a second set of rules to be wrong in two languages.
  out.add(singular(normalised));
  out.add(`${singular(normalised)}s`);

  for (const [family, members] of Object.entries(families)) {
    const bag = new Set([normalise(family), ...members.map(normalise)]);
    const touches = [...out].some((word) => bag.has(word));
    if (!touches) continue;
    // Both directions at once: the family name pulls in its members, and a
    // member pulls in its family. See the header for why the second half is
    // deliberately over-broad.
    for (const word of bag) out.add(word);
  }

  out.delete('');
  return out;
}

/**
 * The words a text contains, with every compound split.
 *
 * "Peanut butter noodles" has to match a declaration of `peanut`, and it only
 * does if the text is broken into words rather than searched with `includes` —
 * which would also match `nut` inside `donut` and withhold a member's breakfast
 * for no reason. Both halves of that matter and they pull in opposite
 * directions, which is why this is a word set rather than a substring search.
 *
 * Hyphens and slashes are separators, so "soy-free" and "egg/dairy" split. The
 * singular of each word is added beside it, so a text saying "eggs" matches a
 * declaration of "egg".
 */
function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalise(text).split(/[^\p{L}\p{N}]+/u)) {
    if (raw === '') continue;
    out.add(raw);
    out.add(singular(raw));
  }
  out.delete('');
  return out;
}

/**
 * Whether one word of the text names this allergen.
 *
 * Equality, **or** the text's word beginning with the allergen — which is the
 * half a corpus of fifty phrasings had to find. "Buttered toast" and "creamy
 * mushroom pasta" are ordinary ways to write a meal and neither is caught by
 * equality plus a plural rule: the endings are `-ed` and `-y`, and the next
 * ones would be `-ing` and `-ish`. A prefix covers the family of endings
 * without a stemmer, which would be a dependency and a second set of rules to
 * be wrong in two languages.
 *
 * The floor of four characters is what keeps the prefix from behaving like a
 * substring search from the front: without it `nut` would match `nutmeg`, and a
 * member who declared nuts would lose rice pudding. Words shorter than that —
 * `nut`, `soy`, `egg`, `rye` — match only exactly, and their families carry the
 * longer spellings that do the work.
 *
 * It is still deliberately over-broad in one direction: `butternut` begins with
 * `butter`, so a dairy-allergic member would lose butternut squash. That is the
 * asymmetry this whole file is built on — one lost line of suggestions against
 * one reaction — and it is stated here rather than left to be rediscovered.
 */
function covers(word: string, candidate: string): boolean {
  if (word === candidate) return true;
  return candidate.length >= 4 && word.startsWith(candidate);
}

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    // Arabic diacritics, so a member who wrote a vowelled word and a text that
    // did not are the same word. Nothing else is transliterated: matching
    // across scripts is a promise this cannot keep, and the member's own words
    // are matched literally in whichever script they used them.
    .replace(/[ً-ْ]/gu, '');
}

/**
 * A crude singular: one trailing `s`, and nothing else.
 *
 * Not a stemmer. "Mussels" → "mussel" and "eggs" → "egg" are the cases that
 * occur; "cheese" → "chees" is harmless because the plural form is added beside
 * the original rather than replacing it, so both spellings are in the set.
 */
function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}
