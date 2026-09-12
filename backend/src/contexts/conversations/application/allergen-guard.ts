import { Injectable } from '@nestjs/common';
import { AllergenGuardPort, type AllergenScan } from '../domain/chat.ports.js';

/**
 * The check that makes FR-018 a control rather than a hope.
 *
 * `coach.md` and `chat.md` both state the member's allergies as prohibitions,
 * and that instruction is worth having — but an instruction to a
 * three-billion-parameter model is a request. This is the part that holds: the
 * answer is scanned as it is written, and the stream is abandoned on the chunk
 * that first completes the word, so the member never reads it.
 *
 * ## Why the accumulated text and not the chunk
 *
 * Because a model emits "pea" and then "nut". A per-chunk check sees neither
 * word and passes both, which is the failure this class exists to prevent —
 * and it is not a rare boundary, it is where the tokeniser splits an
 * eight-letter compound. `push` therefore appends and rescans.
 *
 * ponytail: rescanning the whole accumulation on every chunk is O(n²) in the
 * answer's length. For a chat answer — a few kilobytes at a few hundred chunks
 * — that is microseconds, and the correct-first version is the one to keep
 * while the ceiling is this far away. If answers ever get long enough to
 * measure, keep a fold of the text so far plus the last few characters and
 * scan the seam rather than the whole thing.
 *
 * ## Why folding is not optional
 *
 * The member writes their allergy once, in their own words, in a form; the
 * model writes its answer in whatever case, script form and number it likes.
 * "Peanuts", "peanut butter" and "فول سوداني" are the same prohibition, and
 * Arabic makes it sharper than English does: أ إ آ are typed interchangeably
 * for ا, ة and ه are one letter to most keyboards, ى and ي are one letter to
 * most typists, tatweel (ـ) is decoration, and none of that survives a
 * `String.includes`. A guard that misses a spelling variant is a guard that
 * does not exist for the member who types that variant.
 */
@Injectable()
export class AllergenGuard extends AllergenGuardPort {
  override forMember(allergies: string[]): AllergenScan {
    const needles = buildNeedles(allergies);

    /*
     * A member who has declared nothing gets a scan that can never fire.
     *
     * Not an optimisation: it is the guarantee that this feature is invisible
     * to everybody who did not ask for it. A synonym table with no declared
     * allergy to anchor it would block the word "milk" for every member on the
     * installation, and the first symptom would be a coach that refuses to
     * discuss breakfast.
     */
    if (needles.length === 0) {
      return { push: () => null };
    }

    let accumulated = '';
    return {
      push(chunk: string): string | null {
        accumulated += chunk;
        const haystack = ` ${fold(accumulated)} `;
        for (const needle of needles) {
          // Padded on both sides, which is what "whole words only" means here:
          // the folded text is single-spaced tokens, so ` nut ` cannot match
          // inside "minute" and ` فول سوداني ` cannot match half of a longer
          // word. A `\b`-based regex would not do this job — `\b` is defined
          // over ASCII word characters, so in Arabic it matches in places that
          // are not word boundaries and fails to match at ones that are.
          if (haystack.includes(needle.folded)) return needle.declared;
        }
        return null;
      },
    };
  }
}

interface Needle {
  /** The member's own wording, for the log and for a future apology to name. */
  declared: string;
  /** ` token token ` — padded so `includes` is a whole-word test. */
  folded: string;
}

/**
 * The seeded synonym groups.
 *
 * Deliberately short and deliberately obvious. Every term added here is a term
 * the coach can no longer say to a member who declared any other member of the
 * group, so a group that is too broad costs real answers: putting "nut" in the
 * peanut group would stop the coach mentioning walnuts to somebody whose
 * problem is peanuts, and a coach that cannot name foods gets abandoned.
 *
 * Each group is a set of equivalents in both languages, so the direction the
 * member declared in does not matter: "peanut" declared in English is caught in
 * an Arabic answer, and "فول سوداني" declared in Arabic is caught in "peanut
 * butter". That symmetry is the whole reason this is a table of groups rather
 * than a list of English words with translations attached.
 *
 * ponytail: a seeded table, not a food ontology. It covers the declarations an
 * intake form actually produces; anything else still matches on the member's own
 * wording, which is the floor this can never fall below. A real allergen
 * taxonomy is a data set with a maintainer, and it belongs behind
 * `ProfileWritesPort` as structured allergens rather than as free text here.
 */
