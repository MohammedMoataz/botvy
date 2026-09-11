import { beforeEach, describe, expect, it } from 'vitest';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import type { Principal } from '../../shared/auth/principal.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { LinkRuleError } from './domain/link.aggregate.js';
import { LinkUrlError, normaliseLink } from './domain/url-kind.js';
import {
  AddLinkHandler,
  DailyLinkQuotaReached,
  InvalidLinkId,
} from './features/add-link/add-link.handler.js';
import {
  LinkNotFound,
  PurgeLinkHandler,
  RemoveLinkHandler,
  RestoreLinkHandler,
} from './features/remove-link/remove-link.handler.js';
import { RetryLinkHandler } from './features/retry-link/retry-link.handler.js';
import {
  InMemoryLinkRepository,
  InnerLinkStore,
} from './infrastructure/in-memory-knowledge.repositories.js';

/**
 * What a member saved, and what Botvy decided it was.
 *
 * The URL table below is T703's thirty-URL fixture, and it is the most
 * load-bearing thing in this file: normalisation is what makes FR-005 true, and
 * every one of its rules is a decision somebody could reasonably have made
 * differently. A table is the honest way to pin them, because the alternative
 * is thirty `it` blocks whose names restate their bodies.
 */

/** The Owner, for the settings writes below. */
const OWNER: Principal = { kind: 'user', id: 'owner-1', role: 'admin' };

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';
/** Client-minted UUIDv7-shaped ids: the phone saves links offline. */
const LINK_A = '0192f100-0000-7000-8000-0000000000d1';
const LINK_B = '0192f100-0000-7000-8000-0000000000d2';
const LINK_C = '0192f100-0000-7000-8000-0000000000d3';

class FixedMemberContext extends MemberContextPort {
  constructor(private readonly timezone = CAIRO) {
    super();
  }
  async clock(): Promise<MemberClock> {
    return { timezone: this.timezone };
  }
  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: [], quietHours: { from: '22:00', to: '07:00' } };
  }
}

function harness() {
  const uow = new InMemoryUnitOfWork();
  const links = new InMemoryLinkRepository(new InnerLinkStore(uow));
  // The real service over an in-memory store, so every default this spec
  // relies on is the registry's own rather than a number written here.
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const member = new FixedMemberContext();

  return {
    uow,
    links,
    settings,
    add: new AddLinkHandler(uow, links, member, settings),
    retry: new RetryLinkHandler(uow, links, settings),
    remove: new RemoveLinkHandler(uow, links),
    restore: new RestoreLinkHandler(uow, links),
    purge: new PurgeLinkHandler(uow, links),
  };
}

// --------------------------------------------------------------------- T703

