import { Injectable } from '@nestjs/common';
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  ContentExtractor,
  SourceRefused,
  type ExtractedContent,
  type FetchLimits,
  type RawSource,
} from '../domain/knowledge.ports.js';
import type { Link } from '../domain/link.aggregate.js';
import type { SourceMedia } from '../domain/reading.js';
import type { LinkKind } from '../domain/url-kind.js';

/**
 * Below this much text, there was no article on the page.
 *
 * The number is what makes the login-wall case a clear failure rather than a
 * summary of a sign-in form (T710's spec, and the spec's own first edge case).
 *
 * It was 400 and is 200, and the correction came from the ten-article fixture
 * rather than from reasoning. Four hundred was tuned against pages that still
 * had their cookie banner in them — the banner's seventy-odd characters were
 * padding every measurement. With `stripChrome` running first, the same
 * threshold refused a genuine three-sentence post and called it a login wall,
 * which is a worse failure than the one it was guarding against: a member is
 * told their article is a paywall.
 *
 * Two hundred is roughly a sentence and a half of body text. A sign-in form is
 * well under it — "Sign in to continue reading. Subscribers only." is fifty —
 * and a short post survives. The two numbers moved together for one reason and
 * they should be read together: stripping the chrome is what made the lower
 * one safe.
 */
const MIN_ARTICLE_CHARS = 200;

const MAX_MEDIA = 20;

/**
 * Turning a page into something worth summarising.
 *
 * ## jsdom parses and never executes
 *
 * `runScripts` is left undefined and `resources` is left at its default, so the
 * document is built from the markup alone: no script runs, and nothing is
 * fetched from the source while parsing. Both matter. A page from the open web
 * is hostile input by default, and an extractor that executed it would be
 * running somebody else's code inside the worker that holds this installation's
 * model credentials — and one that loaded subresources would be making requests
 * the SSRF guard never saw, from a URL the member never typed.
 *
 * The virtual console swallows the CSS and layout errors jsdom emits for
 * ordinary pages. They are noise about somebody else's stylesheet, and a
 * worker log full of them is a worker log nobody reads.
 *
 * ## The text is not the page
 *
 * Readability keeps what a reader mode would keep and drops the navigation, the
 * cookie banner and the related-articles rail. That is the whole reason it is
 * here rather than a regex over `<p>` tags: the summariser is given roughly
 * `knowledge.maxChars` of *something*, and whether that something is the
 * article or the footer decides whether the summary is worth reading.
 *
 * A page it cannot read is refused rather than summarised from its markup.
 * Storing a sign-in form as if it were the article is the failure the spec
 * names outright, and it is worse than a plain failure because the member is
 * told it worked.
 */
@Injectable()
export class ReadabilityExtractor extends ContentExtractor {
  handles(kind: LinkKind): boolean {
    return kind === 'article' || kind === 'website';
  }

  async extract(
    raw: RawSource,
    _link: Link,
    limits: FetchLimits,
  ): Promise<ExtractedContent> {
    const html = raw.html ?? '';
    if (html.trim() === '') {
      throw new SourceRefused('The page came back empty.');
    }

    // `text/plain` never had a document in it. Readability would find nothing
    // and report a login wall, which would be a lie about a file that is
    // exactly what it appears to be.
    if (raw.contentType?.toLowerCase().includes('text/plain')) {
      const text = html.trim().slice(0, limits.maxChars);
      if (text.length < MIN_ARTICLE_CHARS) {
        throw new SourceRefused('There was not enough text on this page to read.');
      }
      return {
        title: null,
        author: null,
        publishedAt: null,
        text,
        transcript: null,
        media: [],
        durationSec: null,
      };
    }

    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', () => undefined);
    const dom = new JSDOM(html, { url: raw.url, virtualConsole });

    try {
      const document = dom.window.document;
      // Collected before Readability runs: it returns a *detached* clone of
      // what it kept, and the images it drops on the way are often the ones a
      // reader would want. Taken from the whole document and then filtered.
      const media = imagesIn(document, raw.url);

      stripChrome(document);

      const readable = isProbablyReaderable(document);
      const article = new Readability(document).parse();
      const text = (article?.textContent ?? '').replace(/\s+\n/g, '\n').trim();

      if (text.length < MIN_ARTICLE_CHARS) {
        throw new SourceRefused(
          readable
            ? 'Botvy could not find the article on this page.'
            : 'There was not enough text on this page to read — it may be a login wall, a paywall or an app.',
        );
      }

      return {
        title: article?.title?.trim() || document.title?.trim() || null,
        author: article?.byline?.trim() || null,
        publishedAt: publishedFrom(article?.publishedTime, document),
        text: text.slice(0, limits.maxChars),
        transcript: null,
        media,
        durationSec: null,
      };
    } finally {
      // jsdom holds timers and a window object; a worker that parses thousands
      // of pages and never closes them leaks until it is restarted.
      dom.window.close();
    }
  }
}

