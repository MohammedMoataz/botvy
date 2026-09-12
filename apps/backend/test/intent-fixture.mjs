/**
 * Forty sentences against the real model, on the reference host.
 *
 * This is not a unit test and it deliberately lives outside the vitest suite.
 * The unit specs prove the *plumbing* — that a parsed intent becomes a command,
 * that a missing field asks instead of guessing, that a relative phrase is
 * resolved in code. None of them can tell you whether a 3-billion-parameter
 * model actually understands "بعد ساعتين", and a mocked extractor that always
 * returns the right answer proves the mock.
 *
 * So this runs the extraction prompt against Ollama exactly as the backend
 * does — **and then applies the same code-side time resolution the backend
 * applies**, from the compiled `relative-time.js` — over a fixed corpus, and
 * reports two numbers the phase is graded on:
 *
 *   - **SC-002**: at least 36 of 40 correct, and **zero silently-wrong times**.
 *     The second is the one that matters more. A sentence the model fails to
 *     understand costs the member one clarifying question; a sentence it
 *     understands *wrongly* costs them a reminder at the wrong hour that they
 *     will not notice until it does not fire.
 *   - **SC-001**: first-token latency under five seconds.
 *
 * Run it with the stack up:
 *
 *   node apps/backend/test/intent-fixture.mjs
 *
 * It exits non-zero when either criterion fails, so CI *could* gate on it —
 * and deliberately is not wired into one, because the answer depends on the
 * host's GPU and the model the Owner configured. It is a measurement to record
 * with the gate evidence, not a build step.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The compiled relative-time helpers, from `dist`.
 *
 * Imported rather than reimplemented, because a second copy of this arithmetic
 * would be a second thing to get wrong and the whole point of the module is
 * that there is one. Loading the **compiled** file has a second benefit worth
 * naming: it is one more caller that would notice a runtime-only breakage in
 * the built output, which is how a CommonJS/ESM interop bug got through a green
 * suite in P2.
 *
 * A Windows absolute path is not a valid ESM specifier — `E:/...` parses as a
 * URL scheme — so it goes through `pathToFileURL`.
 */
async function loadTimeHelpers() {
  const compiled = join(
    HERE,
    '..',
    'dist',
    'contexts',
    'conversations',
    'domain',
    'relative-time.js',
  );
  try {
    return await import(pathToFileURL(compiled).href);
  } catch (error) {
    throw new Error(
      `could not load ${compiled}: ${error.message}\n` +
        'Run `pnpm --filter @botvy/backend build` first — this fixture grades ' +
        'the pipeline, which resolves relative phrases in code.',
    );
  }
}

let resolveRelativePhrase;
let preferSoonestDay;
let mentionsAMoment;
let mentionsAClock;
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

/**
 * The zone every case is read in.
 *
 * Fixed rather than taken from the environment: the corpus asserts wall-clock
 * answers ("in two hours" from 14:10 is 16:10), and a run in a different zone
 * would grade the model against a different arithmetic. The *code* resolves
 * against the member's zone; this file pins one so the expectations mean
 * something.
 */
const ZONE = 'Africa/Cairo';

/** `YYYY-MM-DDTHH:mm` for an instant, in `ZONE`. */
function wallClock(at) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = String(Number(get('hour')) % 24).padStart(2, '0');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

function localDate(at) {
  return wallClock(at).slice(0, 10);
}

/**
 * Every expected time is expressed as a function of the run's own clock.
 *
 * A corpus with `2026-09-12T16:10` in it starts failing on 13 September, and a
 * corpus dated in the future starts failing the day the clock reaches it. This
 * is the same rule the vitest fixtures follow, and it matters more here because
 * this file is run by hand months apart.
 */
function expectedTimes(now) {
  const plus = (minutes) => wallClock(new Date(now.getTime() + minutes * 60_000));
  const tomorrow = localDate(new Date(now.getTime() + 86_400_000));
  return {
    IN_TWO_HOURS: plus(120),
    IN_THIRTY_MINUTES: plus(30),
    IN_TWO_HOURS_AR: plus(120),
    IN_THIRTY_AR: plus(30),
    TOMORROW_NINE: `${tomorrow}T09:00`,
    TOMORROW_SIX_PM: `${tomorrow}T18:00`,
    TOMORROW_DATE: tomorrow,
  };
}

async function loadPrompt() {
  // The same file the backend reads. A copy of the prompt in this directory
  // would be a corpus grading a prompt that is not in production, which is the
  // one thing this file exists to avoid.
  return readFile(join(HERE, '..', '..', '..', 'ai', 'prompts', 'intent.md'), 'utf8');
}

async function loadCases() {
  const raw = await readFile(join(HERE, 'fixtures', 'intent-cases.json'), 'utf8');
  return JSON.parse(raw);
}

