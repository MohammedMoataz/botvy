import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import {
  Geocoder,
  PageFetcher,
  PreviewUnavailable,
  type FetchedPage,
  type Place,
} from './domain/link-preview.ports.js';
import { coordinatesFrom } from './domain/map-coordinates.js';
import { LinkPreviewQueryHandler } from './features/link-preview/link-preview.query.js';
import { HttpPageFetcher } from './infrastructure/http-page-fetcher.js';
import { InMemoryLinkPreviewCache } from './infrastructure/link-preview.cache.js';
import {
  NominatimGeocoder,
  RateGate,
} from './infrastructure/nominatim-geocoder.js';

/** 032, T3220: the `link-preview` slice. */

const DAY = 86_400_000;

describe('coordinates from a map URL', () => {
  it.each<[string, [number, number] | null]>([
    [
      'https://www.google.com/maps/place/Cairo+Tower/@30.0459,31.2243,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d30.0459751!4d31.2242956',
      [30.0459751, 31.2242956],
    ],
    ['https://www.google.com/maps/@30.0444,31.2357,15z', [30.0444, 31.2357]],
    ['https://maps.google.com/?q=30.0444,31.2357', [30.0444, 31.2357]],
    [
      'https://maps.google.com/maps?ll=-33.8688,151.2093&z=12',
      [-33.8688, 151.2093],
    ],
    [
      'https://www.google.com/maps/search/?api=1&query=48.8584%2C2.2945',
      [48.8584, 2.2945],
    ],
    [
      'https://consent.google.com/m?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2F%4051.5007%2C-0.1246%2C17z',
      [51.5007, -0.1246],
    ],
    [
      'https://www.openstreetmap.org/?mlat=52.5163&mlon=13.3777#map=17/52.5163/13.3777',
      [52.5163, 13.3777],
    ],
    [
      'https://www.openstreetmap.org/?mlon=13.3777&mlat=52.5163',
      [52.5163, 13.3777],
    ],
    [
      'https://www.openstreetmap.org/#map=16/40.7128/-74.0060',
      [40.7128, -74.006],
    ],
    ['geo:30.0444,31.2357?z=15', [30.0444, 31.2357]],
    ['geo:0,0?q=Tahrir+Square', null],
    ['https://maps.google.com/?q=Tahrir+Square', null],
    ['https://maps.google.com/?q=95.0,31.0', null],
    ['https://maps.google.com/?q=30.0,190.0', null],
    ['https://example.com/blog/post', null],
  ])('%s', (url, expected) => {
    const found = coordinatesFrom(url);
    expect(found ? [found.lat, found.lng] : null).toEqual(expected);
  });
});

// ------------------------------------------------------------- the fetcher

function html(body: string, type = 'text/html; charset=utf-8'): Response {
  return new Response(body, { status: 200, headers: { 'content-type': type } });
}

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { location: to } });
}

/** A fake `fetch` answering by URL, recording every request it was asked. */
function fakeFetch(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  }) as typeof fetch;
  return { impl, asked };
}

const publicLookup = async () => [{ address: '93.184.216.34' }];

