import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import type { Principal } from '../../shared/auth/principal.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import type { SyncChange } from '../../shared/persistence/ports/sync-change.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { Link } from './domain/link.aggregate.js';
import {
  InMemoryLinkRepository,
  InnerLinkStore,
} from './infrastructure/in-memory-knowledge.repositories.js';
import {
  LINK_APPLY_ORDER,
  LinkSyncAdapter,
} from './infrastructure/knowledge-sync.adapter.js';

/**
 * Links over `/sync`: what the phone may write, and what it may not.
 *
 * The interesting columns on a link — `status`, `attempts`, `failReason`,
 * `docId` — are the *server's* record of work it did. A client that could push
 * them could tell the server it had read an article itself, so the push is
 * add-and-remove and an edit is refused as `invalid` rather than ignored.
 * `invalid` and not `stale`, because a stale verdict tells the phone to
 * overwrite and retry, and against a rule that will never accept an edit it
 * would retry for ever.
 */

/** The Owner, for the settings writes below. */
const OWNER: Principal = { kind: 'user', id: 'owner-1', role: 'admin' };

const MEMBER = 'member-1';
const LINK_A = '0192f100-0000-7000-8000-000000000b01';
const LINK_B = '0192f100-0000-7000-8000-000000000b02';
const LINK_C = '0192f100-0000-7000-8000-000000000b03';

class FixedMemberContext extends MemberContextPort {
  async clock(): Promise<MemberClock> {
    return { timezone: 'Africa/Cairo' };
  }
  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: [], quietHours: { from: '22:00', to: '07:00' } };
  }
}

function harness() {
  const uow = new InMemoryUnitOfWork();
  const links = new InMemoryLinkRepository(new InnerLinkStore(uow));
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  return {
    uow,
    links,
    settings,
    adapter: new LinkSyncAdapter(uow, links, new FixedMemberContext(), settings),
  };
}

function change(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    id: LINK_A,
    op: 'create',
    updatedAt: new Date(),
    baseUpdatedAt: null,
    fields: { url: 'https://example.com/piece', tags: ['gym'] },
    ...overrides,
  };
}

async function seed(
  h: ReturnType<typeof harness>,
  id: string,
  url: string,
): Promise<Link> {
  const link = Link.save({
    id,
    userId: MEMBER,
    url,
    normalizedUrl: url,
    kind: 'article',
    externalId: null,
    parentLinkId: null,
    title: null,
    tags: [],
    addedAt: new Date(),
    createdAt: new Date(),
  });
  await h.uow.run(() => h.links.save(link));
  h.uow.events.length = 0;
  return link;
}

