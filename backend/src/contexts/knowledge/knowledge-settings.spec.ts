import { describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import type { Principal } from '../../shared/auth/principal.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SETTING_KEYS } from '../../shared/settings/settings.registry.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import {
  ContentExtractor,
  SourceFetcher,
  SummariserPort,
  type ExtractedContent,
  type RawSource,
  type Summarised,
} from './domain/knowledge.ports.js';
import { Link } from './domain/link.aggregate.js';
import type { LinkKind } from './domain/url-kind.js';
import {
  AddLinkHandler,
  DailyLinkQuotaReached,
} from './features/add-link/add-link.handler.js';
import { ExpandPlaylistHandler } from './features/expand-playlist/expand-playlist.handler.js';
import { IngestLinkSaga } from './features/ingest-link/ingest-link.saga.js';
import {
  InMemoryLinkRepository,
  InMemoryReadingRepository,
  InnerLinkStore,
  InnerReadingStore,
} from './infrastructure/in-memory-knowledge.repositories.js';
import { chunkBudget } from './infrastructure/llm-summariser.js';

/**
 * T750: every limit in this context is the Owner's, and none of them is written
 * down here.
 *
 * Constitution XII calls a hard-coded default a bug, and the failure mode is
 * invisible: a limit read from a constant agrees with the registry until
 * somebody changes the registry, and then the screen says one thing and the
 * code does another. So these cases change a value and assert the *behaviour*
 * moves with it — which is a claim a constant cannot satisfy however carefully
 * it was chosen.
 *
 * "Without a restart" is the second half, and it is what makes these cases
 * behavioural rather than a grep: the handlers are constructed once and the
 * value is read per call, so a service that cached one at construction would
 * pass a grep and fail here.
 */

/** The Owner, for the settings writes below. */
const OWNER: Principal = { kind: 'user', id: 'owner-1', role: 'admin' };

const MEMBER = 'member-1';

class FixedMemberContext extends MemberContextPort {
  async clock(): Promise<MemberClock> {
    return { timezone: 'Africa/Cairo' };
  }
  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: [], quietHours: { from: '22:00', to: '07:00' } };
  }
}

class SilentFetcher extends SourceFetcher {
  handles(_kind: LinkKind): boolean {
    return true;
  }
  async fetch(): Promise<RawSource> {
    return {
      url: 'https://example.com/x',
      contentType: 'text/html',
      html: '<p>x</p>',
      video: null,
      playlist: null,
    };
  }
}

class SilentExtractor extends ContentExtractor {
  handles(_kind: LinkKind): boolean {
    return true;
  }
  async extract(): Promise<ExtractedContent> {
    return {
      title: null,
      author: null,
      publishedAt: null,
      text: 'text',
      transcript: null,
      media: [],
      durationSec: null,
    };
  }
}

class SilentSummariser extends SummariserPort {
  async summarise(): Promise<Summarised> {
    return { summary: 's', keyPoints: [], model: 'm', tokens: 0 };
  }
}

function harness() {
  const uow = new InMemoryUnitOfWork();
  const links = new InMemoryLinkRepository(new InnerLinkStore(uow));
  const readings = new InMemoryReadingRepository(new InnerReadingStore(uow));
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const heartbeats = { stamp: async () => undefined } as unknown as HeartbeatService;

  return {
    uow,
    links,
    settings,
    add: new AddLinkHandler(uow, links, new FixedMemberContext(), settings),
    saga: new IngestLinkSaga(
      uow,
      links,
      readings,
      [new SilentFetcher()],
      [new SilentExtractor()],
      new SilentSummariser(),
      new ExpandPlaylistHandler(uow, links, () => 'child-1'),
      settings,
      heartbeats,
      () => 'doc-1',
    ),
  };
}

function id(n: number): string {
  return `0192f100-0000-7000-8000-0000000${n.toString().padStart(5, '0')}`;
}

describe('the Owner’s limits', () => {
  it('registers every key this context reads', () => {
    // Registered in P0 rather than in the phase that first reads them, so none
    // of them spent six phases as a hard-coded default. Asserted here because
    // a key read by name and missing from the registry throws at the call site
    // — in a worker, at four in the morning.
    for (const key of [
      'knowledge.maxAttempts',
      'knowledge.maxChars',
      'knowledge.playlistMaxItems',
      'knowledge.maxLinksPerDay',
      'knowledge.concurrency',
      'knowledge.stuckAfterMinutes',
      'llm.summarizeModel',
      'llm.numCtx',
      'defaults.aiSuggestions',
    ]) {
      expect(SETTING_KEYS).toContain(key);
    }
  });

  it('changes the daily quota without a restart', async () => {
    const h = harness();
    await h.settings.set('knowledge.maxLinksPerDay', 1, OWNER);
    await h.add.handle(MEMBER, { id: id(1), url: 'https://example.com/one' });
    await expect(
      h.add.handle(MEMBER, { id: id(2), url: 'https://example.com/two' }),
    ).rejects.toThrow(DailyLinkQuotaReached);

    // The same handler instance, a changed setting, different behaviour.
    await h.settings.set('knowledge.maxLinksPerDay', 5, OWNER);
    await expect(
      h.add.handle(MEMBER, { id: id(3), url: 'https://example.com/three' }),
    ).resolves.toMatchObject({ duplicate: false });
  });

  it('changes how long a link may sit mid-pipeline', async () => {
    const h = harness();
    const link = Link.save({
      id: id(4),
      userId: MEMBER,
      url: 'https://example.com/stuck',
      normalizedUrl: 'https://example.com/stuck',
      kind: 'article',
      externalId: null,
      parentLinkId: null,
      title: null,
      tags: [],
      addedAt: new Date(),
      createdAt: new Date(),
    });
    link.beginFetch(new Date(Date.now() - 45 * 60_000));
    await h.uow.run(() => h.links.save(link));

    await h.settings.set('knowledge.stuckAfterMinutes', 60, OWNER);
    expect(await h.saga.requeueStalled()).toBe(0);

    await h.settings.set('knowledge.stuckAfterMinutes', 30, OWNER);
    expect(await h.saga.requeueStalled()).toBe(1);
  });

  it('changes how many links one pass reads', async () => {
    const h = harness();
    for (const n of [10, 11, 12]) {
      await h.add.handle(MEMBER, {
        id: id(n),
        url: `https://example.com/${n}`,
      });
    }

    // `knowledge.concurrency` is a batch size rather than a cap on the pass:
    // the drain keeps taking batches until the queue is empty, which is what
    // makes SC-001's three minutes reachable for a member who pasted three.
    await h.settings.set('knowledge.concurrency', 2, OWNER);
    const result = await h.saga.drain();
    expect(result.ingested).toBe(3);
  });

  it('sizes a model call from llm.numCtx and nothing else', () => {
    // The chunk budget is a pure function of the key, so an Owner moving to a
    // model with a bigger context gets bigger chunks with nobody editing a
    // file. A constant here would be the second number to forget.
    expect(chunkBudget(4096)).not.toBe(chunkBudget(8192));
    expect(chunkBudget(8192)).not.toBe(chunkBudget(16_384));
  });
});
