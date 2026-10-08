#!/usr/bin/env node
/**
 * 032's gate, against the running stack: a meeting link is checked and
 * previewed, and the chat proposes a change and applies it only on a Yes.
 *
 *   node infra/verify-032.mjs
 *
 * Needs the stack up (`docker compose … up -d`) and Ollama reachable from it.
 * A model that reads the sentence differently fails the chat checks honestly —
 * the 3B model's hit rate is recorded in specs/032-…/tasks.md, and a gate that
 * retried until it got lucky would hide that.
 */
import { randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API =
  process.env.BOTVY_API_BASE ??
  `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
const ZONE = 'Africa/Cairo';

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`,
  );
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

async function graphql(query, token, variables) {
  const response = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

async function eventually(check, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

/** The instant of a wall clock in the member's zone. */
function wall(date, hhmm) {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const shown = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(guess);
  const [h, m] = shown.split(':').map(Number);
  const [wantH, wantM] = hhmm.split(':').map(Number);
  return new Date(guess.getTime() - ((h - wantH) * 60 + (m - wantM)) * 60_000);
}

function localDate(at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(at);
}

function hhmmIn(at) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

/** Frames for one request id, until done/error or a timeout. */
function collect(socket, requestId, send, timeoutMs = 180_000) {
  return new Promise((resolve) => {
    const seen = { card: null, done: null, error: null, tokens: [] };
    const handlers = {
      'chat.card': (f) => f.requestId === requestId && (seen.card = f),
      'chat.token': (f) =>
        f.requestId === requestId && seen.tokens.push(f.text),
      'chat.done': (f) =>
        f.requestId === requestId && ((seen.done = f), finish()),
      'chat.error': (f) =>
        f.requestId === requestId && ((seen.error = f), finish()),
    };
    const timer = setTimeout(
      () => ((seen.timedOut = true), finish()),
      timeoutMs,
    );
    function finish() {
      clearTimeout(timer);
      for (const [event, handler] of Object.entries(handlers))
        socket.off(event, handler);
      resolve(seen);
    }
    for (const [event, handler] of Object.entries(handlers))
      socket.on(event, handler);
    send();
  });
}

async function main() {
  const { io } = await import('socket.io-client');
  const email = `g032-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const installId = randomUUID();

  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: '032 Gate',
      locale: 'en',
      timezone: ZONE,
    },
  });
  if (registered.status >= 400) {
    record('a member can register', false, JSON.stringify(registered.body));
    return;
  }
  const signedIn = await rest('POST', '/auth/login', {
    body: {
      email,
      password,
      device: { installId, kind: 'android', name: '032 gate' },
    },
  });
  const token = signedIn.body?.accessToken;
  if (!token) {
    record('the member can sign in', false, JSON.stringify(signedIn.body));
    return;
  }

  // ---- US1: a link is checked ---------------------------------------------
  const tomorrow = localDate(new Date(Date.now() + 86_400_000));
  const refused = await rest('POST', '/meetings', {
    token,
    body: {
      id: randomUUID(),
      title: 'Bad link',
      startAt: wall(tomorrow, '10:00').toISOString(),
      location: { onlineLink: 'javascript:alert(1)' },
    },
  });
  record(
    'a javascript: meeting link is refused',
    refused.status === 400,
    `HTTP ${refused.status} ${JSON.stringify(refused.body)?.slice(0, 120)}`,
  );

  const mapLink =
    'https://www.google.com/maps/place/Cairo+Tower/@30.0459,31.2243,17z';
  const dentistId = randomUUID();
  const created = await rest('POST', '/meetings', {
    token,
    body: {
      id: dentistId,
      title: 'Dentist',
      startAt: wall(tomorrow, '15:00').toISOString(),
      durationMin: 30,
      location: { address: mapLink },
    },
  });
  record(
    'a meeting whose address is a map link is saved',
    created.status === 200 || created.status === 201,
    `HTTP ${created.status}`,
  );

  // ---- US2: the preview ---------------------------------------------------
  const preview = await graphql(
    'query ($url: String) { linkPreview(url: $url) { url title siteName place { lat lng } } }',
    token,
    { url: mapLink },
  );
  const place = preview?.data?.linkPreview?.place;
  record(
    'the preview reads the place out of the map link',
    Boolean(place) &&
      Math.abs(place.lat - 30.0459) < 0.001 &&
      Math.abs(place.lng - 31.2243) < 0.001,
    JSON.stringify(preview?.data ?? preview?.errors),
  );

  // ---- US3 + US4: the chat sees it, and changes it on a Yes ---------------
  const planner = await eventually(async () => {
    const answer = await graphql('{ conversations { id kind } }', token);
    return answer?.data?.conversations?.find((row) => row.kind === 'planner');
  });
  if (!planner) {
    record('the member has a planner chat', false);
    return;
  }

  const socket = io(API, {
    path: '/ws',
    auth: { token, installId },
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });

  const askId = randomUUID();
  const asked = await collect(socket, askId, () =>
    socket.emit('chat.send', {
      requestId: askId,
      conversationId: planner.id,
      clientId: randomUUID(),
      text: 'when is my dentist appointment?',
      composedAt: new Date().toISOString(),
    }),
  );
  const answer = asked.tokens.join('');
  record(
    'the planner answers from the member’s own meetings',
    /15:00|3\s?pm|3:00/i.test(answer),
    answer.slice(0, 160).replace(/\n/g, ' '),
  );

  const moveId = randomUUID();
  const moved = await collect(socket, moveId, () =>
    socket.emit('chat.send', {
      requestId: moveId,
      conversationId: planner.id,
      clientId: randomUUID(),
      text: 'move the dentist to 5pm',
      composedAt: new Date().toISOString(),
    }),
  );
  const proposal = moved.card?.proposal;
  record(
    'an edit arrives as a confirm card, and nothing has changed yet',
    moved.card?.kind === 'confirm' && Boolean(proposal),
    JSON.stringify(moved.card ?? moved.error ?? moved.tokens.join('')).slice(
      0,
      200,
    ),
  );
  const before = await graphql(
    'query ($id: ID!) { meeting(id: $id) { startAt } }',
    token,
    { id: dentistId },
  );
  record(
    'the meeting is untouched before the Yes',
    hhmmIn(new Date(before?.data?.meeting?.startAt)) === '15:00',
  );

  if (proposal) {
    const yesId = randomUUID();
    const yes = await collect(socket, yesId, () =>
      socket.emit('chat.confirm', {
        requestId: yesId,
        proposalId: proposal.id,
        accept: true,
      }),
    );
    const after = await graphql(
      'query ($id: ID!) { meeting(id: $id) { startAt } }',
      token,
      { id: dentistId },
    );
    const at = new Date(after?.data?.meeting?.startAt);
    record(
      'Yes moves it to 17:00 on its own day',
      hhmmIn(at) === '17:00' && localDate(at) === tomorrow,
      `${yes.tokens.join('')} | ${after?.data?.meeting?.startAt}`,
    );

    const againId = randomUUID();
    const again = await new Promise((resolve) => {
      socket.emit(
        'chat.confirm',
        { requestId: againId, proposalId: proposal.id, accept: true },
        resolve,
      );
      setTimeout(() => resolve(null), 10_000);
    });
    record(
      'a second Yes applies nothing',
      again?.ok === false,
      JSON.stringify(again),
    );
  }

  socket.close();
}

await main().catch((error) => {
  record('the gate ran', false, error.message);
});
const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
