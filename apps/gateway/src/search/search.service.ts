import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SearchResult {
  title: string;
  url: string;
  /** The engine's snippet, sanitised and truncated. */
  content: string;
}

export interface ImageResult {
  title: string;
  /** The image itself, which the gateway proxies rather than the phone fetching. */
  imageUrl: string;
  /** The page the image was found on. */
  sourceUrl: string;
}

/** Enough for the model to answer from, few enough to keep prefill short. */
const MAX_RESULTS = 5;
const MAX_IMAGES = 2;
const SNIPPET_CHARS = 300;

/**
 * A search that takes longer than this is worse than none: the user is waiting
 * on it before the model has started generating.
 */
const SEARCH_TIMEOUT_MS = 6_000;

/**
 * Web search through the local SearXNG.
 *
 * Everything here returns an empty array rather than throwing. A search that
 * fails must degrade to an ordinary chat reply — a metasearch front-end has no
 * uptime contract, and its upstreams throttle.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('SEARXNG_URL') ?? 'http://searxng:8080').replace(
      /\/$/,
      '',
    );
  }

  async search(query: string): Promise<SearchResult[]> {
    const rows = await this.query(query, 'general');
    return rows
      .filter((r) => typeof r.url === 'string' && isHttpUrl(r.url))
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        title: sanitise(asText(r.title), 120),
        url: r.url as string,
        content: sanitise(asText(r.content), SNIPPET_CHARS),
      }));
  }

  /**
   * Images for a query. Text snippets never carry image URLs, so this is a
   * separate call — and the model never sees either one: the gateway attaches
   * the markdown itself.
   */
  async searchImages(query: string): Promise<ImageResult[]> {
    const rows = await this.query(query, 'images');
    return rows
      .filter(
        (r) => typeof r.img_src === 'string' && isHttpUrl(r.img_src) && isRasterImage(r.img_src),
      )
      .slice(0, MAX_IMAGES)
      .map((r) => ({
        title: sanitise(asText(r.title), 120),
        imageUrl: r.img_src as string,
        sourceUrl: typeof r.url === 'string' && isHttpUrl(r.url) ? r.url : (r.img_src as string),
      }));
  }

  private async query(
    query: string,
    category: 'general' | 'images',
  ): Promise<Record<string, unknown>[]> {
    const trimmed = query.trim();
    if (trimmed === '') return [];

    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('q', trimmed);
    url.searchParams.set('format', 'json');
    url.searchParams.set('categories', category);
    url.searchParams.set('safesearch', '1');

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`SearXNG answered ${response.status} for a ${category} search`);
        return [];
      }
      const body = (await response.json()) as { results?: Record<string, unknown>[] };
      return body.results ?? [];
    } catch (err) {
      this.logger.warn(`search unavailable, answering without it: ${String(err)}`);
      return [];
    }
  }
}

/**
 * Only the formats the media proxy will actually serve.
 *
 * The image engines return plenty that is not a photograph — icon sets in SVG
 * turn up for almost any query — and the proxy refuses SVG because it can
 * carry script. Filtering here means the reply does not carry a link that was
 * never going to render.
 */
function isRasterImage(url: string): boolean {
  try {
    return /\.(jpe?g|png|webp|avif|gif)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** SearXNG's JSON is untyped and fields go missing per engine. */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Snippets are attacker-controlled text on its way into a prompt. Markup and
 * image syntax come out, and the length is capped so one page cannot crowd out
 * the conversation.
 */
function sanitise(raw: string, limit: number): string {
  const flattened = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[/g, '[')
    .replace(/\s+/g, ' ')
    .trim();
  return flattened.length > limit ? `${flattened.slice(0, limit)}…` : flattened;
}
