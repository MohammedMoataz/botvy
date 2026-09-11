import { Injectable, Logger } from '@nestjs/common';
import { checkTarget } from '../../../shared/media/media.signing.js';
import {
  SourceFetcher,
  SourceRefused,
  SourceUnavailable,
  type FetchLimits,
  type RawSource,
} from '../domain/knowledge.ports.js';
import type { Link } from '../domain/link.aggregate.js';
import type { LinkKind } from '../domain/url-kind.js';

/** Long enough for a slow blog, short enough that a hung host is not a hang. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * How many hops we will follow ourselves.
 *
 * Five rather than the platform's twenty, and followed **manually** rather than
 * with `redirect: 'follow'` — see `fetchFollowing` for why that matters more
 * than the number does.
 */
const MAX_REDIRECTS = 5;

/**
 * Bytes of markup per character of text we are willing to keep.
 *
 * A modern article page is mostly script and inline CSS; ten to one is
 * generous for the ones worth reading and refuses the ones that are an
 * application rather than a document. The absolute ceiling below stops a
 * generous `knowledge.maxChars` from turning into an unbounded download.
 */
const MARKUP_RATIO = 10;
const MAX_BYTES = 8 * 1024 * 1024;

const READABLE_TYPES = ['text/html', 'application/xhtml', 'text/plain'];

/**
 * Pages, over HTTP, from the worker.
 *
 * ## Every outbound fetch in this product goes through `checkTarget`
 *
 * The same guard the media proxy uses, and for the same reason stated there: the
 * compose network puts PostgreSQL, Mongo, n8n and the model server one hostname
 * away, and something that fetches a URL a member typed is an open proxy unless
 * somebody says what it may reach. Sharing the function rather than writing a
 * second one is deliberate — two SSRF guards are two chances to disagree about
 * what a private address is, and the one that is wrong is the one nobody is
 * looking at.
 *
 * ## What counts as "the source said no"
 *
 * **Any HTTP response.** A 404, a 403 behind a login, a 402 paywall and a 503
 * are all the far end answering, and all of them spend an attempt and leave the
 * link `failed` with a reason the member can read. Only a failure on *our* side
 * — DNS, a refused connection, a timeout, the worker being killed — is
 * `unavailable`, which spends nothing and leaves the row for the sweep.
 *
 * That split is narrower than it could be, and narrow is the point. Treating a
 * 503 as "try later" reads generously and produces an unbounded retry loop
 * against a site that is simply gone: the sweep would return the row to the
 * queue for ever, and FR-004's "repeated failure must stop after a limit" would
 * never once apply to the failure that actually happens most. A member whose
 * site was briefly down presses Retry, which is one tap and is the affordance
 * FR-003 already requires.
 */
@Injectable()
export class HttpSourceFetcher extends SourceFetcher {
  private readonly logger = new Logger(HttpSourceFetcher.name);

  constructor(private readonly fetchImpl: typeof fetch = fetch) {
    super();
  }

  handles(kind: LinkKind): boolean {
    return kind === 'article' || kind === 'website';
  }

  async fetch(link: Link, limits: FetchLimits): Promise<RawSource> {
    const response = await this.fetchFollowing(link.url);

    const contentType = response.headers.get('content-type');
    if (!isReadable(contentType)) {
      throw new SourceRefused(
        `This link is ${contentType ?? 'an unknown kind of file'}, which Botvy cannot read.`,
      );
    }

    const declared = Number(response.headers.get('content-length') ?? '0');
    const cap = Math.min(limits.maxChars * MARKUP_RATIO, MAX_BYTES);
    if (declared > cap) {
      throw new SourceRefused(
        `This page is ${Math.round(declared / 1024)} KB, larger than the ${Math.round(cap / 1024)} KB Botvy keeps.`,
      );
    }

    return {
      url: response.url || link.url,
      contentType,
      html: await readCapped(response, cap),
      video: null,
      playlist: null,
    };
  }