/** The schema the backend hands Ollama, kept in step by being read from source. */
async function loadSchema() {
  const source = await readFile(
    join(HERE, '..', 'src', 'contexts', 'conversations', 'domain', 'intent.ts'),
    'utf8',
  );
  const start = source.indexOf('export const INTENT_SCHEMA = {');
  if (start < 0) throw new Error('INTENT_SCHEMA not found in intent.ts');
  const open = source.indexOf('{', start);
  const end = source.indexOf('} as const;', open);
  if (end < 0) throw new Error('INTENT_SCHEMA is not terminated as expected');

  /*
   * Read out of the TypeScript source rather than duplicated here.
   *
   * A second copy is a copy that goes stale, and a stale one would grade the
   * model against a grammar the backend does not use — which would report a
   * hit rate for a prompt nobody runs. `Function` is a deliberate,
   * narrow eval over a literal this repo owns, and the file it reads is
   * committed beside it.
   */
  const literal = source.slice(open, end + 1);
  return Function(`"use strict"; return (${literal});`)();
}

async function extract({ prompt, schema, model, numCtx, text, now }) {
  const filled = prompt
    .replace('{{now}}', wallClock(now))
    .replace('{{timezone}}', ZONE)
    .replace('{{today}}', localDate(now))
    .replace('{{message}}', text);

  const started = Date.now();
  const response = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: filled }],
      stream: false,
      format: schema,
      options: { num_ctx: numCtx, temperature: 0 },
    }),
  });
  const ms = Date.now() - started;

  if (!response.ok) {
    return { ok: false, ms, error: `HTTP ${response.status}` };
  }
  const body = await response.json();
  const content = body?.message?.content;
  if (!content) return { ok: false, ms, error: 'empty' };

  let intent;
  try {
    intent = JSON.parse(content);
  } catch {
    return { ok: false, ms, error: 'unparseable' };
  }

  /*
   * And then the code-side resolution, exactly as `IntentExtractor` applies it.
   *
   * This is the difference between grading the *prompt* and grading the
   * *system*, and SC-002 is about the system: "at least 36 of 40 produce the
   * correct item with the correct time". A relative phrase never reaches the
   * member as the model wrote it — `resolveRelativePhrase` overrides it and
   * `preferSoonestDay` pulls a bare time back to today — because the model was
   * measured getting both wrong and that is why those functions exist.
   *
   * The first version of this file graded the raw output, so it was reporting
   * the model's unaided performance at the one job the code takes away from it.
   * Six of its "silent time errors" were phrases the pipeline resolves
   * correctly.
   */
  const resolved = resolveRelativePhrase(text, now, ZONE);
  if (resolved) {
    intent.args = { ...intent.args, when: resolved };
  } else if (intent.args?.when) {
    intent.args.when = preferSoonestDay(intent.args.when, text, now, ZONE);
  }

  /*
   * And the guards, which are the other half of what the pipeline does with a
   * time — and were missing here, so this file was reporting silent time errors
   * the product does not have.
   *
   * The same lesson as the paragraph above, one layer along. P4 fixed this file
   * for *resolution*; P5 added `mentionsAMoment` to the extractor and P6 added
   * `mentionsAClock` for slots, and neither reached the runner. So P5's `M06`
   * ("I have an appointment with the doctor, put it in my calendar" — no time
   * given, model invents 08:00) and P6's `S06` scored as silent time errors
   * against a pipeline that drops both. A fixture must grade the pipeline, not
   * the prompt, and "the pipeline" includes the parts that *refuse* an answer.
   *
   * `set_slots` asks the narrower question, because a weekday satisfies the
   * wider one — see `mentionsAClock`'s own note for why that distinction is a
   * fortnight of alarms rather than a nicety.
   */
  if (intent.args?.when) {
    const namesATime =
      intent.name === 'set_slots' ? mentionsAClock(text) : mentionsAMoment(text);
    if (!namesATime) delete intent.args.when;
  }

  return { ok: true, ms, intent };
}

/**
 * Grades one case.
 *
 * Three verdicts rather than two, and the third is the point: a wrong *time* is
 * separated from a wrong *anything else*, because SC-002 tolerates four misses
 * and zero silent time errors. A missing time is a miss (the member gets asked);
 * a present but wrong time is a silent error (the member gets a reminder at the
 * wrong hour).
 */
function grade(expected, actual, times) {
  const problems = [];
  let silentTimeError = false;

  if (actual.name !== expected.name) {
    problems.push(`name=${actual.name} want ${expected.name}`);
  }
  if (expected.scope && actual.scope !== expected.scope) {
    problems.push(`scope=${actual.scope} want ${expected.scope}`);
  }

  if (expected.when) {
    const want = times[expected.when] ?? expected.when;
    const got = actual.args?.when;
    if (!got) {
      problems.push(`when missing, want ${want}`);
    } else if (got.slice(0, 16) !== want.slice(0, 16)) {
      problems.push(`when=${got} want ${want}`);
      // Present and wrong. This is the one SC-002 allows none of.
      silentTimeError = true;
    }
  }

  if (expected.whenAbsent && actual.args?.when) {
    // "remind me to call the dentist" — no time given. A model that invents
    // one here is the same failure as getting a stated one wrong: the member
    // is never asked, and the reminder fires whenever the model felt like.
    problems.push(`when=${actual.args.when} but none was given`);
    silentTimeError = true;
  }

  if (expected.listKind && actual.args?.listKind !== expected.listKind) {
    problems.push(`listKind=${actual.args?.listKind} want ${expected.listKind}`);
  }
  if (expected.metric && actual.args?.metric !== expected.metric) {
    problems.push(`metric=${actual.args?.metric} want ${expected.metric}`);
  }
  if (expected.value !== undefined && actual.args?.value !== expected.value) {
    problems.push(`value=${actual.args?.value} want ${expected.value}`);
  }

  return { pass: problems.length === 0, problems, silentTimeError };
}

