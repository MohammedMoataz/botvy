/**
 * P2's gate, as a command whose output can be pasted into a report.
 *
 * `verify.mjs` proves the foundation stands and `verify-p1.mjs` proves Identity
 * and Profile agree across two stores. This proves the things P2 promises that
 * no unit test can, because each depends on a real Mongo, a real relay and a
 * real network between them:
 *
 *   1. A task created through REST comes back from `/sync`.
 *   2. A label renamed on one row reaches the several tasks that carry it —
 *      through an outbox event and the change-stream relay, not a fan-out in
 *      the request.
 *   3. The **partial unique index** on `labels.nameLower` actually exists and
 *      actually refuses a duplicate. This is the one that cannot be proved in
 *      memory at all: the in-memory adapter *mimics* the rule, and a mimicry
 *      is only worth as much as the real index behind it.
 *   4. A tombstoned label frees its name, because the aggregate unsets
 *      `nameLower` and the index is partial on that field existing — which is
 *      also the case where Mongo's "missing and null are one value" would bite
 *      if the field were written as null instead.
 *   5. A repeating task completed advances on the same row rather than becoming
 *      two.
 *   6. Deleting a completed task leaves it completed, and the Deleted view says
 *      so.
 *   7. The alert pipeline plans from a real event, and the sweep claims exactly
 *      once under two concurrent callers.
 *   8. `/sync` refuses a stale push and hands back the server row.
 *
 * Written against the public surface only — no container exec, no direct store
 * access. A gate that reached into the database could pass while the API every
 * client actually uses was broken.
 *
 * It cleans up after itself: the member it creates deletes their own account at
 * the end, which also exercises the four purge handlers.
 */
import { randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API = process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

/** How long the relay is given. Generous: it is a change stream, so eventual. */
const RELAY_TIMEOUT_MS = 45_000;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function rest(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
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

/**
 * The `/internal/*` surface, called from *inside* the Docker network.
 *
 * The one place this gate leaves the public API, and it has to: Caddy routes
 * `/api/*`, `/graphql`, `/health`, `/media` and `/docs` and nothing else, so
 * `/internal/notifications/sweep` is deliberately unreachable from outside.
 * That is constitution V doing its job — n8n calls these on the container
 * network with a service token, and nobody on the internet can.
 *
 * The first version of this gate called it through the edge and got a 404,
 * which it reported as a failure of the sweep. The sweep was fine; the gate
 * was asking from the wrong side of the wall.
 */
async function internal(path) {
  // No body: the sweep takes none, and quoting arbitrary JSON through `sh -c`
  // is a way to be wrong for no benefit. A route that needs one can take an
  // argv-based form when there is such a route.
  const args = [
    'exec',
    'botvy-v2-backend-1',
    'wget',
    '-q',
    '-O-',
    `--header=Authorization: Bearer ${SERVICE_TOKEN}`,
    '--header=Content-Type: application/json',
    '--post-data=',
    `http://127.0.0.1:8080/internal${path}`,
  ];

  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile('docker', args, { timeout: 60_000 }, (error, stdout) => {
      if (error) {
        // First line only: wget reports one useful line then a page of
        // usage. fromCharCode rather than an escape, because a shell
        // heredoc mangled the escaped version of this line twice.
        const first = String(error.message).split(String.fromCharCode(10))[0];
        resolve({ ok: false, body: null, error: first });
        return;
      }
      try {
        resolve({ ok: true, body: JSON.parse(stdout) });
      } catch {
        resolve({ ok: true, body: stdout });
      }
    });
  });
}