describe('HttpPageFetcher', () => {
  it('refuses a redirect hop to a private address before making it', async () => {
    const { impl, asked } = fakeFetch({
      'https://short.example/x': () => redirect('http://10.0.0.5/admin'),
    });
    const page = await new HttpPageFetcher(impl, publicLookup).fetch(
      'https://short.example/x',
    );
    expect(asked).toEqual(['https://short.example/x']);
    expect(page.hops).toEqual(['https://short.example/x']);
    expect(page.title).toBeNull();
  });

  it('refuses a name that resolves to a private address', async () => {
    const { impl, asked } = fakeFetch({
      'https://short.example/x': () => redirect('https://evil.example/'),
    });
    const lookup = async (host: string) =>
      host === 'evil.example'
        ? [{ address: '192.168.1.2' }]
        : [{ address: '93.184.216.34' }];
    await new HttpPageFetcher(impl, lookup).fetch('https://short.example/x');
    expect(asked).toEqual(['https://short.example/x']);
  });

  it('follows at most five redirects', async () => {
    const routes: Record<string, () => Response> = {};
    for (let i = 0; i < 10; i += 1) {
      routes[`https://loop.example/${i}`] = () =>
        redirect(`https://loop.example/${i + 1}`);
    }
    const { impl, asked } = fakeFetch(routes);
    await new HttpPageFetcher(impl, publicLookup).fetch(
      'https://loop.example/0',
    );
    expect(asked).toHaveLength(6);
  });

  it('reads Open Graph, resolving the image against the page', async () => {
    const { impl } = fakeFetch({
      'https://maps.app.goo.gl/abc': () =>
        redirect('https://www.google.com/maps/place/X/@30.1,31.2,17z'),
      'https://www.google.com/maps/place/X/@30.1,31.2,17z': () =>
        html(`<html><head>
          <title>ignored</title>
          <meta property="og:title" content="Cairo Tower">
          <meta property="og:site_name" content="Google Maps">
          <meta property="og:image" content="/img/tower.png">
          <script>throw new Error('never run')</script>
        </head></html>`),
    });
    const page = await new HttpPageFetcher(impl, publicLookup).fetch(
      'https://maps.app.goo.gl/abc',
    );
    expect(page).toEqual({
      hops: [
        'https://maps.app.goo.gl/abc',
        'https://www.google.com/maps/place/X/@30.1,31.2,17z',
      ],
      title: 'Cairo Tower',
      siteName: 'Google Maps',
      image: 'https://www.google.com/img/tower.png',
    });
  });

  it('falls back to <title> and drops a non-http image', async () => {
    const { impl } = fakeFetch({
      'https://blog.example/': () =>
        html(
          '<title> My  post </title><meta property="og:image" content="javascript:alert(1)">',
        ),
    });
    const page = await new HttpPageFetcher(impl, publicLookup).fetch(
      'https://blog.example/',
    );
    expect(page.title).toBe('My post');
    expect(page.image).toBeNull();
  });

  it('reads nothing from a page that is not HTML', async () => {
    const { impl } = fakeFetch({
      'https://files.example/a.pdf': () => html('%PDF', 'application/pdf'),
    });
    const page = await new HttpPageFetcher(impl, publicLookup).fetch(
      'https://files.example/a.pdf',
    );
    expect(page.title).toBeNull();
  });

  it('reports our own network failing as unavailable', async () => {
    const impl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(
      new HttpPageFetcher(impl, publicLookup).fetch('https://a.example/'),
    ).rejects.toBeInstanceOf(PreviewUnavailable);
  });
});

// ------------------------------------------------------------- the handler

class CountingFetcher extends PageFetcher {
  calls: string[] = [];
  constructor(private readonly answer: (url: string) => FetchedPage) {
    super();
  }
  async fetch(url: string): Promise<FetchedPage> {
    this.calls.push(url);
    return this.answer(url);
  }
}

class CountingGeocoder extends Geocoder {
  calls: string[] = [];
  constructor(private readonly answer: Place | null) {
    super();
  }
  async geocode(address: string): Promise<Place | null> {
    this.calls.push(address);
    return this.answer;
  }
}

function settings(): SettingsService {
  return new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
}