const SYNONYMS: string[][] = [
  ['peanut', 'peanuts', 'groundnut', 'goober', 'فول سوداني', 'فستق عبيد'],
  ['tree nut', 'tree nuts', 'nuts', 'مكسرات'],
  ['almond', 'almonds', 'لوز'],
  ['walnut', 'walnuts', 'جوز', 'عين جمل'],
  ['hazelnut', 'hazelnuts', 'بندق'],
  ['pistachio', 'pistachios', 'فستق'],
  ['sesame', 'tahini', 'tahina', 'سمسم', 'طحينة'],
  ['milk', 'dairy', 'lactose', 'cheese', 'لبن', 'حليب', 'ألبان', 'جبنة'],
  ['egg', 'eggs', 'بيض'],
  ['gluten', 'wheat', 'جلوتين', 'قمح'],
  ['soy', 'soya', 'soybean', 'صويا'],
  ['fish', 'سمك'],
  ['shellfish', 'shrimp', 'prawn', 'prawns', 'crab', 'جمبري', 'روبيان', 'سرطان البحر'],
  ['strawberry', 'strawberries', 'فراولة'],
];

/**
 * Every phrase worth watching for, given what the member declared.
 *
 * A declaration matches a group when the group contains it *or* when it contains
 * a group term — "allergic to peanuts" typed into a free-text field is a
 * sentence, not a word, and the member who wrote it is exactly the member who
 * most needs this to work.
 */
function buildNeedles(allergies: string[]): Needle[] {
  const needles: Needle[] = [];
  const seen = new Set<string>();

  const add = (declared: string, phrase: string) => {
    const folded = ` ${fold(phrase)} `;
    if (folded.trim().length === 0 || seen.has(folded)) return;
    seen.add(folded);
    needles.push({ declared, folded });
  };

  for (const declared of allergies) {
    const foldedDeclaration = ` ${fold(declared)} `;
    if (foldedDeclaration.trim().length === 0) continue;

    // The member's own wording first, and unconditionally: it is the one
    // spelling that is certainly right, whatever the table knows.
    add(declared, declared);

    for (const group of SYNONYMS) {
      const hit = group.some((term) => {
        const foldedTerm = ` ${fold(term)} `;
        return (
          foldedDeclaration.includes(foldedTerm) ||
          foldedTerm.includes(foldedDeclaration)
        );
      });
      if (!hit) continue;
      for (const term of group) add(declared, term);
    }
  }

  return needles;
}

/**
 * Written as escapes rather than as the characters themselves, and that is not
 * fussiness: a combining mark pasted into a source file is invisible in every
 * diff and every review, so a rule about them written literally is a rule
 * nobody can check and a stray one is a rule nobody can see. U+0300-U+036F is
 * the Latin block (a decomposed e-acute), U+064B-U+065F and U+0670 the Arabic
 * harakat, and U+0640 the tatweel - a decorative stretch with no phonetic
 * value that a keyboard inserts freely.
 */
const DIACRITICS = /[\u0300-\u036f\u064b-\u065f\u0670]/g;
const TATWEEL = /\u0640/g;

/**
 * One canonical form for a piece of text: lower case, no diacritics, folded
 * Arabic letter forms, singularised, and reduced to single-spaced tokens.
 *
 * Exported because the `cancel` intent needs exactly the same fold to match
 * "الجيم" against a stored title, and because the two are the same question —
 * "did the member mean this word" — asked about an answer and about a row. It
 * is imported from here rather than copied, and it stays here rather than
 * moving to `shared/`: `CLAUDE.md` puts a helper in `shared/` on its third
 * copy, and these two callers sit in one directory of one context, which is one
 * copy with two readers.
 */
export function fold(text: string): string {
  const normalised = text
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .toLowerCase()
    // The Arabic letter forms a keyboard produces interchangeably. Folding them
    // to one member each is what makes أنا حساس من الفراولة and
    // "انا حساس من الفراوله" the same sentence.
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    // Arabic-Indic digits, so a quantity never hides a word behind it.
    .replace(/[٠-٩]/g, (digit) =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)),
    );

  return normalised
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .map(singular)
    .join(' ');
}

/**
 * The crudest possible plural fold, and crude is right here.
 *
 * "peanuts" and "peanut" have to be one word or a declared "peanuts" misses
 * "peanut butter"; a stemmer would also fold "buttery" onto "butter", which
 * buys nothing and starts producing collisions nobody predicted. Words of three
 * letters or fewer are left alone so "gas" and "abs" survive intact.
 */
function singular(token: string): string {
  /*
   * The Arabic definite article, stripped, and this one is load-bearing.
   *
   * A model does not write "فول سوداني"; it writes "الفول السوداني", because
   * that is how the phrase appears in a sentence. `ال` is a prefix rather than
   * a word, so a whole-word scan for the bare phrase misses every answer that
   * actually mentions it — the guard would have passed its own spec and caught
   * nothing in production. Both sides of the comparison run through this same
   * function, so what matters is that the stripping is consistent, not that it
   * is grammatically discriminating: `ألبان` folding to `بان` is fine because
   * the needle folds to `بان` too.
   */
  const bare =
    token.length > 4 && token.startsWith('ال') ? token.slice(2) : token;
  if (bare.length > 4 && bare.endsWith('es')) return bare.slice(0, -2);
  if (bare.length > 3 && bare.endsWith('s')) return bare.slice(0, -1);
  return bare;
}