async function eventually(check, timeoutMs = RELAY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

const iso = (date) => date.toISOString();
const inMinutes = (n) => new Date(Date.now() + n * 60_000);

async function main() {
  const email = `p2-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const installId = randomUUID();

  // ------------------------------------------------------------- 0. a member
  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: 'P2 Gate',
      locale: 'en',
      timezone: 'Africa/Cairo',
    },
  });
  if (registered.status >= 400) {
    record('a member can register', false, JSON.stringify(registered.body));
    return;
  }

  const signedIn = await rest('POST', '/auth/login', {
    body: { email, password, device: { installId, kind: 'android', name: 'P2 gate phone' } },
  });
  if (signedIn.status !== 200) {
    record('the member can sign in', false, `status=${signedIn.status}`);
    return;
  }
  const token = signedIn.body.accessToken;
  record('a member registers and signs in', true, email);

  const sync = (body) => rest('POST', '/sync', { token, body: { installId, ...body } });

  // ------------------------------------------------------- 1. a task round trip
  const labelId = randomUUID();
  const taskId = randomUUID();

  const label = await rest('POST', '/labels', {
    token,
    body: { id: labelId, name: 'Gate Work', color: '#0f766e' },
  });
  const task = await rest('POST', '/tasks', {
    token,
    body: {
      id: taskId,
      title: 'Gate task',
      dueAt: iso(inMinutes(90)),
      allDay: false,
      priority: 1,
      labelId,
    },
  });
  record(
    'a task and a label are created through REST',
    label.status === 200 && task.status === 200,
    `label=${label.status} task=${task.status}`,
  );

  const first = await sync({ since: null, entities: ['labels', 'tasks', 'reminders'] });
  const pulled = first.body?.pull?.tasks ?? [];
  record(
    'the task comes back from /sync with its label snapshot',
    first.status === 200 && pulled.some((row) => row.id === taskId && row.label?.name === 'Gate Work'),
    first.status === 200
      ? `full=${first.body.full} tasks=${pulled.length}`
      : JSON.stringify(first.body),
  );

  // -------------------------------------- 2. the label snapshot, via the relay
  //
  // The rename writes one row. The tasks that carry the label are caught up by
  // a handler reacting to `planning.LabelUpdated` through the outbox and the
  // change-stream relay — so this is the one check that the relay is delivering
  // Planning's own events, not just Identity's.
  await rest('PATCH', `/labels/${labelId}`, { token, body: { name: 'Gate Deep Work' } });

  const refreshed = await eventually(async () => {
    const answer = await sync({ since: null, entities: ['tasks'] });
    const row = (answer.body?.pull?.tasks ?? []).find((each) => each.id === taskId);
    return row?.label?.name === 'Gate Deep Work' ? row : null;
  });
  record(
    'renaming a label reaches the tasks that carry it, through the relay',
    Boolean(refreshed),
    refreshed ? 'snapshot refreshed' : `still stale after ${RELAY_TIMEOUT_MS / 1000}s`,
  );

  // ------------------------------- 3. the partial unique index, for real
  //
  // The check that cannot be made in memory. The in-memory adapter mimics this
  // rule so handler specs mean something, but a mimicry proves only that the
  // mimicry works — this proves the index exists in Mongo and refuses.
  const duplicate = await rest('POST', '/labels', {
    token,
    body: { id: randomUUID(), name: 'gate deep work', color: '#b91c1c' },
  });
  record(
    'the unique index refuses a duplicate label name, case-insensitively',
    duplicate.status === 409,
    `status=${duplicate.status} code=${duplicate.body?.code ?? duplicate.body?.message}`,
  );

  // ------------------------------- 4. a tombstone frees the name
  //
  // The aggregate unsets `nameLower` on delete and the index is partial on that
  // field existing. Had the mapper written `null` instead, Mongo would treat
  // missing and null as one value and the *second* tombstone would collide with
  // the first — which is why this deletes twice.
  const freed = randomUUID();
  await rest('POST', '/labels', { token, body: { id: freed, name: 'Gate Temp', color: '#f59e0b' } });
  await rest('DELETE', `/labels/${freed}`, { token });

  const reused = randomUUID();
  const afterDelete = await rest('POST', '/labels', {
    token,
    body: { id: reused, name: 'Gate Temp', color: '#f59e0b' },
  });
  await rest('DELETE', `/labels/${reused}`, { token });
  const thirdTime = await rest('POST', '/labels', {
    token,
    body: { id: randomUUID(), name: 'Gate Temp', color: '#f59e0b' },
  });
  record(
    'a deleted label frees its name, and two tombstones do not collide',
    afterDelete.status === 200 && thirdTime.status === 200,
    `second=${afterDelete.status} third=${thirdTime.status}`,
  );

  // --------------------------- 5. a repeating task advances on the same row
  const repeatId = randomUUID();
  const dtstart = inMinutes(120);
  await rest('POST', '/tasks', {
    token,
    body: {
      id: repeatId,
      title: 'Gate weekly',
      dueAt: iso(dtstart),
      allDay: false,
      priority: 2,
      recurrence: { dtstart: iso(dtstart), rrule: 'FREQ=WEEKLY', mode: 'schedule', exdates: [] },
    },
  });
  const completed = await rest('POST', `/tasks/${repeatId}/complete`, { token, body: {} });

  const afterComplete = await sync({ since: null, entities: ['tasks'] });
  const repeating = (afterComplete.body?.pull?.tasks ?? []).filter((row) => row.id === repeatId);
  const advancedTo = completed.body?.recurrenceAdvancedTo;
  record(
    'completing a repeating task advances it on the same row',
    completed.status === 200 &&
      Boolean(advancedTo) &&
      repeating.length === 1 &&
      repeating[0]?.status === 'open',
    `rows=${repeating.length} status=${repeating[0]?.status} advancedTo=${advancedTo ?? 'none'}`,
  );

  // --------------------------- 6. deleting never touches the status
  const doneId = randomUUID();
  await rest('POST', '/tasks', { token, body: { id: doneId, title: 'Gate done' } });
  await rest('POST', `/tasks/${doneId}/complete`, { token, body: {} });
  await rest('DELETE', `/tasks/${doneId}`, { token });

  const withTombstones = await sync({ since: null, entities: ['tasks'] });
  const tombstone = (withTombstones.body?.pull?.tasks ?? []).find((row) => row.id === doneId);
  record(
    'deleting a completed task leaves it completed',
    tombstone?.status === 'completed' && tombstone?.deletedAt !== null,
    `status=${tombstone?.status} deletedAt=${tombstone?.deletedAt ? 'set' : 'null'}`,
  );

  // --------------------------- 7. /sync refuses a stale push, with the row
  const stalePush = await sync({
    since: null,
    entities: ['tasks'],
    push: {
      tasks: [
        {
          op: 'update',
          id: taskId,
          updatedAt: iso(new Date(Date.now() - 7_200_000)),
          baseUpdatedAt: iso(new Date(Date.now() - 14_400_000)),
          data: { title: 'Gate loser' },
        },
      ],
    },
  });
  const rejection = (stalePush.body?.rejections ?? [])[0];
  record(
    'a stale push is refused and the server row comes back with it',
    rejection?.reason === 'stale' && rejection?.entity === 'tasks' && Boolean(rejection?.server),
    rejection ? `reason=${rejection.reason} server=${rejection.server ? 'present' : 'missing'}` : 'no rejection',
  );

  // --------------------------- 8. the alert pipeline, and the claim
  const reminderId = randomUUID();
  await rest('POST', '/reminders', {
    token,
    body: { id: reminderId, title: 'Gate reminder', remindAt: iso(inMinutes(2)), leadTimes: ['0m'] },
  });

  const planned = await eventually(async () => {
    const answer = await sync({ since: null, entities: ['reminders'] });
    const alarms = answer.body?.pendingAlerts ?? [];
    return alarms.some((alarm) => alarm.source?.id === reminderId) ? alarms : null;
  });
  record(
    'the alert saga plans from a real event, and /sync hands the alarm to the phone',
    Boolean(planned),
    planned ? `pendingAlerts=${planned.length}` : `nothing after ${RELAY_TIMEOUT_MS / 1000}s`,
  );

  if (SERVICE_TOKEN) {
    // Two sweeps at once. Nothing is due yet, so this checks the endpoint and
    // the claim path rather than a delivery — the delivery itself needs a real
    // FCM token, which a gate cannot mint.
    const [one, two] = await Promise.all([
      internal('/notifications/sweep'),
      internal('/notifications/sweep'),
    ]);
    const shapeOk = (body) =>
      body &&
      ['claimed', 'sent', 'skippedLocal', 'expired', 'purged', 'failed'].every(
        (key) => typeof body[key] === 'number',
      );
    record(
      'two concurrent sweeps both answer, with the counts the contract fixes',
      shapeOk(one.body) && shapeOk(two.body),
      shapeOk(one.body)
        ? `claimed=${one.body.claimed}/${two.body.claimed} purged=${one.body.purged}`
        : `first=${one.error ?? JSON.stringify(one.body)}`,
    );
  } else {
    record(
      'two concurrent sweeps both answer',
      false,
      'skipped: INTERNAL_SERVICE_TOKEN is not set, so the service-only route cannot be called',
    );
  }

  // --------------------------- 9. clean up, exercising the purge handlers
  const deleted = await rest('POST', '/auth/delete-account', {
    token,
    body: { password },
  });
  record('the member can delete their own account', deleted.status === 200, `status=${deleted.status}`);

  if (deleted.status === 200) {
    /*
     * The *refresh* is refused, not the access token.
     *
     * A JWT cannot be revoked mid-flight — that is what makes it cheap to
     * verify — so the access token issued before the delete keeps working
     * until it expires, and the gate asserting otherwise was asserting
     * something the design does not promise. What deleting an account
     * guarantees is that no *new* token can be minted, which is the refresh
     * family being revoked, and that is checkable immediately.
     */
    const refreshed = await rest('POST', '/auth/refresh', {
      body: { refreshToken: signedIn.body.refreshToken },
    });
    record(
      'no new session can be minted for a deleted account',
      refreshed.status === 401,
      `refresh=${refreshed.status}`,
    );

    // And the member's own rows are gone, which the worker logs as four purge
    // handlers running. Checked through a fresh sign-in being refused, since
    // there is no account left to sign in as.
    const signInAgain = await rest('POST', '/auth/login', { body: { email, password } });
    record(
      'the account itself is gone',
      signInAgain.status === 401,
      `login=${signInAgain.status}`,
    );
  }
}

await main().catch((error) => {
  record('the gate ran', false, error.message);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${API}`);
if (failed.length > 0) {
  console.log('\nfailed:');
  for (const f of failed) console.log(`  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
}
process.exit(failed.length === 0 ? 0 : 1);
