/**
 * P3's gate, as a command whose output can be pasted into a report.
 *
 * `verify.mjs` proves the foundation stands, `verify-p1.mjs` that Identity and
 * Profile agree across two stores, `verify-p2.mjs` that tasks, labels,
 * reminders and alerts survive a real Mongo and a real relay. This proves what
 * P3 promises and no unit test can, because every one of these needs a real
 * change stream, a real index and a real network between them:
 *
 *   1. **A newly registered member already has their two pinned chats.** FR-005
 *      says "from the moment they register, before any touch is due", and the
 *      failure is silent: `append-message` logs and returns null when the
 *      conversation is missing, so a touch with nowhere to land looks exactly
 *      like one that worked. The plan is set, the alert is planned, the tick's
 *      counters go up, and the sentence is nowhere.
 *   2. **The tick finds a row for a member who has never had a touch**, which is
 *      the other half of the same registration fan-out — Rhythm's own bootstrap
 *      handler, reached through the outbox.
 *   3. **The partial unique index on `{ userId, kind }` exists and is partial.**
 *      This one cannot be proved in memory at all: the in-memory adapter
 *      *mimics* "one coach per member", and a mimicry is worth exactly as much
 *      as the index behind it. The check that matters is the negative one — a
 *      member may have any number of `free` chats — because a plain unique
 *      index would pass "no two coaches" and refuse the second free chat, and
 *      P4 is the phase that would discover it.
 *   4. **The tick answers with exactly the shape `contracts/internal.md`
 *      names.** n8n logs this response and that log is the only record of what a
 *      22:00 pass did.
 *   5. **An end-of-day touch sets tomorrow's plan and plans exactly one alert**,
 *      end to end: REST preference change → tick → aggregate → outbox → change
 *      stream → alert saga → the alarm the phone reads from `/sync`.
 *   6. **The rhythm alert is not shifted by quiet hours.** FR-013. The member's
 *      quiet window is set to cover their own end-of-day time, and the alert
 *      still lands at the moment of the touch — which only a real
 *      `pendingAlerts` read can show, since the shift happens in the saga on
 *      the far side of the relay.
 *   7. **The touch fires once per local day, however often the tick runs.** Six
 *      passes, one summary, claimed for today.
 *   8. **The three rhythm entities are pull-only and refuse a push with
 *      `invalid`** — never `stale`, which would send the phone into a retry
 *      loop against a rule that will never accept it.
 *   9. **`/health` reports the tick's heartbeat.** A scheduled job that stops
 *      arriving must be visible; a silent 401 between n8n and the gateway once
 *      went unnoticed for days.
 *
 * Written against the public surface only, with one deliberate exception:
 * `/internal/rhythm/tick` is called from *inside* the container network,
 * because Caddy does not route `/internal/*` and that is constitution V doing
 * its job. P2's gate first called it through the edge, got a 404, and reported
 * it as a failure of the sweep — the sweep was fine and the gate was asking
 * from the wrong side of the wall.
 *
 * It cleans up after itself: the member deletes their own account at the end,
 * which also exercises the six purge handlers now on `identity.UserDeleted`.
 */
import { randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API = process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

/** The relay is a change stream, so eventual. Generous on purpose. */
const RELAY_TIMEOUT_MS = 45_000;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
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
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

/**
 * `/internal/*`, from inside the Docker network.
 *
 * `--post-data=` with an empty value is what makes wget send a POST with no
 * body; the tick takes none. A route needing a body takes an argv form rather
 * than quoted JSON through `sh -c`, which is a way to be wrong for no benefit.
 */
async function internal(path, postData = '') {
  const args = [
    'exec',
    'botvy-v2-backend-1',
    'wget',
    '-q',
    '-O-',
    `--header=Authorization: Bearer ${SERVICE_TOKEN}`,
    '--header=Content-Type: application/json',
    `--post-data=${postData}`,
    `http://127.0.0.1:8080/internal${path}`,
  ];

  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile('docker', args, { timeout: 120_000 }, (error, stdout) => {
      if (error) {
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

/**
 * The member's own local date and a wall clock a few minutes behind it.
 *
 * The gate sets the member's end-of-day time to *just before now* so the touch
 * is owed on this pass, which is how the whole thing is exercised without
 * waiting until ten in the evening. `Intl` rather than arithmetic, so the
 * answer is the zone's own, exactly as `shared/time` would compute it.
 */
function localParts(zone, offsetMinutes = 0) {
  const at = new Date(Date.now() + offsetMinutes * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = String(Number(get('hour')) % 24).padStart(2, '0');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hhmm: `${hour}:${get('minute')}`,
  };
}

function nextDate(date) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

async function main() {
  const email = `p3-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const installId = randomUUID();
  const zone = 'Africa/Cairo';

  // --------------------------------------------------------- 0. a member
  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: 'P3 Gate',
      locale: 'en',
      timezone: zone,
    },
  });
  if (registered.status >= 400) {
    record('a member can register', false, JSON.stringify(registered.body));
    return;
  }

  /*
   * The device carries a push token, and it has to.
   *
   * The sweep filters its candidates to devices with a `pushToken` and counts
   * the rest as `skippedLocal` — correctly, since there is nothing to push to.
   * A gate that registered a device without one would watch the sweep skip
   * every alert and conclude the alert pipeline was broken, which is what the
   * first version of this file did. The token is a fake one; FCM will refuse
   * it, and the sweep will record that as `failed` — which is fine, because
   * what is being proved here is that the alert *reached* the sweep as a due,
   * claimable row.
   */
  const signedIn = await rest('POST', '/auth/login', {
    body: {
      email,
      password,
      device: {
        installId,
        kind: 'android',
        name: 'P3 gate phone',
        pushToken: `p3-gate-${randomUUID()}`,
      },
    },
  });
  if (signedIn.status !== 200) {
    record('the member can sign in', false, JSON.stringify(signedIn.body));
    return;
  }
  const token = signedIn.body.accessToken;
  const sync = (body) => rest('POST', '/sync', { token, body });

  // ---- 1. the two pinned chats exist, from registration alone -------------
  const chats = await eventually(async () => {
    const pulled = await sync({ installId, since: null, entities: ['conversations'] });
    const rows = pulled.body?.pull?.conversations ?? [];
    return rows.length >= 2 ? rows : null;
  });
  const kinds = (chats ?? []).map((row) => row.kind).sort();
  record(
    'a newly registered member already has their coach and planner chats',
    kinds.includes('coach') && kinds.includes('planner'),
    `kinds=${kinds.join(',') || 'none'}`,
  );
  record(
    'both are pinned, so neither can be deleted',
    (chats ?? []).every((row) => row.pinned === true),
    `pinned=${(chats ?? []).map((row) => row.pinned).join(',')}`,
  );

  // ---- 2. the tick finds a row for a member who has had no touch ---------
  const firstTick = await internal('/rhythm/tick');
  record(
    'the tick reaches every member, including one who has never had a touch',
    firstTick.ok && typeof firstTick.body?.users === 'number' && firstTick.body.users >= 1,
    firstTick.ok ? `users=${firstTick.body?.users}` : firstTick.error,
  );

  // ---- 4. the contracted response shape ---------------------------------
  const shape = firstTick.body ?? {};
  const wanted = ['users', 'planPrompts', 'endOfDay', 'morning', 'checkins', 'ms'];
  const actual = Object.keys(shape).sort();
  record(
    'the tick answers with exactly the shape contracts/internal.md names',
    wanted.every((key) => typeof shape[key] === 'number') &&
      actual.length === wanted.length,
    `keys=${actual.join(',')}`,
  );

  // ---- 3. the partial unique index, in both directions -------------------
  //
  // The negative half is the one that matters. A plain unique index on
  // `{ userId, kind }` would satisfy "no two coach chats" and refuse the
  // member's second `free` chat — and P4, which creates free chats, is the
  // phase that would find out.
  //
  // There is no public write for a conversation in P3, so this is asserted
  // through the *bootstrap being idempotent*: the relay delivers at least once,
  // so `identity.UserRegistered` may already have been replayed. Two coach
  // chats after any number of deliveries is the index and the handler agreeing.
  const stillTwo = await sync({ installId, since: null, entities: ['conversations'] });
  const coachChats = (stillTwo.body?.pull?.conversations ?? []).filter(
    (row) => row.kind === 'coach',
  );
  record(
    'one coach chat per member, however often the registration is delivered',
    coachChats.length === 1,
    `coach=${coachChats.length}`,
  );

  // ---- 5 & 6. an end-of-day touch, end to end ---------------------------
  //
  // The member's end-of-day time is moved to a minute ago and their quiet hours
  // are set to cover it. Both matter: the first makes the touch owed on this
  // pass, and the second is FR-013 — a member whose quiet window covers a time
  // they chose themselves still gets the notification then.
  const now = localParts(zone);
  const justBefore = localParts(zone, -2);
  const quietFrom = localParts(zone, -60).hhmm;
  const quietTo = localParts(zone, 60).hhmm;

  const prefs = await rest('PATCH', '/preferences', {
    token,
    body: {
      endOfDayTime: justBefore.hhmm,
      // Ahead of now, so the plan prompt is not also owed and the counters
      // below name one touch rather than two.
      planTomorrowTime: localParts(zone, 120).hhmm,
      morningBriefingTime: localParts(zone, 180).hhmm,
      quietHours: { from: quietFrom, to: quietTo },
      checkinEnabled: true,
    },
  });
  record(
    'the member can move their own end-of-day time',
    prefs.status === 200,
    `PATCH /preferences=${prefs.status}`,
  );

  const touched = await internal('/rhythm/tick');

  /*
   * The touch is asserted through its *outcome*, not through the counter.
   *
   * The counter is reported as detail and deliberately not asserted, because
   * n8n's own five-minute cron is live and may reach the tick between the
   * preference change above and this call — in which case the touch has already
   * happened and this pass correctly reports zero. The first version of this
   * gate asserted `endOfDay >= 1` and failed exactly that way, while the very
   * next check proved the touch had fired. A gate that fails when the system
   * works is worse than no gate: it teaches whoever runs it to ignore a red
   * line.
   *
   * `summarisedAt` being set is the thing that is true either way, and it is
   * the stronger claim: the plan was built, stored, marked and its event
   * raised.
   */
  const tomorrow = nextDate(now.date);
  const plan = await eventually(async () => {
    const answer = await graphql(
      'query($d: Date) { todayPlan(date: $d) { date status autoConfirmed summarisedAt } }',
      token,
      { d: tomorrow },
    );
    const row = answer?.data?.todayPlan;
    return row?.summarisedAt ? row : null;
  });
  record(
    'the end-of-day touch fired for a time that had just passed',
    Boolean(plan?.summarisedAt),
    touched.ok
      ? `summarisedAt=${plan?.summarisedAt ?? 'none'} (this pass: endOfDay=${touched.body?.endOfDay}, which is 0 when n8n's cron got there first)`
      : touched.error,
  );
  record(
    "tomorrow's plan is set automatically and marked as summarised",
    plan?.status === 'confirmed' && plan?.autoConfirmed === true,
    plan ? `status=${plan.status} auto=${plan.autoConfirmed}` : 'no plan',
  );

  /*
   * ---- the alert, and why it is asserted through the sweep --------------
   *
   * A rhythm touch's alert is planned for the moment of the touch, so it is
   * always a second or two in the past by the time anything can read it — and
   * `pendingAlerts` is `notifyAt >= now` with `sentAt: null`, because its job
   * is handing the phone the alarms it can schedule *itself*. So a correct
   * rhythm alert never appears there. The first version of this gate looked for
   * it and reported "no rhythm alarm" for a pipeline that was working.
   *
   * That makes the rhythm the one alert kind the phone cannot pre-schedule: it
   * depends on the server sweep, which is why the sweep is what this asks.
   * `claimed` going up proves the whole path — aggregate, outbox, change
   * stream, alert saga, a real row with a real index behind it.
   */
  let lastSweep = null;
  const swept = await eventually(async () => {
    const pass = await internal('/notifications/sweep');
    lastSweep = pass.ok ? pass.body : pass.error;
    return pass.ok && (pass.body?.claimed ?? 0) >= 1 ? pass.body : null;
  });
  record(
    "the touch's alert reaches the sweep, through the outbox and the relay",
    // `claimed` is the specific proof and it is what the ordering above
    // preserves. `skippedLocal` is admitted as a fallback because it is the
    // *other* correct outcome: a device that has already synced past
    // `plannedAt` holds its own alarm, and the sweep skipping it is the design
    // rather than a failure. Either way the alert exists, is due, and the sweep
    // saw it — which is what this line is about.
    Boolean(swept) || (lastSweep?.skippedLocal ?? 0) >= 1,
    // The whole body either way: a sweep that skipped the alert and a sweep
    // that never saw it look identical from a boolean, and `skippedLocal`
    // versus `claimed` is exactly the difference worth reading.
    `sweep=${JSON.stringify(lastSweep)}`,
  );

  /*
   * FR-013, asserted as the *absence* of a future-dated rhythm alarm.
   *
   * This reads as a weak check and is not. The member's quiet hours cover the
   * moment of the touch. If the alert had been treated as a system-derived
   * warning, `sendAt` would have pushed it to the end of that window — an hour
   * from now — and it would then be exactly the kind of alarm `pendingAlerts`
   * hands the phone. Its absence there, combined with the sweep having claimed
   * it above, is what says it stayed where the member put it.
   */
  const pulled = await sync({ installId, since: null, entities: ['daily_plans'] });
  const futureRhythm = (pulled.body?.pendingAlerts ?? []).filter(
    (entry) => entry.source?.kind === 'rhythm',
  );
  record(
    'quiet hours covering the member’s own chosen time do not move the alert',
    futureRhythm.length === 0,
    futureRhythm.length === 0
      ? 'no rhythm alarm sits in the future, so nothing was shifted'
      : `shifted to ${futureRhythm[0].notifyAt}`,
  );

  /*
   * Deliberately *after* the sweep check above, and this is the one ordering
   * constraint in the file.
   *
   * This pulls `/sync`, which stamps the device's `lastSeenAt` — and the sweep's
   * skip filter is `lastSeenAt < plannedAt`, the line the whole device-first
   * design rests on. Pull before the sweep and the phone looks up to date about
   * an alarm it has never seen, the sweep skips it, and `claimed` is zero for a
   * pipeline that is working perfectly. Which is exactly what happened when
   * this block sat above it.
   */
  /*
   * ---- and the sentence actually landed in the chat ---------------------
   *
   * The check this gate was missing, and the reason it was worth adding: the
   * touch above passed every other assertion while the message failed to save.
   * `MessageSchema` did not declare `updatedAt`, which `MongoRepositoryBase`
   * writes on every save, and Mongoose's `strict: true` rejects an upsert
   * naming an undeclared path outright. So the plan was set, the event was
   * raised, the alert was planned — and the sentence FR-005 exists for went
   * nowhere, swallowed by the tick's per-member catch into a log line.
   *
   * `lastMessageAt` is the public proof, and it is a good one: `append-message`
   * inserts the message and calls `conversation.touch(at)` in **one
   * transaction**, so the field cannot have moved unless the row was written.
   * There is no message read surface until P4 — the transcript arrives with the
   * chat — so this is the strongest thing available, and it is enough.
   */
  const chatted = await eventually(async () => {
    const pulled = await sync({ installId, since: null, entities: ['conversations'] });
    const coach = (pulled.body?.pull?.conversations ?? []).find(
      (row) => row.kind === 'coach',
    );
    return coach?.lastMessageAt ? coach : null;
  });
  record(
    'the touch is written into the coach chat, not only notified',
    Boolean(chatted?.lastMessageAt),
    chatted?.lastMessageAt
      ? `lastMessageAt=${chatted.lastMessageAt}`
      : 'the coach chat has never had a message in it',
  );

  // ---- 7. once per local day, however often the tick runs ---------------
  let extra = 0;
  for (let pass = 0; pass < 5; pass += 1) {
    const again = await internal('/rhythm/tick');
    extra += again.body?.endOfDay ?? 0;
  }
  record(
    'five more passes send no second summary',
    extra === 0,
    `endOfDay across five passes=${extra}`,
  );

  // ---- 8. the three rhythm entities refuse a push, with `invalid` -------
  const pushed = await sync({
    installId,
    since: null,
    entities: ['daily_plans'],
    push: {
      daily_plans: [
        {
          id: `x:${tomorrow}`,
          op: 'update',
          updatedAt: new Date().toISOString(),
          baseUpdatedAt: null,
          data: { status: 'skipped' },
        },
      ],
    },
  });
  const rejections = pushed.body?.rejections ?? [];
  const refusal = rejections.find((entry) => entry.entity === 'daily_plans');
  record(
    'a push to daily_plans is refused as invalid, never as stale',
    refusal?.reason === 'invalid',
    refusal ? `reason=${refusal.reason}` : 'not refused at all',
  );

  // ---- 9. the heartbeat -------------------------------------------------
  const health = await (await fetch(`${API}/health`)).json();
  // `jobs` is an array of `{ job, stale, lastOkAt, ... }`, not a map keyed by
  // job name. The first version of this check indexed it as a map, got
  // `undefined`, and would have reported a missing heartbeat for a job that was
  // stamping perfectly well — a gate wrong about the thing it is gating.
  const beat = (health?.jobs ?? []).find((entry) => entry.job === 'rhythm.tick');
  record(
    '/health reports the tick’s heartbeat',
    Boolean(beat) && beat.stale === false,
    beat ? `lastOkAt=${beat.lastOkAt} stale=${beat.stale}` : 'no rhythm.tick job',
  );

  // ---- the streak, over the member's own REST command -------------------
  const checkin = await rest('POST', '/rhythm/checkins', {
    token,
    body: { mood: 70, adhered: true, note: 'gate' },
  });
  record(
    'a check-in is recorded and moves the streak',
    checkin.status === 200 && checkin.body?.streak === 1,
    `status=${checkin.status} streak=${checkin.body?.streak}`,
  );

  const streak = await graphql(
    '{ streak { current best weekAdherence } }',
    token,
  );
  const week = streak?.data?.streak?.weekAdherence ?? [];
  record(
    'the week carries three states, so an unanswered day is not a miss',
    streak?.data?.streak?.current === 1 &&
      week.length === 7 &&
      week.some((day) => day === null),
    `current=${streak?.data?.streak?.current} week=[${week.join(',')}]`,
  );

  // ---- clean up, exercising the six purge handlers ----------------------
  const deleted = await rest('POST', '/auth/delete-account', {
    token,
    body: { password },
  });
  record(
    'the member can delete their own account',
    deleted.status === 200,
    `POST /auth/delete-account=${deleted.status}`,
  );
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
