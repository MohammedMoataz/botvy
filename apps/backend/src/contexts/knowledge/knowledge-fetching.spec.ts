import { describe, expect, it } from 'vitest';
import {
  SourceRefused,
  SourceUnavailable,
  isUnavailable,
  type FetchLimits,
} from './domain/knowledge.ports.js';
import type { Link } from './domain/link.aggregate.js';
import { HttpSourceFetcher } from './infrastructure/http-source-fetcher.js';

/**
 * Fetching a page from the open web (T710).
 *
 * Two things this file exists to hold.
 *
 * **The redirect chain is walked by hand, and every hop is checked before it is
 * made.** `redirect: 'follow'` would be one line and would check the wrong
 * thing: the platform follows the chain itself and hands back only the final
 * response, so a guard applied to `response.url` runs *after* the request to
 * `http://n8n:5678` has been made and answered. The hole is the request, not
 * the reply, and a page that redirects inward is the standard way this class of
 * proxy is attacked.
 *
 * **Any HTTP response is the source refusing us; only our own end failing is
 * "try later".** Getting that backwards in either direction is a live defect:
 * one way a dead URL is retried for ever, the other way a restart exhausts the
 * retry limit of every link in flight.
 */

const LIMITS: FetchLimits = { maxChars: 10_000, playlistMaxItems: 50 };
const link = { url: 'https://example.com/piece', kind: 'article' } as Link;

/** A fetch that answers from a script keyed by URL, and records what it asked. */
function scripted(
  script: Record<string, Response | (() => never)>,
): { impl: typeof fetch; asked: string[] } {
  const asked: string[] = [];
  const impl = (async (url: string) => {
    asked.push(String(url));
    const answer = script[String(url)];
    if (!answer) throw new Error(`nothing scripted for ${url}`);
    if (typeof answer === 'function') return answer();
    return answer;
  }) as unknown as typeof fetch;
  return { impl, asked };
}

function html(body = '<html><body><p>text</p></body></html>', status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function redirect(to: string, status = 302) {
  return new Response(null, { status, headers: { location: to } });
}

describe('fetching a page', () => {
  it('reads a page and reports where it actually came from', async () => {
    const { impl } = scripted({ 'https://example.com/piece': html() });
    const raw = await new HttpSourceFetcher(impl).fetch(link, LIMITS);

    expect(raw.html).toContain('<p>text</p>');
    expect(raw.contentType).toContain('text/html');
  });

  it('follows a redirect and checks where it is going first', async () => {
    const { impl, asked } = scripted({
      'https://example.com/piece': redirect('https://example.com/moved'),
      'https://example.com/moved': html(),
    });
    const raw = await new HttpSourceFetcher(impl).fetch(link, LIMITS);

    expect(asked).toEqual([
      'https://example.com/piece',
      'https://example.com/moved',
    ]);
    expect(raw.html).toContain('text');
  });

  it('refuses a redirect into the compose network before making the request', async () => {
    const { impl, asked } = scripted({
      'https://example.com/piece': redirect('http://n8n:5678/rest/workflows'),
    });

    await expect(
      new HttpSourceFetcher(impl).fetch(link, LIMITS),
    ).rejects.toThrow(SourceRefused);

    // The whole point: the second request was never made. A guard applied to
    // the final response would have let it happen and then complained.
    expect(asked).toEqual(['https://example.com/piece']);
  });

  it('refuses the first address too, whoever asked', async () => {
    const { impl, asked } = scripted({});
    await expect(
      new HttpSourceFetcher(impl).fetch(
        { url: 'http://mongo:27017/', kind: 'article' } as Link,
        LIMITS,
      ),
    ).rejects.toThrow(SourceRefused);
    expect(asked).toEqual([]);
  });

  it('gives up on a redirect loop rather than following it for ever', async () => {
    const { impl, asked } = scripted({
      'https://example.com/piece': redirect('https://example.com/a'),
      'https://example.com/a': redirect('https://example.com/piece'),
    });

    await expect(
      new HttpSourceFetcher(impl).fetch(link, LIMITS),
    ).rejects.toThrow(/redirected more than/);
    // Capped at five hops rather than the platform's twenty.
    expect(asked.length).toBeLessThanOrEqual(6);
  });

  it('reads a status the member can act on', async () => {
    for (const [status, phrase] of [
      [404, /gone/i],
      [401, /login/i],
      [403, /login/i],
      [402, /paywall/i],
      [429, /slow down/i],
      [503, /having trouble/i],
    ] as Array<[number, RegExp]>) {
      const { impl } = scripted({
        'https://example.com/piece': html('', status),
      });
      await expect(
        new HttpSourceFetcher(impl).fetch(link, LIMITS),
      ).rejects.toThrow(phrase);
    }
  });

  it('treats every HTTP answer as the source refusing, including a 503', async () => {
    /*
     * Narrower than it could be, and narrow is the point. Reading a 503 as "try
     * later" produces an unbounded retry loop against a site that is simply
     * gone — the sweep would return the row to the queue for ever, and FR-004's
     * "repeated failure must stop after a limit" would never once apply to the
     * failure that actually happens most. A member whose site was briefly down
     * presses Retry, which is one tap.
     */
    const { impl } = scripted({ 'https://example.com/piece': html('', 503) });
    const error = await new HttpSourceFetcher(impl)
      .fetch(link, LIMITS)
      .catch((thrown: unknown) => thrown);
    expect(isUnavailable(error)).toBe(false);
  });

  it('treats a network failure as our own end, which spends no attempt', async () => {
    const { impl } = scripted({
      'https://example.com/piece': () => {
        throw new Error('getaddrinfo ENOTFOUND');
      },
    });
    const error = await new HttpSourceFetcher(impl)
      .fetch(link, LIMITS)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SourceUnavailable);
    expect(isUnavailable(error)).toBe(true);
  });

  it('refuses a file it cannot read', async () => {
    const { impl } = scripted({
      'https://example.com/piece': new Response('%PDF-1.7', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    });
    await expect(
      new HttpSourceFetcher(impl).fetch(link, LIMITS),
    ).rejects.toThrow(/cannot read/);
  });

  it('refuses a page that declares itself larger than the cap', async () => {
    const { impl } = scripted({
      'https://example.com/piece': new Response('<html></html>', {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'content-length': String(50 * 1024 * 1024),
        },
      }),
    });
    await expect(
      new HttpSourceFetcher(impl).fetch(link, LIMITS),
    ).rejects.toThrow(/larger than/);
  });

  it('stops reading at the cap when the source did not declare one', async () => {
    // A `Content-Length` is a claim, not a promise. The declared check above is
    // a courtesy; this is the rule.
    const body = 'x'.repeat(4 * 1024 * 1024);
    const { impl } = scripted({
      'https://example.com/piece': new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    });
    const raw = await new HttpSourceFetcher(impl).fetch(link, {
      ...LIMITS,
      maxChars: 1_000,
    });
    // Truncated rather than refused: the top of an article is the part worth
    // summarising, and half a page is a thinner reading rather than a failure.
    expect(raw.html!.length).toBeLessThan(body.length);
  });

  it('takes articles and pages, and leaves the videos to YouTube', () => {
    const fetcher = new HttpSourceFetcher();
    expect(fetcher.handles('article')).toBe(true);
    expect(fetcher.handles('website')).toBe(true);
    expect(fetcher.handles('video')).toBe(false);
    expect(fetcher.handles('playlist')).toBe(false);
  });
});
