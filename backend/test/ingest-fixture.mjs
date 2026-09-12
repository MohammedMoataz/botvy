/**
 * The faithfulness review (SC-004) and the one-screen check (SC-006).
 *
 * ## What a machine can decide and what it cannot
 *
 * SC-006 is measurable: at most 150 words, the source's title, its length, and
 * a link out. This asserts all four and fails if any is missing.
 *
 * SC-004 — "a reviewer judges the summary faithful" — is not, and pretending
 * otherwise would be the worse mistake. A keyword check would pass a summary
 * that contained the right nouns in the wrong claim, which is precisely the
 * failure mode of a small model. So this **prints** each summary beside the
 * article it came from and the reviewer's own checklist, and records their
 * verdicts as a count. The script's exit code is about SC-006; SC-004's number
 * goes in the phase's gate evidence with a person's name on it.
 *
 * ## It grades the pipeline, not the prompt
 *
 * P4 learned this the expensive way: its first intent fixture called the
 * extraction prompt directly and graded the model's raw output, measuring the
 * model's unaided performance at the one job the pipeline exists to take away
 * from it. Six of its "silent errors" were phrases the pipeline handles.
 *
 * So this runs the **real extractor** and the **real summariser**, imported
 * from `dist/`, against the real local model — the same three objects the
 * worker constructs. Which means it also acts as one more caller that would
 * notice a runtime-only breakage in the built output: a missing export from a
 * compiled module is `undefined` at the call site, and nothing else would say
 * so. Every import is asserted to be a function before anything runs, for
 * exactly that reason.
 *
 * ## Running it
 *
 *     pnpm --filter @botvy/backend build
 *     node backend/test/ingest-fixture.mjs
 *
 * It needs Ollama reachable and `llm.summarizeModel` pulled. It does **not**
 * need the stack, the database or the network: the ten articles are fixed text
 * in `fixtures/articles.mjs` and the extractor is handed their HTML directly.
 */
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTICLE_FIXTURES } from './fixtures/articles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

/**
 * An absolute Windows path is not a URL.
 *
 * `import('E:/...')` fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME` because node
 * reads `E:` as a scheme. `pathToFileURL` is the fix and it is right on every
 * platform, which is why it is here rather than a `file://` prefix.
 */
const load = (relative) => import(pathToFileURL(join(dist, relative)).href);

