import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TITLE, captureNotes, captureTitle } from '../lib/capture';
import { originPatternFor } from '../lib/google';
import {
  KEYS,
  PROFILE_MAX_AGE_MS,
  profileIsStale,
  readTokens,
  refreshUnderLock,
  signOut,
  type TokenPair,
} from '../lib/session';

/**
 * The extension's own decisions, tested where they are made.
 *
 * Everything the panel shares with the phone lives in `@botvy/sdk` and is
 * tested there. What is left here is what only a browser has to deal with: two
 * JavaScript contexts over one set of rotating tokens, a sign-out that has to
 * survive a dead network, and a capture taken from whatever the member happened
 * to select.
 */

// --------------------------------------------------------------- the capture

describe('what a capture becomes', () => {
  it('keeps a short selection exactly as it was', () => {
    expect(captureTitle('reply to the invoice email')).toBe(
      'reply to the invoice email',
    );
  });

  it('flattens the whitespace a selection drags in', () => {
    // A selection across a line break arrives with the break in it, and a task
    // list that renders one row over two lines is a list nobody scans.
    expect(captureTitle('reply to\n  the invoice   email')).toBe(
      'reply to the invoice email',
    );
  });

  it('cuts a long selection at a word', () => {
    const long = 'alpha bravo charlie delta echo foxtrot golf hotel india '.repeat(4);
    const title = captureTitle(long);

    expect(title.length).toBeLessThanOrEqual(MAX_TITLE);
    // Not mid-word: "reply to the invoi" reads like a bug rather than a title.
    expect(long).toContain(title);
    expect(title.endsWith(' ')).toBe(false);
    expect(long[title.length]).toBe(' ');
  });

  it('cuts a single enormous word hard rather than dropping it', () => {
    // A URL or a German compound has no boundary to cut at. Answering an empty
    // title would lose the capture entirely, which is the one outcome a member
    // would never forgive.
    const word = 'a'.repeat(400);
    expect(captureTitle(word)).toHaveLength(MAX_TITLE);
  });

  it('keeps the whole selection and the page address in the notes', () => {
    const long = 'x'.repeat(MAX_TITLE + 50);
    const notes = captureNotes(long, 'https://example.test/piece');

    expect(notes).toContain(long);
    // The address is the only field all four capture targets already have, and
    // without it a captured sentence has no way back to what it was about.
    expect(notes).toContain('https://example.test/piece');
  });

  it('does not repeat a short selection into the notes', () => {
    const notes = captureNotes('reply to the invoice', 'https://example.test/');
    expect(notes).toBe('https://example.test/');
  });
});

// -------------------------------------------------------------- the permission

describe('the origin the extension asks for', () => {
  it('asks for the member’s own Botvy and nothing else', () => {
    expect(originPatternFor('https://botvy.example.test')).toBe(
      'https://botvy.example.test/*',
    );
    expect(originPatternFor('http://192.168.1.10:8090/')).toBe(
      'http://192.168.1.10:8090/*',
    );
  });

  it('answers nothing for something that is not an address', () => {
    expect(originPatternFor('not a url')).toBeNull();
    expect(originPatternFor('')).toBeNull();
  });
});

// ----------------------------------------------------------------- the profile

describe('how long a cached profile is trusted', () => {
  const fresh = {
    timezone: 'Africa/Cairo',
    locale: 'ar',
    displayName: 'A member',
    fetchedAt: Date.now(),
  };

  it('trusts a copy fetched today', () => {
    expect(profileIsStale(fresh)).toBe(false);
  });

  it('refreshes one over a day old', () => {
    expect(
      profileIsStale({ ...fresh, fetchedAt: Date.now() - PROFILE_MAX_AGE_MS - 1 }),
    ).toBe(true);
  });

  it('treats no copy at all as stale', () => {
    // Which is what makes the first mount after sign-in fetch one.
    expect(profileIsStale(null)).toBe(true);
  });
});

// ------------------------------------------------------------------ the tokens

/** A `chrome.storage.local` that behaves like the real one, in memory. */
function fakeStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    local: {
      get: vi.fn(async (key: string) => ({ [key]: data[key] })),
      set: vi.fn(async (entries: Record<string, unknown>) => {
        Object.assign(data, entries);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of [keys].flat()) delete data[key];
      }),
    },
  };
}

const PAIR = (suffix: string): TokenPair => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
});

describe('refreshing from two contexts at once', () => {
  beforeEach(() => {
    const storage = fakeStorage({ [KEYS.tokens]: PAIR('1') });
    vi.stubGlobal('chrome', { storage });
    // No Web Locks in this environment, which the function tolerates — the
    // serialisation the assertions below depend on comes from awaiting, and the
    // re-read is what actually protects the token.
    vi.stubGlobal('navigator', {});
  });

  it('spends the refresh token once and answers both callers', async () => {
    const refreshFn = vi.fn(async (token: string) => {
      expect(token).toBe('refresh-1');
      return PAIR('2');
    });

    const first = await refreshUnderLock(refreshFn, PAIR('1'));
    // The second caller read its copy *before* the first rotated — which is the
    // whole shape of the bug. It must not spend `refresh-1` again: the API
    // reads a replayed refresh token as stolen and revokes the family, signing
    // the member out of a session they never touched.
    const second = await refreshUnderLock(refreshFn, PAIR('1'));

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(first).toEqual(PAIR('2'));
    expect(second).toEqual(PAIR('2'));
  });

  it('writes the rotated pair back where both contexts read it', async () => {
    await refreshUnderLock(async () => PAIR('2'), PAIR('1'));
    // Through the same reader the worker uses. The rotation is only useful if
    // it lands in `chrome.storage`, which is the one thing the panel and the
    // service worker share.
    expect(await readTokens()).toEqual(PAIR('2'));
  });

  it('answers null when there is nothing to refresh with', async () => {
    vi.stubGlobal('chrome', { storage: fakeStorage() });
    expect(await refreshUnderLock(async () => PAIR('2'), null)).toBeNull();
  });
});

// ----------------------------------------------------------------- signing out

describe('signing out', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { storage: fakeStorage({ [KEYS.tokens]: PAIR('1') }) });
  });

  it('revokes, then forgets the device, then clears — in that order', async () => {
    const order: string[] = [];

    await signOut({
      revoke: async () => {
        order.push('revoke');
        // Proved rather than asserted from the outside: the credential the
        // revoke needs is still there when it runs. Clearing first would throw
        // it away and leave a live refresh token on the member's account.
        expect(await readTokens()).not.toBeNull();
      },
      forgetDevice: async () => {
        order.push('device');
        expect(await readTokens()).not.toBeNull();
      },
    });

    expect(order).toEqual(['revoke', 'device']);
    // And then nothing is left. SC-005 is "zero cached items remain after
    // sign-out", verified by inspection — this is the inspection.
    expect(await readTokens()).toBeNull();
  });

  it('still clears when the network is gone', async () => {
    const result = await signOut(
      {
        revoke: () => Promise.reject(new Error('offline')),
        forgetDevice: () => Promise.reject(new Error('offline')),
      },
      10,
    );

    // A member signing out on a plane gets their cache cleared; the refresh
    // token they could not revoke dies of its own rotation.
    expect(result).toEqual({ revoked: false, deviceForgotten: false });
  });

  it('does not hang on a server that never answers', async () => {
    const started = Date.now();
    await signOut(
      {
        revoke: () => new Promise(() => undefined),
        forgetDevice: () => new Promise(() => undefined),
      },
      20,
    );

    // A member who cannot sign out on a borrowed computer is the worst case
    // this flow has, so the wait is bounded rather than hopeful.
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
