import { describe, expect, it } from 'vitest';
import { SourceRefused, type FetchLimits, type RawSource } from './domain/knowledge.ports.js';
import type { Link } from './domain/link.aggregate.js';
import { ReadabilityExtractor } from './infrastructure/readability-extractor.js';

/**
 * Turning a page into something worth summarising (T711).
 *
 * The summariser reads the **first sentence** of what this hands it, so what
 * survives extraction is not a tidiness question — it decides what the member
 * is told the article said. Every case here is about the difference between the
 * article and the page it arrived on.
 *
 * Run by `pnpm vitest`, deliberately. The ten-article fixture that found the
 * first of these needs a model and a person, so it runs when somebody asks; a
 * rule that only holds when somebody remembers to run something is a rule that
 * stops holding. "A verification that lives in somebody's shell history has not
 * been performed since."
 */

const LIMITS: FetchLimits = { maxChars: 60_000, playlistMaxItems: 50 };
const link = { url: 'https://example.com/piece', kind: 'article' } as Link;

function page(body: string, head = ''): RawSource {
  return {
    url: 'https://example.com/piece',
    contentType: 'text/html',
    html: `<!doctype html><html><head><title>A piece</title>${head}</head><body>${body}</body></html>`,
    video: null,
    playlist: null,
  };
}

/**
 * Long enough to clear `MIN_ARTICLE_CHARS` **on its own**, with room to spare.
 *
 * The margin is the point. The whole subject of this file is chrome inflating a
 * thin page past the minimum, so a fixture body sitting near the threshold
 * would pass or fail on whether the banner came through — which is the thing
 * under test rather than a property of the fixture.
 */
const BODY = [
  '<p>Most lifters hear progressive overload and reach for a heavier bar, which is one way to do it and the one that stalls first, because the bar only goes up so often before technique or recovery says no.</p>',
  '<p>Volume is the other lever, and three sets of eight at eighty kilos is nineteen hundred kilos of work where four sets of the same eight is twenty-five hundred. The bar did not move and the session got a third harder.</p>',
  '<p>Range of motion counts too: a squat taken two inches deeper at the same load is a different exercise and, for most people, a harder one than the shallow version they had been doing.</p>',
  '<p>So does density. The same six sets done in thirty-five minutes rather than fifty is progress you can measure with a clock instead of a plate, and it costs nothing to try.</p>',
  '<p>The practical rule is to change one variable at a time and give it three weeks before deciding it did not work for you.</p>',
].join('');

describe('extracting an article', () => {
  const extractor = new ReadabilityExtractor();

  it('keeps the article and drops the page it arrived on', async () => {
    const content = await extractor.extract(
      page(
        `<nav><a href="/">Home</a><a href="/subscribe">Subscribe</a></nav>
         <div class="cookie-banner">We use cookies to improve your experience. Accept all?</div>
         <article><h1>A piece</h1>${BODY}</article>
         <footer>© The Training Desk. All rights reserved.</footer>`,
      ),
      link,
      LIMITS,
    );

    expect(content.text).toContain('Volume is the other lever');
    // The case the ten-article fixture found: on a *short* page Readability's
    // scoring lets a cookie banner through as content, and it becomes the first
    // sentence the summariser reads.
    expect(content.text.toLowerCase()).not.toContain('cookies');
    expect(content.text).not.toContain('Subscribe');
    expect(content.text).not.toContain('All rights reserved');
  });

  it('refuses a page whose banner was the only thing on it', async () => {
    /*
     * The second half of the same defect, and the more dangerous one.
     *
     * The banner's seventy-odd characters pushed a genuinely thin page over the
     * minimum, so a page with three sentences of chrome and nothing else was
     * summarised as though it were an article. Stripped first, it is refused —
     * which is the honest answer and the one a member can act on.
     */
    await expect(
      extractor.extract(
        page(
          `<div class="cookie-banner">We use cookies to improve your experience on this website. Accept all cookies, or manage your preferences at any time from the footer of any page.</div>
           <article><p>Short.</p></article>`,
        ),
        link,
        LIMITS,
      ),
    ).rejects.toThrow(SourceRefused);
  });

  it('says a login wall is a login wall rather than summarising it', async () => {
    // T710's spec, and the spec's own first edge case. Storing a sign-in form
    // as if it were the article is worse than a plain failure, because the
    // member is told it worked.
    await expect(
      extractor.extract(
        page(
          '<div><h1>Sign in to continue reading</h1><p>Subscribers only.</p></div>',
        ),
        link,
        LIMITS,
      ),
    ).rejects.toThrow(SourceRefused);
  });

  it('collects the pictures and leaves the trackers behind', async () => {
    const content = await extractor.extract(
      page(
        `<article><h1>A piece</h1>${BODY}
           <figure><img src="/img/bar.jpg" width="960" height="540" alt="A loaded barbell"><figcaption>A loaded barbell</figcaption></figure>
           <img src="data:image/gif;base64,R0lGOD" alt="inline">
           <img src="/pixel.gif" width="1" height="1" alt="">
           <img src="/img/bar.jpg" alt="the same one again">
         </article>`,
      ),
      link,
      LIMITS,
    );

    // Absolute, de-duplicated, and the source's own URL — the proxying happens
    // at the read boundary, because that is what makes a signing secret
    // rotatable without rewriting every stored document.
    expect(content.media).toEqual([
      {
        type: 'image',
        url: 'https://example.com/img/bar.jpg',
        caption: 'A loaded barbell',
      },
    ]);
  });

  it('takes the published date from the page rather than guessing', async () => {
    const content = await extractor.extract(
      page(
        `<article><h1>A piece</h1>${BODY}</article>`,
        '<meta property="article:published_time" content="2026-02-11T09:00:00Z">',
      ),
      link,
      LIMITS,
    );
    expect(content.publishedAt?.toISOString()).toBe('2026-02-11T09:00:00.000Z');
  });

  it('answers null for a date rather than inventing one', async () => {
    const content = await extractor.extract(
      page(`<article><h1>A piece</h1>${BODY}</article>`),
      link,
      LIMITS,
    );
    // Shown beside the summary, so a wrong one makes a five-year-old article
    // look like this week's.
    expect(content.publishedAt).toBeNull();
  });

  it('reads a plain-text file as itself', async () => {
    const raw: RawSource = {
      url: 'https://example.com/notes.txt',
      contentType: 'text/plain; charset=utf-8',
      html: 'Volume is the other lever. '.repeat(30),
      video: null,
      playlist: null,
    };
    const content = await extractor.extract(raw, link, LIMITS);
    // Readability would find nothing and report a login wall, which would be a
    // lie about a file that is exactly what it appears to be.
    expect(content.text).toContain('Volume is the other lever');
    expect(content.title).toBeNull();
  });

  it('refuses an empty body', async () => {
    await expect(
      extractor.extract(page(''), link, LIMITS),
    ).rejects.toThrow(SourceRefused);
  });

  it('caps the text at the Owner’s limit', async () => {
    const long = `<article><h1>A piece</h1><p>${'word '.repeat(5_000)}</p></article>`;
    const content = await extractor.extract(page(long), link, {
      ...LIMITS,
      maxChars: 500,
    });
    expect(content.text.length).toBeLessThanOrEqual(500);
  });
});