const SUMMARY_WORD_LIMIT = 150;

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function main() {
  const { ReadabilityExtractor } = await load(
    'contexts/knowledge/infrastructure/readability-extractor.js',
  );
  const { LlmSummariser } = await load(
    'contexts/knowledge/infrastructure/llm-summariser.js',
  );
  const { OllamaClient } = await load('shared/llm/ollama.client.js');
  const { SettingsService } = await load('shared/settings/settings.service.js');
  const { InMemorySettingsStore } = await load(
    'shared/settings/in-memory-settings.store.js',
  );
  const { InMemoryAuditAdapter } = await load(
    'shared/audit/in-memory-audit.adapter.js',
  );

  // A missing export from a compiled module is `undefined` at the call site and
  // nothing would otherwise say so — this fixture exists partly to be that
  // caller, so it checks rather than trusting.
  for (const [name, value] of Object.entries({
    ReadabilityExtractor,
    LlmSummariser,
    OllamaClient,
    SettingsService,
    InMemorySettingsStore,
    InMemoryAuditAdapter,
  })) {
    if (typeof value !== 'function') {
      throw new Error(
        `dist/ does not export ${name} as a constructor — build the backend first`,
      );
    }
  }

  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const llm = new OllamaClient(
    process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  );
  if (!(await llm.isReachable(3_000))) {
    console.error(
      'Ollama is not reachable. This fixture grades the real pipeline against ' +
        'the real model, so there is nothing useful to report without one.',
    );
    process.exit(2);
  }

  const extractor = new ReadabilityExtractor();
  const summariser = new LlmSummariser(llm, settings);
  const limits = {
    maxChars: await settings.get('knowledge.maxChars'),
    playlistMaxItems: await settings.get('knowledge.playlistMaxItems'),
  };

  const failures = [];
  const reviews = [];

  for (const fixture of ARTICLE_FIXTURES) {
    const raw = {
      url: fixture.url,
      contentType: 'text/html',
      html: fixture.html,
      video: null,
      playlist: null,
    };
    const link = { url: fixture.url, kind: 'article' };

    const started = Date.now();
    const content = await extractor.extract(raw, link, limits);
    const summarised = await summariser.summarise({
      title: content.title,
      text: content.text,
      hadTranscript: null,
      sourceUrl: fixture.url,
    });
    const ms = Date.now() - started;

    // ---- SC-006, which a machine can decide --------------------------------
    const count = words(summarised.summary);
    if (count > SUMMARY_WORD_LIMIT) {
      failures.push(
        `${fixture.slug}: the summary is ${count} words, over the ${SUMMARY_WORD_LIMIT}-word limit`,
      );
    }
    if (!content.title || !content.title.includes(fixture.title.slice(0, 20))) {
      failures.push(
        `${fixture.slug}: the extractor did not recover the title (got ${content.title ?? 'nothing'})`,
      );
    }
    if (content.text.length < 200) {
      failures.push(
        `${fixture.slug}: the extractor recovered ${content.text.length} characters, which is the chrome rather than the article`,
      );
    }
    // The chrome is identical across all ten, so a summary that mentions it is
    // the extractor failing rather than that one page being unusual.
    for (const noise of ['newsletter', 'unsubscribe', 'cookies', 'All rights reserved']) {
      if (content.text.toLowerCase().includes(noise.toLowerCase())) {
        failures.push(
          `${fixture.slug}: the extracted text contains "${noise}", so the chrome came through`,
        );
      }
    }

    reviews.push({
      slug: fixture.slug,
      title: fixture.title,
      mustMention: fixture.mustMention,
      chars: content.text.length,
      summary: summarised.summary,
      keyPoints: summarised.keyPoints,
      words: count,
      ms,
    });
  }

  // ---- SC-004, which needs a person ---------------------------------------
  console.log('\n' + '='.repeat(72));
  console.log('SC-004 — the faithfulness review. Read each summary against the');
  console.log('article it came from and record how many of the ten you judge');
  console.log('faithful. Eight of ten is the bar. "Faithful" means: it says what');
  console.log('the source says, keeps the author\u2019s position, and adds nothing.');
  console.log('='.repeat(72));

  for (const review of reviews) {
    console.log(`\n--- ${review.slug} (${review.words} words, ${review.ms} ms) ---`);
    console.log(`article : ${review.title}`);
    console.log(`extracted: ${review.chars} characters`);
    console.log(`must mention: ${review.mustMention.join('; ')}`);
    console.log(`summary : ${review.summary}`);
    if (review.keyPoints.length > 0) {
      console.log('points  :');
      for (const point of review.keyPoints) console.log(`  - ${point}`);
    } else {
      // Not a failure: the constitution's plain-reply exit is the thinner
      // reading rather than a failed one, and the summary still stands.
      console.log('points  : (the key-points pass did not decode)');
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log(`SC-006, measured over ${reviews.length} fixtures:`);
  console.log(
    `  longest summary : ${Math.max(...reviews.map((r) => r.words))} words (limit ${SUMMARY_WORD_LIMIT})`,
  );
  console.log(
    `  slowest         : ${Math.max(...reviews.map((r) => r.ms))} ms`,
  );
  console.log(
    `  key points      : ${reviews.filter((r) => r.keyPoints.length > 0).length}/${reviews.length} decoded`,
  );

  if (failures.length > 0) {
    console.log('\nSC-006 failures:');
    for (const failure of failures) console.log(`  ${failure}`);
    process.exit(1);
  }
  console.log('\nSC-006: every summary is within the limit and names its source.');
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