  /**
   * The redirect chain, hop by hop, checking every destination.
   *
   * `redirect: 'follow'` would be one line and would check the wrong thing.
   * The platform follows the chain itself and hands back only the final
   * response, so a guard applied to `response.url` runs **after** the request to
   * `http://n8n:5678` has already been made and answered — the hole is the
   * request, not the reply. A page that redirects to a private address is not
   * exotic; it is the standard way this class of proxy is attacked.
   *
   * So each hop is checked before it is made, and the chain is capped. A loop
   * exhausts the cap and is reported as the source's problem, which it is.
   */
  private async fetchFollowing(startUrl: string): Promise<Response> {
    let url = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const verdict = checkTarget(url);
      if (!verdict.allowed) {
        throw new SourceRefused(`Botvy will not fetch that address: ${verdict.reason}.`);
      }

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            // Named honestly. A crawler that pretends to be a browser is a
            // crawler whose operator did not want to be asked to stop.
            'user-agent': 'Botvy/2.0 (self-hosted personal reader)',
            accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
          },
        });
      } catch (error) {
        // DNS, a refused connection, a timeout: our end, not theirs. The row
        // stays where it is and the sweep brings it round again (FR-016).
        throw new SourceUnavailable(
          `Could not reach the source: ${(error as Error).message}`,
        );
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new SourceRefused(
            `The source answered ${response.status} with nowhere to go.`,
          );
        }
        url = new URL(location, url).toString();
        this.logger.debug(`following ${response.status} to ${url}`);
        continue;
      }

      if (!response.ok) {
        throw new SourceRefused(reasonFor(response.status));
      }
      return response;
    }

    throw new SourceRefused(
      `The source redirected more than ${MAX_REDIRECTS} times.`,
    );
  }
}

/**
 * The body, stopping at the cap rather than after it.
 *
 * A `Content-Length` is a claim, not a promise — a server that omits it or
 * understates it would otherwise stream an unbounded amount into this worker's
 * memory. So the declared length is checked above as a courtesy and the stream
 * is capped here as the actual rule.
 *
 * A truncated page is kept rather than refused: the top of an article is the
 * part worth summarising, and half a page is a thinner reading rather than a
 * failed one.
 */
async function readCapped(response: Response, cap: number): Promise<string> {
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
      if (bytes >= cap) break;
    }
  } catch (error) {
    throw new SourceUnavailable(
      `The connection dropped while reading: ${(error as Error).message}`,
    );
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  /*
   * Cut to the cap, because the loop above can only stop at a chunk boundary.
   *
   * In production a chunk is a few tens of kilobytes and the overshoot is
   * bounded by one of them; a `Response` built from a string in a spec yields
   * the whole body at once, so the loop's first read is already past the cap
   * and the break happens too late to matter. Its spec caught exactly that.
   *
   * The cap is in bytes and this slice is in characters, which is conservative
   * for anything non-ASCII — a smaller cut, never a larger one — and that is
   * the direction to be wrong in.
   */
  return out.length > cap ? out.slice(0, cap) : out;
}

function isReadable(contentType: string | null): boolean {
  if (!contentType) return true; // No header is not a refusal; the extractor decides.
  const type = contentType.toLowerCase();
  return READABLE_TYPES.some((allowed) => type.includes(allowed));
}

/**
 * The status, in words a member can act on.
 *
 * FR-003 asks for a reason, and "HTTP 403" is a reason for somebody who already
 * knows what to do about it. The three that a member actually meets get a
 * sentence; everything else falls back to the number, which is better than a
 * wrong guess about what the site meant.
 */
function reasonFor(status: number): string {
  if (status === 404 || status === 410) {
    return 'The page is gone (404). The link may have moved.';
  }
  if (status === 401 || status === 403) {
    return 'The source wants a login. Botvy will not sign in on your behalf.';
  }
  if (status === 402) return 'The article is behind a paywall.';
  if (status === 429) {
    return 'The source asked Botvy to slow down. Try again in a while.';
  }
  if (status >= 500) {
    return `The source is having trouble (${status}). Try again later.`;
  }
  return `The source refused the request (${status}).`;
}