/**
 * The furniture that is never the article, removed before Readability scores.
 *
 * ## Found by the phase's own fixture, not reasoned about
 *
 * `ingest-fixture.mjs` runs ten articles through this extractor and asserts the
 * chrome did not come through. Nine passed. The tenth — deliberately the
 * shortest, three paragraphs — came back with **"We use cookies to improve your
 * experience"** as its first sentence, because Readability's scoring is
 * relative: on a long article the banner is noise beside the body, and on a
 * short one it is a comparable block of text.
 *
 * It cost twice over. The summariser reads the first sentence of what it is
 * given, so a 3B model duly wrote about cookies; and the banner's 73 characters
 * pushed the page over `MIN_ARTICLE_CHARS`, so a genuinely thin page that should
 * have been refused was summarised instead.
 *
 * ## Why this list and no more
 *
 * `script`, `style` and `noscript` are never prose. `nav` and `footer` are what
 * the elements mean. The class match is narrow on purpose — `cookie` and
 * `consent` — because every widening is a chance to delete somebody's article:
 * `aside` and `form` are *usually* furniture and are left alone, since a pull
 * quote is an aside and a recipe's ingredients can be a form, and Readability's
 * own scoring already drops them in the common case.
 *
 * The images are collected **before** this runs, so a figure inside a stripped
 * block is not lost to the gallery.
 */
function stripChrome(document: Document): void {
  const doomed = document.querySelectorAll(
    'script, style, noscript, nav, footer,' +
      '[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i]',
  );
  for (const element of doomed) element.remove();
}

/**
 * The pictures, absolute and de-duplicated.
 *
 * `data:` URIs are dropped — they are already inline and proxying one would be
 * re-encoding bytes we already hold — and so are the tracking pixels that
 * declare themselves one pixel wide. Everything kept is a *source* URL; nothing
 * here knows about the proxy, because FR-008 is about what a client is handed
 * and the client is handed a view, not a document.
 */
function imagesIn(document: Document, baseUrl: string): SourceMedia[] {
  const seen = new Set<string>();
  const out: SourceMedia[] = [];

  for (const image of document.querySelectorAll('img')) {
    const source = image.getAttribute('src') ?? image.getAttribute('data-src');
    if (!source || source.startsWith('data:')) continue;

    const width = Number(image.getAttribute('width') ?? '0');
    const height = Number(image.getAttribute('height') ?? '0');
    if ((width > 0 && width <= 2) || (height > 0 && height <= 2)) continue;

    let absolute: string;
    try {
      absolute = new URL(source, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(absolute)) continue;
    seen.add(absolute);

    const caption =
      image.getAttribute('alt')?.trim() ||
      image.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ||
      null;

    out.push({ type: 'image', url: absolute, caption: caption || null });
    if (out.length === MAX_MEDIA) break;
  }

  return out;
}

/**
 * When it was written, from whatever the page was willing to say.
 *
 * Readability's own `publishedTime` first, then the two metadata conventions
 * that between them cover most of the web. Null is a perfectly good answer and
 * is far better than a guess: the date is shown to the member beside the
 * summary, and a wrong one makes a five-year-old article look like this week's.
 */
function publishedFrom(
  fromArticle: string | null | undefined,
  document: Document,
): Date | null {
  const candidates = [
    fromArticle,
    document
      .querySelector('meta[property="article:published_time"]')
      ?.getAttribute('content'),
    document.querySelector('time[datetime]')?.getAttribute('datetime'),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}
