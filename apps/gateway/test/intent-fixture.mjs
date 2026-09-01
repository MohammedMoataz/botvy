#!/usr/bin/env node
/**
 * Runs the intent fixture against a live Ollama.
 *
 * Not part of `vitest run`: it needs a model loaded and takes a minute. Run it
 * whenever OLLAMA_CHAT_MODEL or prompts/intent.md changes — a smaller model
 * classifies differently, and "it never misfired" was evidence about the model
 * that measurement was taken on, not about the grammar.
 *
 *   node --env-file=../../.env test/intent-fixture.mjs
 */
import { readFile } from 'node:fs/promises';
import { preferSoonestDay, resolveRelativePhrase } from '../dist/chat/relative-time.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/v1\/?$/, '');
const MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'qwen2.5:3b-instruct';
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
const THINKING = process.env.OLLAMA_THINKING === 'true';

const REMINDER_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    remindAt: { type: 'string' },
    needsClarification: { type: 'boolean' },
    clarifyQuestion: { type: 'string' },
  },
  required: ['title', 'remindAt', 'needsClarification', 'clarifyQuestion'],
  additionalProperties: false,
};

const SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['chat', 'set_reminder', 'list_reminders', 'cancel_reminder', 'web_search'],
    },
    title: { type: 'string' },
    remindAt: { type: 'string' },
    query: { type: 'string' },
    needsClarification: { type: 'boolean' },
    clarifyQuestion: { type: 'string' },
  },
  required: ['intent'],
  additionalProperties: false,
};

const fixture = JSON.parse(await readFile(join(HERE, 'fixtures/intent-cases.json'), 'utf8'));
const template = await readFile(join(HERE, '../prompts/intent.md'), 'utf8');

const now = new Date(fixture.now);
const tz = fixture.timezone;
const localNow = new Intl.DateTimeFormat('en-GB', {
  timeZone: tz,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(now);
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: tz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(now);

async function ask(prompt, schema) {
  const response = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      format: schema,
      ...(THINKING ? { think: false } : {}),
      stream: false,
      options: { temperature: 0, num_predict: 512, num_ctx: NUM_CTX },
    }),
  });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  const body = await response.json();
  return { result: JSON.parse(body.message.content), ms: Math.round((body.total_duration ?? 0) / 1e6) };
}

async function classify(message) {
  const prompt = template
    .replaceAll('{{history}}', '(none)')
    .replaceAll('{{message}}', message)
    .replaceAll('{{now}}', localNow)
    .replaceAll('{{timezone}}', tz)
    .replaceAll('{{today}}', today);

  const first = await ask(prompt, SCHEMA);
  if (first.result.intent !== 'set_reminder') return first;

  // Everything below mirrors ChatService.extractIntent, so the fixture measures
  // what the gateway actually does rather than the raw model.
  const relative = resolveRelativePhrase(message, now, tz);
  if (relative) {
    return { result: { ...first.result, remindAt: relative, needsClarification: false }, ms: first.ms };
  }

  let result = first.result;
  let ms = first.ms;
  if (!result.remindAt) {
    const second = await ask(prompt, REMINDER_SCHEMA);
    result = { ...result, ...second.result };
    ms += second.ms;
  }
  if (result.remindAt) {
    result = { ...result, remindAt: preferSoonestDay(result.remindAt, message, now, tz) };
  }
  return { result, ms };
}

let passed = 0;
const failures = [];
const timings = [];

for (const testCase of fixture.cases) {
  const { result, ms } = await classify(testCase.message);
  timings.push(ms);

  const problems = [];
  if (result.intent !== testCase.intent) {
    problems.push(`intent ${result.intent}, expected ${testCase.intent}`);
  }
  // Only checked where the fixture states one: some phrasings are genuinely
  // ambiguous about the date, and pinning those would test the fixture.
  if (testCase.remindAt && !(result.remindAt ?? '').startsWith(testCase.remindAt)) {
    problems.push(`remindAt ${result.remindAt}, expected ${testCase.remindAt}`);
  }
  if (testCase.needsClarification && !result.needsClarification) {
    problems.push('expected it to ask for the missing time');
  }

  if (problems.length === 0) {
    passed += 1;
    console.log(`  ok   ${testCase.message}  (${ms}ms)`);
  } else {
    failures.push({ message: testCase.message, problems });
    console.log(`  FAIL ${testCase.message}  (${ms}ms)`);
    for (const p of problems) console.log(`         ${p}`);
  }
}

timings.sort((a, b) => a - b);
console.log(
  `\n${passed}/${fixture.cases.length} passed · median ${timings[timings.length >> 1]}ms · model ${MODEL}`,
);
process.exit(failures.length === 0 ? 0 : 1);