describe('links over sync', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(() => {
    h = harness();
  });

  it('sits where the contract puts it', () => {
    // After Training's workouts at 39 and before the chat at 50, with 43 and
    // 44 left for P8's meals.
    expect(LINK_APPLY_ORDER).toBe(45);
    expect(h.adapter.entity).toBe('links');
  });

  it('pulls the state and the document pointer, never the document', async () => {
    const link = await seed(h, LINK_A, 'https://example.com/piece');
    link.beginFetch();
    link.beginExtract('A piece');
    link.beginSummarise();
    link.finish('doc-1');
    await h.uow.run(() => h.links.save(link));

    const [row] = (await h.adapter.pull(MEMBER, null)) as Array<
      Record<string, unknown>
    >;
    expect(row).toMatchObject({
      id: LINK_A,
      status: 'done',
      title: 'A piece',
      // The pointer travels so the phone knows a summary exists to fetch; the
      // document is up to sixty thousand characters and no list shows it.
      docId: 'doc-1',
    });
    expect(row).not.toHaveProperty('summary');
    expect(row).not.toHaveProperty('text');
  });

  it('carries tombstones, because a delta has no other way to delete', async () => {
    const link = await seed(h, LINK_A, 'https://example.com/piece');
    await h.uow.run(async () => {
      link.tombstone();
      await h.links.save(link);
    });

    const rows = (await h.adapter.pull(MEMBER, null)) as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deletedAt).not.toBeNull();
  });

  it('takes a create the member made offline, on their own clock', async () => {
    const yesterday = new Date(Date.now() - 20 * 60 * 60 * 1000);
    const outcome = await h.adapter.apply(
      MEMBER,
      change({ updatedAt: yesterday }),
      new Date(),
    );
    expect(outcome).toEqual({ applied: true, id: LINK_A });

    const saved = (await h.links.findById(MEMBER, LINK_A))!;
    // The moment they saved it, not the moment it reached us — the quota that
    // counts their day should count it on the day they did it.
    expect(saved.addedAt.getTime()).toBe(yesterday.getTime());
    expect(saved.status).toBe('queued');
    expect(h.uow.events.map((event) => event.name)).toEqual([
      'knowledge.LinkAdded',
    ]);
  });

  it('normalises a pushed URL, so the phone and the API agree', async () => {
    await h.adapter.apply(
      MEMBER,
      change({ fields: { url: 'http://WWW.example.com/piece?utm_source=x#top' } }),
      new Date(),
    );
    expect((await h.links.findById(MEMBER, LINK_A))!.url).toBe(
      'https://example.com/piece',
    );
  });

  it('refuses a create for a URL the member already has', async () => {
    await seed(h, LINK_A, 'https://example.com/piece');

    // The unique index would refuse the insert, so it is refused here with a
    // reason the phone can act on rather than as a 500 from the driver.
    const outcome = await h.adapter.apply(
      MEMBER,
      change({ id: LINK_B, fields: { url: 'https://example.com/piece' } }),
      new Date(),
    );
    expect(outcome).toMatchObject({
      applied: false,
      rejection: { entity: 'links', id: LINK_B, reason: 'invalid' },
    });
  });

  it('refuses a create with no readable URL', async () => {
    const outcome = await h.adapter.apply(
      MEMBER,
      change({ fields: { url: 'not a url' } }),
      new Date(),
    );
    expect(outcome).toMatchObject({ applied: false });
    expect(await h.links.findById(MEMBER, LINK_A)).toBeNull();
  });

  it('enforces the daily quota on this path too', async () => {
    // A create arriving in a batch is still a member saving a link. A path
    // that skipped FR-015 would be the way round it.
    await h.settings.set('knowledge.maxLinksPerDay', 1, OWNER);
    await h.adapter.apply(MEMBER, change(), new Date());

    const refused = await h.adapter.apply(
      MEMBER,
      change({ id: LINK_B, fields: { url: 'https://example.com/two' } }),
      new Date(),
    );
    expect(refused).toMatchObject({
      applied: false,
      // `invalid`, never `stale`: retrying tomorrow is the member's decision,
      // and a stale verdict would put the phone in a loop against a rule it
      // can never satisfy by overwriting anything.
      rejection: { reason: 'invalid' },
    });
  });

  it('refuses an edit outright', async () => {
    await seed(h, LINK_A, 'https://example.com/piece');
    const outcome = await h.adapter.apply(
      MEMBER,
      change({
        op: 'update',
        baseUpdatedAt: (await h.links.findById(MEMBER, LINK_A))!.updatedAt,
        fields: { status: 'done', attempts: 99 },
      }),
      new Date(),
    );

    expect(outcome).toMatchObject({
      applied: false,
      rejection: { reason: 'invalid' },
    });
    const untouched = (await h.links.findById(MEMBER, LINK_A))!;
    expect(untouched.status).toBe('queued');
    expect(untouched.attempts).toBe(0);
  });

  it('takes a delete, a restore and a purge', async () => {
    const link = await seed(h, LINK_A, 'https://example.com/piece');

    await h.adapter.apply(
      MEMBER,
      change({ op: 'delete', baseUpdatedAt: link.updatedAt }),
      new Date(),
    );
    expect((await h.links.findById(MEMBER, LINK_A))!.isDeleted).toBe(true);

    await h.adapter.apply(
      MEMBER,
      change({
        op: 'restore',
        baseUpdatedAt: (await h.links.findById(MEMBER, LINK_A))!.updatedAt,
      }),
      new Date(),
    );
    expect((await h.links.findById(MEMBER, LINK_A))!.isDeleted).toBe(false);

    await h.adapter.apply(
      MEMBER,
      change({
        op: 'delete',
        baseUpdatedAt: (await h.links.findById(MEMBER, LINK_A))!.updatedAt,
      }),
      new Date(),
    );
    await h.adapter.apply(
      MEMBER,
      change({
        op: 'purge',
        baseUpdatedAt: (await h.links.findById(MEMBER, LINK_A))!.updatedAt,
      }),
      new Date(),
    );
    expect(await h.links.findById(MEMBER, LINK_A)).toBeNull();
  });

  it('does not let one member’s push reach another member’s row', async () => {
    await seed(h, LINK_C, 'https://example.com/theirs');
    // From the adapter's point of view a foreign id and a never-seen id are
    // identical, so the push lands as a create under the *pusher's* member —
    // which is what the scoped filter guarantees and what the Mongo base
    // enforces again with `ForeignRowError`.
    const outcome = await h.adapter.apply(
      'member-2',
      change({ id: LINK_C, fields: { url: 'https://example.com/mine' } }),
      new Date(),
    );
    expect(outcome).toEqual({ applied: true, id: LINK_C });
    expect((await h.links.findById(MEMBER, LINK_C))!.url).toBe(
      'https://example.com/theirs',
    );
  });
});