async function settings() {
  /*
   * The model and context size come from the registry, and this reads them the
   * only way a script outside the process can: through the API's own settings
   * endpoint when it is reachable, and from the environment otherwise.
   *
   * Not hard-coded, because then a corpus run after the Owner switched models
   * would report a hit rate for a model nobody uses — and "which model" is the
   * single biggest determinant of the number this file prints.
   */
  const model = process.env.BOTVY_CHAT_EXTRACT_MODEL ?? 'qwen2.5:3b-instruct';
  const numCtx = Number(process.env.BOTVY_NUM_CTX ?? 4096);
  return { model, numCtx };
}

async function main() {
  const [prompt, cases, schema, { model, numCtx }, helpers] = await Promise.all([
    loadPrompt(),
    loadCases(),
    loadSchema(),
    settings(),
    loadTimeHelpers(),
  ]);
  ({
    resolveRelativePhrase,
    preferSoonestDay,
    mentionsAMoment,
    mentionsAClock,
  } = helpers);
  /*
   * Named rather than trusted, because a missing export from a *compiled*
   * module is `undefined` at the call site and nothing here would say so —
   * which is how this file came to be grading a pipeline half it did not
   * apply. A `dist` built before the guards existed fails here, loudly, rather
   * than reporting silent time errors the product does not have.
   */
  for (const [name, fn] of Object.entries({
    resolveRelativePhrase,
    preferSoonestDay,
    mentionsAMoment,
    mentionsAClock,
  })) {
    if (typeof fn !== 'function') {
      throw new Error(
        `the compiled relative-time module has no ${name}; rebuild with ` +
          '`pnpm --filter @botvy/backend build`',
      );
    }
  }

  const now = new Date();
  const times = expectedTimes(now);

  console.log(`intent fixture — ${cases.length} cases`);
  console.log(`  model      ${model} (num_ctx ${numCtx})`);
  console.log(`  ollama     ${OLLAMA}`);
  console.log(`  zone       ${ZONE}, now ${wallClock(now)}`);
  console.log('');

  let passed = 0;
  let silentTimeErrors = 0;
  const latencies = [];
  const failures = [];

  for (const testCase of cases) {
    const result = await extract({
      prompt,
      schema,
      model,
      numCtx,
      text: testCase.text,
      now,
    });
    latencies.push(result.ms);

    if (!result.ok) {
      failures.push(`${testCase.id}  [${result.error}]  ${testCase.text}`);
      continue;
    }

    const verdict = grade(testCase.expect, result.intent, times);
    if (verdict.silentTimeError) silentTimeErrors += 1;
    if (verdict.pass) {
      passed += 1;
    } else {
      failures.push(
        `${testCase.id}  ${testCase.text}\n      ${verdict.problems.join('; ')}`,
      );
    }
  }

  latencies.sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

  console.log(`passed              ${passed}/${cases.length}`);
  console.log(`silent time errors  ${silentTimeErrors}  (SC-002 allows 0)`);
  console.log(`extraction latency  median ${median} ms, p95 ${p95} ms`);
  console.log('');

  if (failures.length > 0) {
    console.log('failures:');
    for (const failure of failures) console.log(`  ${failure}`);
    console.log('');
  }

  /*
   * The gate. Extraction latency is not SC-001 — that measures the *chat*
   * model's first token — but it is the floor under it: the turn cannot answer
   * before the extraction returns, so an extraction slower than five seconds
   * makes SC-001 unreachable whatever the chat model does.
   */
  const hitRateOk = passed >= Math.ceil(cases.length * 0.9);
  const timesOk = silentTimeErrors === 0;
  const latencyOk = p95 < 5_000;

  console.log(`SC-002 hit rate     ${hitRateOk ? 'PASS' : 'FAIL'} (need ${Math.ceil(cases.length * 0.9)})`);
  console.log(`SC-002 silent times ${timesOk ? 'PASS' : 'FAIL'}`);
  console.log(`extraction < 5 s    ${latencyOk ? 'PASS' : 'FAIL'} (p95 ${p95} ms)`);

  process.exit(hitRateOk && timesOk && latencyOk ? 0 : 1);
}

await main().catch((error) => {
  console.error(`the fixture could not run: ${error.message}`);
  console.error('Is Ollama reachable, and is the extract model pulled?');
  process.exit(1);
});
