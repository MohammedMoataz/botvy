#!/usr/bin/env node
/**
 * How far away the stores are, measured from the member's side.
 *
 * Phase 028 moved both stores off the machine, and every write is now a
 * round trip over the internet. This measures the paths a member actually
 * feels — one command, a 200-row `/sync` push, a full pull, and one coach
 * turn over the socket — through Caddy like a real client, and prints the
 * numbers that go into `specs/028-hosted-stores/spec.md`. Same shapes as the
 * P2 and P4 gates; no assertions beyond "it worked", because the point is the
 * figure, not the pass.
 *
 *   node infra/measure-stores.mjs            # against EDGE_PORT from .env
 *   node infra/measure-stores.mjs --rows 500 # a bigger push
 */
import { randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API =
  process.env.BOTVY_API_BASE ??
  `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
const ROWS = Number(process.argv[process.argv.indexOf('--rows') + 1]) || 200;

const iso = (d) => d.toISOString();
const ms = (t) => `${Math.round(t)} ms`;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function rest(method, path, { token, body } = {}) {
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function graphql(query, token) {
  const response = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

async function socketClient() {
  const module = await import('socket.io-client');
  return module.io ?? module.default?.io ?? module.default;
}

async function main() {
  const email = `measure-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const installId = randomUUID();

  let t = performance.now();
  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: 'Measure',
      locale: 'en',
      timezone: 'Africa/Cairo',
    },
  });
  if (registered.status >= 400)
    throw new Error(
      `register: ${registered.status} ${JSON.stringify(registered.body)}`,
    );
  const signedIn = await rest('POST', '/auth/login', {
    body: {
      email,
      password,
      device: { installId, kind: 'android', name: 'measure' },
    },
  });
  if (signedIn.status !== 200) throw new Error(`login: ${signedIn.status}`);
  const token = signedIn.body.accessToken;
  console.log(
    `register + sign in (Identity, PostgreSQL)   ${ms(performance.now() - t)}`,
  );

  // One command = one Mongo transaction with an outbox append.
  const singles = [];
  for (let i = 0; i < 20; i += 1) {
    t = performance.now();
    const r = await rest('POST', '/tasks', {
      token,
      body: {
        id: randomUUID(),
        title: `single ${i}`,
        dueAt: iso(new Date(Date.now() + (i + 1) * 3_600_000)),
        allDay: false,
        priority: 3,
      },
    });
    if (r.status !== 200)
      throw new Error(`task: ${r.status} ${JSON.stringify(r.body)}`);
    singles.push(performance.now() - t);
  }
  console.log(
    `POST /tasks ×20 (one tx each)               median ${ms(median(singles))} · min ${ms(Math.min(...singles))} · max ${ms(Math.max(...singles))}`,
  );

  // One push of ROWS creates — what a phone does after a day offline.
  const now = new Date();
  const tasks = Array.from({ length: ROWS }, (_, i) => ({
    op: 'create',
    id: randomUUID(),
    updatedAt: iso(now),
    baseUpdatedAt: null,
    data: {
      title: `pushed ${i}`,
      dueAt: iso(new Date(now.getTime() + (i + 1) * 600_000)),
      allDay: false,
      priority: 4,
    },
  }));
  t = performance.now();
  const pushed = await rest('POST', '/sync', {
    token,
    body: { installId, since: null, entities: ['tasks'], push: { tasks } },
  });
  const pushMs = performance.now() - t;
  const rejected = pushed.body?.rejections?.length ?? 0;
  const pulled = pushed.body?.pull?.tasks?.length ?? 0;
  console.log(
    `POST /sync push ${ROWS} creates + full pull       ${ms(pushMs)} · status ${pushed.status} · rejected ${rejected} · pulled ${pulled}`,
  );
  if (rejected > 0)
    console.log(
      '   first rejection:',
      JSON.stringify(pushed.body.rejections[0]),
    );

  t = performance.now();
  const pull = await rest('POST', '/sync', {
    token,
    body: {
      installId,
      since: null,
      entities: ['tasks', 'labels', 'reminders'],
    },
  });
  console.log(
    `POST /sync full pull, 3 entities            ${ms(performance.now() - t)} · ${pull.body?.pull?.tasks?.length ?? 0} tasks`,
  );

  // A coach turn: accepted (message persisted), first token, done.
  const conversations = await graphql('{ conversations { id kind } }', token);
  const coach = (conversations?.data?.conversations ?? []).find(
    (c) => c.kind === 'coach',
  );
  if (!coach) {
    console.log(
      'coach turn                                   skipped: no coach conversation yet',
    );
    return;
  }
  const io = await socketClient();
  const socket = io(API, {
    path: '/ws',
    auth: { token, installId },
    transports: ['websocket'],
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  const requestId = randomUUID();
  const marks = {};
  const done = new Promise((resolve) => {
    socket.on('chat.accepted', (f) => {
      if (f.requestId === requestId) marks.accepted ??= performance.now();
    });
    socket.on('chat.token', (f) => {
      if (f.requestId === requestId) marks.firstToken ??= performance.now();
    });
    socket.on('chat.done', (f) => {
      if (f.requestId === requestId) {
        marks.done = performance.now();
        resolve(f);
      }
    });
    socket.on('chat.error', (f) => {
      if (f.requestId === requestId) {
        marks.done = performance.now();
        resolve(f);
      }
    });
    setTimeout(() => resolve({ timeout: true }), 120_000);
  });
  t = performance.now();
  socket.emit('chat.send', {
    requestId,
    conversationId: coach.id,
    clientId: randomUUID(),
    text: 'What should I eat before an evening football match?',
    composedAt: iso(new Date()),
  });
  const outcome = await done;
  socket.close();
  const at = (k) => (marks[k] ? ms(marks[k] - t) : '—');
  console.log(
    `coach turn                                   accepted ${at('accepted')} · first token ${at('firstToken')} · done ${at('done')}${outcome.timeout ? ' (timed out)' : ''}${outcome.usage ? ` · model ${outcome.usage.model}` : ''}`,
  );
}

main().catch((error) => {
  console.error(`measure: ${error.message}`);
  process.exit(1);
});