describe('recognising a URL', () => {
  /**
   * Thirty URLs and what they should become.
   *
   * Grouped by the rule each one exercises rather than by kind, so a change to
   * one rule shows up as a run of failures with a shared cause instead of
   * scattered ones.
   */
  const cases: Array<[string, string, string, string | null]> = [
    // --- the shape of a page -------------------------------------------
    ['https://example.com/', 'https://example.com/', 'website', null],
    ['https://example.com', 'https://example.com/', 'website', null],
    ['https://example.com/post', 'https://example.com/post', 'article', null],
    ['https://example.com/post/', 'https://example.com/post', 'article', null],
    ['https://example.com/a/b/c', 'https://example.com/a/b/c', 'article', null],
    // A query on the root is a page: `?p=1` is how a great many blogs address
    // a post, so treating a bare origin *with* a query as the site itself
    // would collapse every one of them onto one entry.
    ['https://example.com/?p=7', 'https://example.com/?p=7', 'article', null],

    // --- the host ------------------------------------------------------
    ['https://WWW.Example.com/x', 'https://example.com/x', 'article', null],
    ['http://example.com/x', 'https://example.com/x', 'article', null],
    ['https://example.com/X', 'https://example.com/X', 'article', null],

    // --- the fragment and the query ------------------------------------
    ['https://example.com/x#section-2', 'https://example.com/x', 'article', null],
    [
      'https://example.com/x?utm_source=news&id=4',
      'https://example.com/x?id=4',
      'article',
      null,
    ],
    ['https://example.com/x?fbclid=abc', 'https://example.com/x', 'article', null],
    ['https://example.com/x?ref=friend', 'https://example.com/x', 'article', null],
    [
      'https://example.com/x?b=2&a=1',
      'https://example.com/x?a=1&b=2',
      'article',
      null,
    ],
    // `page` selects content and survives, where `ref` does not.
    [
      'https://example.com/x?page=3&gclid=z',
      'https://example.com/x?page=3',
      'article',
      null,
    ],

    // --- YouTube videos -------------------------------------------------
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'video',
      'dQw4w9WgXcQ',
    ],
    [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'video',
      'dQw4w9WgXcQ',
    ],
    [
      'https://youtu.be/dQw4w9WgXcQ?si=Ab-Cd_1',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'video',
      'dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'video',
      'dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'video',
      'dQw4w9WgXcQ',
    ],
    [
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'video',
      'dQw4w9WgXcQ',
    ],
    // Clicked from inside a playlist: the member meant the video.
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'video',
      'dQw4w9WgXcQ',
    ],

    // --- YouTube playlists ----------------------------------------------
    [
      'https://www.youtube.com/playlist?list=PLabc-123_x',
      'https://www.youtube.com/playlist?list=PLabc-123_x',
      'playlist',
      'PLabc-123_x',
    ],
    [
      'https://youtube.com/playlist?list=PLabc-123_x&si=zz',
      'https://www.youtube.com/playlist?list=PLabc-123_x',
      'playlist',
      'PLabc-123_x',
    ],

    // --- YouTube pages that are neither ---------------------------------
    // A channel is a page, and reading it as a video would send the transcript
    // reader after something that does not exist.
    [
      'https://www.youtube.com/@somechannel',
      'https://youtube.com/@somechannel',
      'article',
      null,
    ],
    [
      'https://www.youtube.com/feed/history',
      'https://youtube.com/feed/history',
      'article',
      null,
    ],
    // A watch URL with no id at all: not a video.
    ['https://www.youtube.com/watch', 'https://youtube.com/watch', 'article', null],

    // --- other hosts that look like YouTube ------------------------------
    [
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
      'article',
      null,
    ],
    [
      'https://vimeo.com/123456',
      'https://vimeo.com/123456',
      'article',
      null,
    ],
  ];

  it.each(cases)('%s', (input, url, kind, externalId) => {
    const result = normaliseLink(input);
    expect(result.url).toBe(url);
    expect(result.kind).toBe(kind);
    expect(result.externalId).toBe(externalId);
  });

  it('refuses anything that is not an http(s) address', () => {
    expect(() => normaliseLink('not a url')).toThrow(LinkUrlError);
    expect(() => normaliseLink('ftp://example.com/x')).toThrow(LinkUrlError);
    // `javascript:` would be refused by the scheme check before anything else
    // ever sees it, which matters because the URL is handed to a client.
    expect(() => normaliseLink('javascript:alert(1)')).toThrow(LinkUrlError);
    expect(() => normaliseLink(`https://example.com/${'x'.repeat(3000)}`)).toThrow(
      LinkUrlError,
    );
  });

  it('collapses two spellings of one article onto one URL', () => {
    // The whole of FR-005, stated as the property the unique index enforces.
    const fromNewsletter = normaliseLink(
      'http://WWW.example.com/piece/?utm_campaign=may&utm_source=mail#top',
    );
    const fromAFriend = normaliseLink('https://example.com/piece');
    expect(fromNewsletter.url).toBe(fromAFriend.url);
  });
});

// --------------------------------------------------------------------- T720

describe('saving a link', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it('queues it, and says what kind it is', async () => {
    const result = await h.add.handle(MEMBER, {
      id: LINK_A,
      url: 'https://example.com/split',
      tags: ['Gym', 'gym', ' strength '],
    });

    expect(result).toMatchObject({
      id: LINK_A,
      kind: 'article',
      status: 'queued',
      duplicate: false,
    });

    // `LinkAdded` is what starts the pipeline. A create that announced nothing
    // would be a link that sits in `queued` until somebody noticed.
    expect(h.uow.events.map((event) => event.name)).toEqual([
      'knowledge.LinkAdded',
    ]);
    expect(h.uow.events[0]!.payload).toMatchObject({
      linkId: LINK_A,
      url: 'https://example.com/split',
      kind: 'article',
    });

    const saved = (await h.links.findById(MEMBER, LINK_A))!;
    // Lower-cased and de-duplicated, because tags are matched against a
    // session's sport and a member who wrote "Gym" on the article and "gym" in
    // their timetable should still get the suggestion.
    expect(saved.tags).toEqual(['gym', 'strength']);
  });

  it('answers the entry they already have, and creates nothing', async () => {
    await h.add.handle(MEMBER, { id: LINK_A, url: 'https://example.com/piece' });
    h.uow.events.length = 0;

    const second = await h.add.handle(MEMBER, {
      id: LINK_B,
      url: 'http://www.example.com/piece?utm_source=x#top',
    });

    expect(second).toMatchObject({ id: LINK_A, duplicate: true });
    expect(h.uow.events).toEqual([]);
    expect(h.links.all()).toHaveLength(1);
  });

  it('lets another member save the same URL', async () => {
    // The uniqueness is per member, which is what `(userId, normalizedUrl)`
    // says and what a shared index without the `userId` would not.
    await h.add.handle(MEMBER, { id: LINK_A, url: 'https://example.com/piece' });
    const theirs = await h.add.handle(OTHER, {
      id: LINK_B,
      url: 'https://example.com/piece',
    });
    expect(theirs.duplicate).toBe(false);
  });

  it('refuses an id that is not a UUID', async () => {
    await expect(
      h.add.handle(MEMBER, { id: 'link-1', url: 'https://example.com/x' }),
    ).rejects.toThrow(InvalidLinkId);
  });

  it('refuses past the day’s quota, and leaves the queue alone', async () => {
    await h.settings.set('knowledge.maxLinksPerDay', 2, OWNER);

    await h.add.handle(MEMBER, { id: LINK_A, url: 'https://example.com/one' });
    await h.add.handle(MEMBER, { id: LINK_B, url: 'https://example.com/two' });

    await expect(
      h.add.handle(MEMBER, { id: LINK_C, url: 'https://example.com/three' }),
    ).rejects.toThrow(DailyLinkQuotaReached);

    // FR-015's second half: the ones already queued carry on.
    const queued = await h.links.nextQueued(10);
    expect(queued).toHaveLength(2);
  });

  it('does not spend the quota on a link the member already has', async () => {
    await h.settings.set('knowledge.maxLinksPerDay', 1, OWNER);
    await h.add.handle(MEMBER, { id: LINK_A, url: 'https://example.com/one' });

    // The duplicate check runs before the quota check, so re-pasting something
    // they already saved costs nothing at all.
    const again = await h.add.handle(MEMBER, {
      id: LINK_B,
      url: 'https://example.com/one',
    });
    expect(again.duplicate).toBe(true);
  });

  it('counts the member’s own day, not the server’s', async () => {
    await h.settings.set('knowledge.maxLinksPerDay', 1, OWNER);

    // A save made yesterday in Cairo does not count against today's
    // allowance. Built from `Date.now()` rather than a written date: a fixture
    // pinned to a real date is a time bomb.
    const yesterday = new Date(Date.now() - 30 * 60 * 60 * 1000);
    await h.add.handle(
      MEMBER,
      { id: LINK_A, url: 'https://example.com/one' },
      yesterday,
    );

    await expect(
      h.add.handle(MEMBER, { id: LINK_B, url: 'https://example.com/two' }),
    ).resolves.toMatchObject({ duplicate: false });
  });
});

