import { describe, expect, it } from 'vitest';
import { resolveConflict } from './sync-change.js';

/**
 * The conflict table from `contracts/sync.md`, row by row.
 *
 * It is one function and one spec because five entities apply the same rule,
 * and five copies would be five chances to get the clamp backwards. Every
 * fixture is relative to a `now` chosen here rather than to a real date.
 */
const NOW = new Date('2026-09-10T12:00:00.000Z');
const server = (updatedAt: Date, deletedAt: Date | null = null) => ({
  updatedAt,
  deletedAt,
});
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);
const minutesAhead = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe('the sync conflict rule', () => {
  it('accepts a create when the server has no row', () => {
    // The ordinary offline case: the phone minted an id and is telling us
    // about it for the first time.
    const verdict = resolveConflict(
      { op: 'create', updatedAt: minutesAgo(5), baseUpdatedAt: null },
      null,
      NOW,
    );
    expect(verdict).toEqual({ accept: true });
  });

  it('refuses anything but a create when the server has no row', () => {
    // The client is editing something that has been erased. `gone` rather than
    // `stale`, because there is nothing to overwrite the local copy with — the
    // client deletes it instead of retrying.
    for (const op of ['update', 'delete', 'restore'] as const) {
      expect(
        resolveConflict(
          { op, updatedAt: minutesAgo(5), baseUpdatedAt: null },
          null,
          NOW,
        ),
      ).toEqual({
        accept: false,
        reason: 'gone',
      });
    }
  });

  it('refuses a purge of a row that is not a tombstone', () => {
    // Erasing a live row is data loss dressed as housekeeping.
    const verdict = resolveConflict(
      { op: 'purge', updatedAt: minutesAgo(1), baseUpdatedAt: minutesAgo(1) },
      server(minutesAgo(1)),
      NOW,
    );
    expect(verdict).toEqual({ accept: false, reason: 'not_deleted' });
  });

  it('accepts a purge of a tombstone', () => {
    const deletedAt = minutesAgo(60);
    const verdict = resolveConflict(
      { op: 'purge', updatedAt: deletedAt, baseUpdatedAt: deletedAt },
      server(deletedAt, deletedAt),
      NOW,
    );
    expect(verdict).toEqual({ accept: true });
  });

  it('accepts on a matching base without consulting any clock', () => {
    // The ordinary case, and the reason `baseUpdatedAt` is carried at all: a
    // device that has not fallen behind never has its wall clock judged.
    //
    // The `updatedAt` here is deliberately absurd — three days in the past, so
    // a clock comparison would refuse it. The base matches, so no comparison
    // happens.
    const serverUpdatedAt = minutesAgo(30);
    const verdict = resolveConflict(
      {
        op: 'update',
        updatedAt: minutesAgo(4320),
        baseUpdatedAt: new Date(serverUpdatedAt),
      },
      server(serverUpdatedAt),
      NOW,
    );
    expect(verdict).toEqual({ accept: true });
  });

  it('accepts the newer edit when the base has moved on', () => {
    // Two devices edited the same row. The one whose edit is later wins.
    const verdict = resolveConflict(
      { op: 'update', updatedAt: minutesAgo(1), baseUpdatedAt: minutesAgo(60) },
      server(minutesAgo(30)),
      NOW,
    );
    expect(verdict).toEqual({ accept: true });
  });

  it('refuses the older edit when the base has moved on', () => {
    const verdict = resolveConflict(
      {
        op: 'update',
        updatedAt: minutesAgo(45),
        baseUpdatedAt: minutesAgo(60),
      },
      server(minutesAgo(30)),
      NOW,
    );
    expect(verdict).toEqual({ accept: false, reason: 'stale' });
  });

  it('clamps a client clock set to the future, so it cannot win every conflict', () => {
    // A handset whose clock reads 2099 would otherwise be the newest edit for
    // ever — every conflict it entered, against every device, indefinitely.
    // Clamped to the server's `now`, it is judged as an edit made this instant,
    // which is the most generous honest reading.
    const verdict = resolveConflict(
      {
        op: 'update',
        updatedAt: new Date('2099-01-01T00:00:00.000Z'),
        baseUpdatedAt: minutesAgo(60),
      },
      // The server row is newer than `now`, which can only be true because
      // some *other* future-dated client already won here. The clamp means the
      // 2099 push does not automatically beat it.
      server(minutesAhead(10)),
      NOW,
    );
    expect(verdict).toEqual({ accept: false, reason: 'stale' });
  });

  it('accepts an edit exactly as old as the server row', () => {
    // `>=`, not `>`. The two are the same version by any reading, and refusing
    // would send the phone a `stale` for a row it already agrees about — which
    // it would then overwrite with an identical copy and push again.
    const at = minutesAgo(30);
    const verdict = resolveConflict(
      { op: 'update', updatedAt: new Date(at), baseUpdatedAt: minutesAgo(90) },
      server(at),
      NOW,
    );
    expect(verdict).toEqual({ accept: true });
  });

  it('treats a delete as an ordinary write for conflict purposes', () => {
    // A delete is a write to `deletedAt` and competes like any other. A stale
    // delete losing to a newer edit is correct: the member edited the row on
    // one device after deleting it on another, and the edit is the later
    // intention.
    const verdict = resolveConflict(
      {
        op: 'delete',
        updatedAt: minutesAgo(45),
        baseUpdatedAt: minutesAgo(60),
      },
      server(minutesAgo(30)),
      NOW,
    );
    expect(verdict).toEqual({ accept: false, reason: 'stale' });
  });
});