describe('LinkPreviewQueryHandler', () => {
  const now = new Date();
  let cache: InMemoryLinkPreviewCache;
  let geocoder: CountingGeocoder;
  let store: SettingsService;

  beforeEach(() => {
    cache = new InMemoryLinkPreviewCache();
    geocoder = new CountingGeocoder({
      lat: 30.04,
      lng: 31.23,
      label: 'Tahrir',
    });
    store = settings();
  });

  function handler(fetcher: PageFetcher) {
    return new LinkPreviewQueryHandler(fetcher, geocoder, cache, store);
  }

  it('previews a link and serves the second ask from the cache', async () => {
    const fetcher = new CountingFetcher((url) => ({
      hops: [url],
      title: 'Weekly sync',
      siteName: 'Zoom',
      image: null,
    }));
    const first = await handler(fetcher).preview(
      'u',
      { url: 'zoom.us/j/1' },
      now,
    );
    const second = await handler(fetcher).preview(
      'u',
      { url: 'zoom.us/j/1' },
      now,
    );

    expect(first).toEqual({
      url: 'https://zoom.us/j/1',
      title: 'Weekly sync',
      siteName: 'Zoom',
      image: null,
      place: null,
    });
    expect(second).toEqual(first);
    expect(fetcher.calls).toEqual(['https://zoom.us/j/1']);
    const [row] = [...cache.rows.values()];
    expect(row!.expiresAt.getTime() - now.getTime()).toBe(30 * DAY);
  });

  it('takes the place from the redirect chain and never geocodes a link', async () => {
    const fetcher = new CountingFetcher(() => ({
      hops: [
        'https://maps.app.goo.gl/abc',
        'https://www.google.com/maps/place/X/data=!3d30.1!4d31.2',
        'https://consent.google.com/m?continue=x',
      ],
      title: null,
      siteName: null,
      image: null,
    }));
    const preview = await handler(fetcher).preview(
      'u',
      { address: 'https://maps.app.goo.gl/abc' },
      now,
    );
    expect(preview?.place).toEqual({ lat: 30.1, lng: 31.2, label: null });
    expect(geocoder.calls).toEqual([]);
  });

  it('caches a failure for the failure TTL and does not refetch it', async () => {
    const fetcher = new CountingFetcher((url) => ({
      hops: [url],
      title: null,
      siteName: null,
      image: null,
    }));
    expect(
      await handler(fetcher).preview(
        'u',
        { url: 'https://dead.example/' },
        now,
      ),
    ).toBeNull();
    expect(
      await handler(fetcher).preview(
        'u',
        { url: 'https://dead.example/' },
        now,
      ),
    ).toBeNull();
    expect(fetcher.calls).toHaveLength(1);
    const [row] = [...cache.rows.values()];
    expect(row!.preview).toBeNull();
    expect(row!.expiresAt.getTime() - now.getTime()).toBe(7 * DAY);

    // And after the TTL it is tried again.
    await handler(fetcher).preview(
      'u',
      { url: 'https://dead.example/' },
      new Date(now.getTime() + 8 * DAY),
    );
    expect(fetcher.calls).toHaveLength(2);
  });

  it('does not cache an outage of ours', async () => {
    const fetcher = new CountingFetcher(() => {
      throw new PreviewUnavailable('offline');
    });
    expect(
      await handler(fetcher).preview('u', { url: 'https://a.example/' }, now),
    ).toBeNull();
    expect(cache.rows.size).toBe(0);
  });

  it('never fetches a link with another scheme', async () => {
    const fetcher = new CountingFetcher(() => {
      throw new Error('must not fetch');
    });
    expect(
      await handler(fetcher).preview('u', { url: 'javascript:alert(1)' }, now),
    ).toBeNull();
    expect(
      await handler(fetcher).preview(
        'u',
        { address: 'file:///etc/passwd' },
        now,
      ),
    ).toBeNull();
    expect(fetcher.calls).toEqual([]);
  });

  it('geocodes a plain address, once', async () => {
    const fetcher = new CountingFetcher(() => {
      throw new Error('must not fetch');
    });
    const preview = await handler(fetcher).preview(
      'u',
      { address: 'Tahrir Square' },
      now,
    );
    await handler(fetcher).preview('u', { address: '  tahrir square ' }, now);
    expect(preview?.place).toEqual({ lat: 30.04, lng: 31.23, label: 'Tahrir' });
    expect(geocoder.calls).toEqual(['Tahrir Square']);
  });

  it('does not geocode, or cache, while meetings.geocodeEnabled is off', async () => {
    await store.setSystem('meetings.geocodeEnabled', false);
    const fetcher = new CountingFetcher(() => {
      throw new Error('must not fetch');
    });
    expect(
      await handler(fetcher).preview('u', { address: 'Tahrir Square' }, now),
    ).toBeNull();
    expect(geocoder.calls).toEqual([]);
    expect(cache.rows.size).toBe(0);
  });
});

// ------------------------------------------------------------- the geocoder

describe('NominatimGeocoder', () => {
  it('asks the configured server with a descriptive user agent', async () => {
    const store = settings();
    await store.setSystem('meetings.geocodeUrl', 'https://geo.example/');
    const seen: Array<{ url: string; agent: string | null }> = [];
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({
        url: String(input),
        agent: new Headers(init?.headers).get('user-agent'),
      });
      return new Response(
        JSON.stringify([
          { lat: '30.04', lon: '31.23', display_name: 'Tahrir' },
        ]),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;
    const place = await new NominatimGeocoder(
      store,
      impl,
      new RateGate(0),
    ).geocode('Tahrir Square');

    expect(place).toEqual({ lat: 30.04, lng: 31.23, label: 'Tahrir' });
    expect(seen[0]!.url).toBe(
      'https://geo.example/search?format=jsonv2&limit=1&q=Tahrir%20Square',
    );
    expect(seen[0]!.agent).toMatch(
      /^Botvy\/\d+\.\d+\.\d+ \(self-hosted personal assistant\)$/,
    );
  });
});

describe('RateGate', () => {
  it('lets one caller through a second, in order', async () => {
    let clock = 0;
    const slept: number[] = [];
    const gate = new RateGate(
      1_000,
      () => clock,
      async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    );
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3].map((n) => gate.turn().then(() => order.push(n))),
    );
    expect(order).toEqual([1, 2, 3]);
    expect(slept).toEqual([1_000, 1_000]);
  });
});