// --------------------------------------------------------------------- T720

describe('retrying and removing', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(async () => {
    h = harness();
    await h.add.handle(MEMBER, { id: LINK_A, url: 'https://example.com/piece' });
    h.uow.events.length = 0;
  });

  it('refuses to retry something that has not failed', async () => {
    await expect(h.retry.handle(MEMBER, LINK_A)).rejects.toMatchObject({
      code: 'not_failed',
    });
  });

  it('stops at the Owner’s attempt limit', async () => {
    await h.settings.set('knowledge.maxAttempts', 2, OWNER);
    const link = (await h.links.findById(MEMBER, LINK_A))!;

    // Two genuine refusals by the source, each spending an attempt.
    await h.uow.run(async () => {
      link.beginFetch();
      link.fail('gone');
      await h.links.save(link);
    });
    expect(link.attempts).toBe(1);

    await h.retry.handle(MEMBER, LINK_A);
    await h.uow.run(async () => {
      link.beginFetch();
      link.fail('gone again');
      await h.links.save(link);
    });
    expect(link.attempts).toBe(2);

    await expect(h.retry.handle(MEMBER, LINK_A)).rejects.toMatchObject({
      code: 'attempts_exhausted',
    });
  });

  it('tombstones rather than deleting, and takes a playlist’s videos with it', async () => {
    const parent = (await h.links.findById(MEMBER, LINK_A))!;
    // Stand in for an expanded playlist without running the expander: this case
    // is about the cascade, and the expander has its own.
    const playlist = await h.add.handle(MEMBER, {
      id: LINK_B,
      url: 'https://www.youtube.com/playlist?list=PLabc',
    });
    await h.add.handle(MEMBER, {
      id: LINK_C,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      parentLinkId: playlist.id,
    });

    const result = await h.remove.handle(MEMBER, playlist.id);
    expect(result.children).toBe(1);

    const child = (await h.links.findById(MEMBER, LINK_C))!;
    expect(child.isDeleted).toBe(true);
    // A tombstone, not a removal: the client's delete sweep runs only against a
    // full snapshot, so a row removed outright would stay on every device.
    expect(h.links.all()).toHaveLength(3);
    // And the unrelated link is untouched.
    expect(parent.isDeleted).toBe(false);
  });

  it('frees the URL once the entry is deleted', async () => {
    await h.remove.handle(MEMBER, LINK_A);
    // FR-005 is about saving the same link twice, not about ever having saved
    // it: a member who removed an article and saves it again is asking to read
    // it again.
    const again = await h.add.handle(MEMBER, {
      id: LINK_B,
      url: 'https://example.com/piece',
    });
    expect(again.duplicate).toBe(false);
  });

  it('restores, and refuses to erase anything live', async () => {
    await h.remove.handle(MEMBER, LINK_A);
    await h.restore.handle(MEMBER, LINK_A);
    expect((await h.links.findById(MEMBER, LINK_A))!.isDeleted).toBe(false);

    await expect(h.purge.handle(MEMBER, LINK_A)).rejects.toThrow(LinkRuleError);

    await h.remove.handle(MEMBER, LINK_A);
    await h.purge.handle(MEMBER, LINK_A);
    expect(await h.links.findById(MEMBER, LINK_A)).toBeNull();
  });

  it('does not find another member’s link', async () => {
    await expect(h.remove.handle(OTHER, LINK_A)).rejects.toThrow(LinkNotFound);
  });
});
