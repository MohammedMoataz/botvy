import { describe, expect, it } from 'vitest';
import { classifyCheckin } from '../src/coaching/checkin-classifier.js';

describe('classifyCheckin', () => {
  it('reads plain affirmatives as adhered', () => {
    for (const reply of ['yes', 'Yep', 'yeah did legs', 'done ✅', 'trained and ate clean']) {
      expect(classifyCheckin(reply), reply).toBe('adhered');
    }
  });

  it('reads plain negatives as missed', () => {
    for (const reply of ['no', 'Nope', 'nah, skipped today', 'missed it', 'I did not go']) {
      expect(classifyCheckin(reply), reply).toBe('missed');
    }
  });

  it('lets negation win over an affirmative word in the same sentence', () => {
    // Getting this backwards would silently inflate the streak the user
    // is being coached on.
    expect(classifyCheckin("yeah I didn't manage it")).toBe('missed');
    expect(classifyCheckin('yes but I skipped the gym')).toBe('missed');
  });

  it('does not let a negative word hiding inside another word override a real answer', () => {
    // "nothing" contains "not"; anchoring only the start of the word made
    // this read as a miss, which would have corrupted the user's streak.
    expect(classifyCheckin('nothing went wrong, trained hard')).toBe('adhered');
    // With no marker either way, it stays unclear rather than guessing.
    expect(classifyCheckin('nothing much to report')).toBe('unclear');
  });

  it('handles Arabic replies', () => {
    expect(classifyCheckin('ايوه عملت التمرين')).toBe('adhered');
    expect(classifyCheckin('لا فاتني النهاردة')).toBe('missed');
  });

  it('does not let an Arabic negative hiding inside another word win', () => {
    // JS \b is defined against [A-Za-z0-9_], so Arabic used to fall back to a
    // bare substring test — and 'ما' sits inside 'تمام', which is itself an
    // affirmative. Negation wins, so a user answering "fine, done" was logged
    // as having missed the day.
    expect(classifyCheckin('تمام')).toBe('adhered');
    expect(classifyCheckin('ماشي خلصت')).toBe('adhered');
    // A real standalone negative still reads as one.
    expect(classifyCheckin('ما عملتش حاجة')).toBe('missed');
  });

  it('reports unclear rather than guessing, so the caller can ask the model', () => {
    for (const reply of ['', '   ', 'what was the plan again?', 'hmm']) {
      expect(classifyCheckin(reply), JSON.stringify(reply)).toBe('unclear');
    }
  });
});
