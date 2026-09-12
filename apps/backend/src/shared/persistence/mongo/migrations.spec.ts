import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The migration files, read from disk (P11).
 *
 * Walking up rather than counting `..`, for the reason `CLAUDE.md` records
 * about template loading: the count agrees between `src/` and `dist/` only by
 * accident of the build layout and breaks silently.
 */
function migrationsDir(): string {
  let here = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 8; up += 1) {
    const candidate = join(here, 'migrations', 'mongo');
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      here = dirname(here);
    }
  }
  throw new Error('could not find migrations/mongo by walking up from this spec');
}

const DIR = migrationsDir();
const FILES = readdirSync(DIR).filter((name) => name.endsWith('.cjs'));

describe('every Mongo migration', () => {
  it('there are some, so a broken path cannot pass as "all clear"', () => {
    // Without this, a wrong directory finds zero files and every case below
    // passes vacuously — which is the failure mode of any test that iterates
    // over something it discovered rather than something it was given.
    expect(FILES.length).toBeGreaterThan(10);
  });

  /**
   * The one MongoDB refuses outright.
   *
   * The only index whose key pattern is exactly `_id` is the automatic
   * `{ _id: 1 }`. Anything else — `{ _id: -1 }` most temptingly — is answered
   * with "The field 'key' for an _id index must be {_id: 1}", and because
   * migrate-mongo applies files in order and stops at the first failure, one
   * such line blocks **every migration after it**.
   *
   * P10 shipped exactly that. It went unnoticed because the installation it was
   * written on already had its schema and the container serving it predated the
   * file, so the migration was never run; a fresh install was the first thing to
   * execute it and it failed immediately, taking the whole Mongo half of the
   * schema with it. This is the check that would have caught it in CI.
   *
   * A compound key ending in `_id` is fine and is not matched here — the
   * restriction is on an index whose *whole* key is `_id`.
   */
  it('never indexes `_id` on its own', () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      const source = readFileSync(join(DIR, file), 'utf8');
      // `createIndex({ _id: ... })` with nothing else inside the braces.
      const solitary = /createIndex\(\s*\{\s*_id\s*:\s*[^},]+\s*\}/g;
      for (const match of source.matchAll(solitary)) {
        offenders.push(`${file}: ${match[0].replace(/\s+/g, ' ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the guard would fire on the line that actually shipped', () => {
    // Pinning the matcher against the real defect, because a rule nobody has
    // seen fire is a comment. Same reasoning as the lint-rule probe in
    // `CLAUDE.md`: write the thing that should fail and check that it does.
    const shipped = `await db.collection('audit_log').createIndex({ _id: -1 }, { name: 'audit_recent_id' });`;
    const solitary = /createIndex\(\s*\{\s*_id\s*:\s*[^},]+\s*\}/;

    expect(solitary.test(shipped)).toBe(true);
    // And does not fire on the compound indexes beside it, which are legal.
    expect(
      solitary.test(`createIndex({ action: 1, _id: -1 }, { name: 'audit_by_action' })`),
    ).toBe(false);
  });

  it('exports both `up` and `down`, so a file is never half a migration', async () => {
    for (const file of FILES) {
      const loaded = (await import(`file://${join(DIR, file)}`)) as {
        default?: { up?: unknown; down?: unknown };
      };
      const shape = loaded.default ?? loaded;
      expect(typeof (shape as { up?: unknown }).up, `${file} up`).toBe('function');
      expect(typeof (shape as { down?: unknown }).down, `${file} down`).toBe('function');
    }
  });
});
