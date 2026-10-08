import { JSDOM, VirtualConsole } from 'jsdom';
import { checkResolvedTarget } from '../../../shared/media/media.signing.js';
import { BOTVY_VERSION } from '../../../shared/health/health.controller.js';
import {
  PageFetcher,
  PreviewUnavailable,
  type FetchedPage,
} from '../domain/link-preview.ports.js';

/** A preview is a nicety; a hung host must not hold a detail screen open. */
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
/** The `<head>` is all a preview reads; a megabyte reaches it on any page. */
const MAX_BYTES = 1024 * 1024;

type Lookup = (host: string) => Promise<Array<{ address: string }>>;

/**
 * A link's page, for its preview — Meetings' own copy of Knowledge's
 * `HttpSourceFetcher` (a second copy is duplicated, per CLAUDE.md, not
 * imported across contexts).
 *
 * The same rules: every hop is checked by the shared `checkResolvedTarget`
 * **before** it is made, redirects are followed by hand (≤5), and the body is
 * read to a cap. jsdom parses without running a script.
 *
 * Only a failure on our side throws (`PreviewUnavailable`). Any answer from
 * the far end — a 404, a refusal, a redirect to a private address — is a page
 * with no facts, which the handler caches as a failure.
 */
export class HttpPageFetcher extends PageFetcher {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly lookup?: Lookup,
  ) {
    super();
  }

  async fetch(startUrl: string): Promise<FetchedPage> {
    const hops: string[] = [];
    let url = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const verdict = await checkResolvedTarget(url, this.lookup);
      if (!verdict.allowed) return nothing(hops);
      hops.push(url);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            // Named honestly, as Knowledge's fetcher is.
            'user-agent': `Botvy/${BOTVY_VERSION} (self-hosted personal assistant; link preview)`,
            accept: 'text/html,application/xhtml+xml;q=0.9',
          },
        });
      } catch (error) {
        throw new PreviewUnavailable(
          `Could not reach the link: ${(error as Error).message}`,
        );
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return nothing(hops);
        url = new URL(location, url).toString();
        continue;
      }

      const type = (response.headers.get('content-type') ?? '').toLowerCase();
      if (!response.ok || !/text\/html|application\/xhtml/.test(type)) {
        await response.body?.cancel().catch(() => undefined);
        return nothing(hops);
      }
      return { hops, ...parseHead(await readCapped(response), url) };
    }
    return nothing(hops);
  }
}

function nothing(hops: string[]): FetchedPage {
  return { hops, title: null, siteName: null, image: null };
}

/** Open Graph first, `<title>` as the fallback; an image only as absolute http(s). */
export function parseHead(
  html: string,
  pageUrl: string,
): Omit<FetchedPage, 'hops'> {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new JSDOM(html, { url: pageUrl, virtualConsole });
  try {
    const document = dom.window.document;
    const meta = (name: string): string | null => {
      const element = document.querySelector(
        `meta[property="${name}"], meta[name="${name}"]`,
      );
      return clean(element?.getAttribute('content'));
    };

    let image: string | null = null;
    const rawImage = meta('og:image') ?? meta('og:image:url');
    if (rawImage) {
      try {
        const absolute = new URL(rawImage, pageUrl);
        if (absolute.protocol === 'http:' || absolute.protocol === 'https:') {
          image = absolute.toString();
        }
      } catch {
        image = null;
      }
    }

    return {
      title: meta('og:title') ?? clean(document.title),
      siteName: meta('og:site_name'),
      image,
    };
  } finally {
    dom.window.close();
  }
}

function clean(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return text === '' ? null : text;
}

/** The body to the cap and no further, whatever `Content-Length` claimed. */
async function readCapped(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      out += decoder.decode(chunk.value, { stream: true });
      if (bytes >= MAX_BYTES) break;
    }
  } catch {
    // A dropped connection mid-page still leaves the head we already have.
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return out.length > MAX_BYTES ? out.slice(0, MAX_BYTES) : out;
}
