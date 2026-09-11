/**
 * P6's gate, as a command whose output can be pasted into a report.
 *
 * The earlier gates prove the foundation, the two stores, the task and alert
 * pipelines, the per-member clock, the streaming chat and the recurrence
 * engine. This proves what P6 promises and no unit test can:
 *
 *   1. **Slots populate a fortnight, and fast** — SC-001, measured.
 *   2. **The cut-off is right on both sides of it** — SC-002. The gate cannot
 *      move the server's clock, so it moves the *member's cut-off* instead,
 *      which is the honest way round: FR-007 makes it a preference, so a
 *      preference is exactly what a test may change.
 *   3. **A slot removed loses its future sessions and keeps its past ones** —
 *      story 1 scenario 2, and the half of the reconcile that a unit spec can
 *      only assert against an in-memory list.
 *   4. **Logging stores actual beside planned**, and does not complete the
 *      session; **skipping keeps the row**; **deleting leaves the status**.
 *   5. **A past unlogged session reads as missed and is still loggable** —
 *      FR-018, and nothing wrote the word anywhere.
 *   6. **A program apply warns before it replaces, and a logged session is
 *      never in the list** — FR-008's warning half.
 *   7. **A program outlives the horizon.** Weeks two and three of a four-week
 *      program land when `training.materialiseDays` is raised and the pass runs
 *      again — the clearest end-to-end proof of FR-008's second half available
 *      without waiting a fortnight.
 *   8. **A session produces a reminder, and dealing with it clears one** —
 *      FR-014.
 *   9. **The nightly pass is service-only and stamps a heartbeat**, so a job
 *      that stops arriving shows up in `/health`.
 *  10. **All four collections travel over `/sync`**, the profile as a patch.
 *  11. **The two ports P3 and P5 held open are bound**: the evening proposal
 *      names tomorrow's session, and the agenda shows training beside a
 *      meeting. Both were null-returning stubs for three phases.
 *
 * Written against the public surface: REST and GraphQL through Caddy, and
 * `/internal/*` from inside the Docker network, because Caddy does not route it
 * and that is constitution V doing its job.
 *
 * It cleans up after itself: the member deletes their own account at the end,
 * which also exercises this phase's purge handler. The one thing it changes
 * globally is `training.materialiseDays`, and it puts the original back.
 */
import { randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API =
  process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
/*
 * `INTERNAL_SERVICE_TOKEN`, which is the name `.env` uses on the host — compose
 * exports the same secret to n8n as `BOTVY_SERVICE_TOKEN` and
 * `BOTVY_INTERNAL_TOKEN`, and those names exist only inside the container.
 * Reading them here gives an empty `Bearer ` and a 401 on every internal call,
 * which would report as a broken feature rather than a misconfigured gate. P5's
 * gate learned this the same way.
 */
const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const RELAY_TIMEOUT_MS = 45_000;
const DAY_MS = 86_400_000;
const CAIRO = 'Africa/Cairo';

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const skip = (name, why) => {
  results.push({ name, ok: true, detail: `skipped: ${why}`, skipped: true });
  console.log(`SKIP  ${name} — ${why}`);
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

/** `/internal/*`, from inside the Docker network. P3's helper. */
async function internal(path, postData = '', bearer = SERVICE_TOKEN) {
  const args = [
    'exec',
    'botvy-v2-backend-1',
    'wget',
    '-q',
    '-O-',
    `--header=Authorization: Bearer ${bearer}`,
    '--header=Content-Type: application/json',
    `--post-data=${postData}`,
    `http://127.0.0.1:8080/internal${path}`,
  ];
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile('docker', args, { timeout: 180_000 }, (error, stdout) => {
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

// ------------------------------------------------------------ clock helpers
//
// Every moment below is computed from the clock the gate runs on. A gate
// carrying a literal date passes until the day the clock reaches it.

function localDate(instant, zone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function localHhMm(instant, zone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${String(Number(get('hour')) % 24).padStart(2, '0')}:${get('minute')}`;
}

function wall(date, hhmm, zone) {
  const naive = Date.parse(`${date}T${hhmm}:00Z`);
  let guess = naive;
  for (let pass = 0; pass < 3; pass += 1) {
    const readBack = Date.parse(
      `${localDate(new Date(guess), zone)}T${localHhMm(new Date(guess), zone)}:00Z`,
    );
    const drift = readBack - naive;
    if (drift === 0) return new Date(guess);
    guess -= drift;
  }
  return new Date(guess);
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 1 (Monday) to 7 (Sunday) — a slot's `weekday`. */
function isoWeekday(date) {
  const day = new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay();
  return day === 0 ? 7 : day;
}

// ---------------------------------------------------------------- the queries

/*
 * `slotId` is deliberately **not** on the GraphQL `Session` — it is an internal
 * link to the member's timetable, and the read model omits it.
 *
 * This gate asked for it anyway on its first run, and that is worth recording
 * rather than quietly deleting: GraphQL refused the whole query, `data` came
 * back undefined, and **eleven checks failed reading `undefined`** while
 * `/sync` was returning eleven sessions and the agenda eight. It is the same
 * mistake P5's gate made with `limit` where the schema said `first`, and the
 * same cost: a gate reporting a working feature as broken.
 *
 * So the field comes from the `/sync` pull, which does carry it — a better
 * check in any case, because `slotId` is what the materialiser's reconcile
 * turns on and the phone is what needs it. And `sessionRows` below refuses to
 * paper over an error again.
 */
const SESSIONS = `
  query Sessions($from: DateTime!, $to: DateTime!) {
    sessions(from: $from, to: $to) {
      id title sport plannedAt durationMin status isMissed
      exercises { id name sets { targetReps actualReps actualWeightKg done } }
    }
  }`;

const NEXT = `
  query { nextPractice { reason isToday session { id title sport plannedAt status isMissed } } }`;

const AGENDA = `
  query Agenda($from: DateTime!, $to: DateTime!) {
    agenda(from: $from, to: $to) { date items { kind id title occurrenceAt } }
  }`;

/**
 * The session list, or a loud failure.
 *
 * Every read in this gate went through a bare `answer.data?.sessions ?? []`,
 * so a malformed query — one asking for a field the schema does not serve —
 * produced an empty list indistinguishable from a member with no sessions. A
 * gate must never confuse "I asked wrongly" with "the feature is broken", so
 * this throws with the server's own message instead.
 */
async function sessionRows(token, from, to) {
  const answer = await graphql(SESSIONS, token, { from, to });
  if (answer.errors) {
    throw new Error(
      `the sessions query was refused: ${JSON.stringify(answer.errors.map((e) => e.message))}`,
    );
  }
  return answer.data?.sessions ?? [];
}

/** The synced rows, which carry `slotId` where the read model does not. */
async function syncedSessions(sync) {
  const pulled = await sync({ since: null, entities: ['sessions'] });
  return pulled.body?.pull?.sessions ?? [];
}

async function main() {
  if (!SERVICE_TOKEN) {
    record(
      'the gate has a service token',
      false,
      'INTERNAL_SERVICE_TOKEN is unset on the host; the nightly pass and the ' +
        'forced rhythm touch cannot be called, and both would report as broken ' +
        'features rather than as a misconfigured gate',
    );
  }

  const email = `p6-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const installId = randomUUID();

  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: 'P6 Gate',
      locale: 'en',
      timezone: CAIRO,
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
      device: { installId, kind: 'android', name: 'P6 gate phone' },
    },
  });
  if (signedIn.status !== 200) {
    record('the member can sign in', false, JSON.stringify(signedIn.body));
    return;
  }
  const token = signedIn.body.accessToken;
  const sync = (body) =>
    rest('POST', '/sync', { token, body: { installId, ...body } });

  const meAnswer = await graphql(`query { me { id } }`, token);
  const userId = meAnswer.data?.me?.id;

  /*
   * ---- 1. sports, slots, and a populated fortnight (SC-001) -------------
   *
   * Story 1's own example: gym on three days and swimming on one. The weekdays
   * are computed from today so the shape is the same whatever day the gate
   * runs — a fixture naming Monday would test something different on a Monday.
   *
   * **None of the offsets is 0**, and that is load-bearing rather than tidy.
   * The cut-off half of story 2 needs a day whose sessions are all behind the
   * member, because `nextPractice` keeps showing today while any of today's is
   * still ahead — correctly, and it is the spec's own last edge case. With a
   * gym slot at 18:00 today the "after the cut-off" branch is unreachable at
   * every hour before six in the evening, and the gate was reporting the rule
   * that implements the edge case as a failure to implement the cut-off.
   *
   * So today is left empty by the timetable and the cut-off block puts its own
   * finished session on it. Three gym days and one swim day inside the
   * fortnight either way: offsets 1, 3, 5 give six gym sessions and two swims.
   */
  const today = localDate(new Date(), CAIRO);
  const gymDays = [1, 3, 5].map((offset) => isoWeekday(addDays(today, offset)));
  const swimDay = isoWeekday(addDays(today, 6));

  await rest('PUT', '/athlete/sports', {
    token,
    body: { sports: ['gym', 'swimming'] },
  });

  const slots = [
    ...gymDays.map((weekday, index) => ({
      id: `gym-${index}`,
      weekday,
      start: '18:00',
      durationMin: 60,
      sport: 'gym',
      location: 'the gym',
    })),
    {
      id: 'swim-0',
      weekday: swimDay,
      start: '08:00',
      durationMin: 45,
      sport: 'swimming',
      location: null,
    },
  ];

  const beganAt = Date.now();
  const saved = await rest('PUT', '/athlete/slots', { token, body: { slots } });
  record(
    'the weekly slots are saved',
    saved.status < 400,
    `status=${saved.status}${saved.status >= 400 ? ` ${JSON.stringify(saved.body)}` : ''}`,
  );

  const from = wall(today, '00:00', CAIRO).toISOString();
  const to = new Date(Date.parse(from) + 14 * DAY_MS).toISOString();

  const populated = await eventually(async () => {
    const rows = await sessionRows(token, from, to);
    return rows.length >= 8 ? rows : null;
  }, 20_000);
  const elapsed = Date.now() - beganAt;
  record(
    'the coming fortnight populates from the slots (SC-001, under 5 s)',
    Array.isArray(populated) && populated.length >= 8 && elapsed < 5_000,
    `sessions=${populated?.length ?? 0} in ${elapsed} ms`,
  );

  const sports = new Set((populated ?? []).map((row) => row.sport));
  record(
    'both sports are in the week, each recognisable (story 1 scenario 1)',
    sports.has('gym') && sports.has('swimming'),
    `sports=${[...sports].join(',')}`,
  );

  const secondRun = await internal('/training/materialise');
  const afterSecond = await sessionRows(token, from, to);
  record(
    'a second pass creates nothing (the derived id is the uniqueness)',
    secondRun.ok && afterSecond.length === (populated?.length ?? -1),
    `before=${populated?.length} after=${afterSecond.length} ${
      secondRun.ok ? JSON.stringify(secondRun.body) : secondRun.error
    }`,
  );

  /*
   * ---- 2. the cut-off, both sides (SC-002) -----------------------------
   *
   * The gate cannot move the server's clock, so it moves the member's cut-off.
   * That is not a workaround: FR-007 makes the cut-off a preference precisely
   * so it can differ per member, and a preference is the one thing a test is
   * entitled to change.
   *
   * A cut-off of 23:59 puts *now* before it, whatever the hour; 00:01 puts now
   * after it. So the same fortnight answers both halves of story 2 in one run.
   */
  /*
   * Set it, **read it back**, and retry until both agree.
   *
   * Two things this replaced a one-line PATCH for, and each cost a run.
   *
   * A fixture that silently fails to apply is invisible here: the "before the
   * cut-off" half passes whether or not the write landed, because the registry
   * default of 21:00 also puts an early-morning `now` before it. Only the
   * "after" half can tell, and what it reports is a *product* failure. So the
   * write is verified where it happens rather than inferred three lines later.
   *
   * And it has to be retried, because a member's preferences are written by
   * the bootstrap the relay runs on `identity.UserRegistered` — eventual by
   * design, and the same window the materialiser's "the profile does not exist
   * yet" branch exists for. `PATCH /preferences` answers 404 until that lands.
   * The gate used to be slow enough not to notice; the moment the fortnight
   * came back in 654 ms it patched a row that was not there yet.
   */
  const setCutoff = async (value) => {
    const inForce = await eventually(async () => {
      const written = await rest('PATCH', '/preferences', {
        token,
        body: { nextPracticeCutoff: value },
      });
      if (written.status >= 400) return null;
      const read = await graphql(
        `query { preferences { nextPracticeCutoff } }`,
        token,
      );
      return read.data?.preferences?.nextPracticeCutoff === value
        ? value
        : null;
    });
    if (inForce !== value) {
      throw new Error(
        `the cut-off never took: asked for ${value}, last answer ${inForce}`,
      );
    }
    return value;
  };

  /*
   * A session today, and one that has already **finished** — which the first
   * run of this gate got wrong in an instructive way.
   *
   * It created today's session at 23:30, and then expected a cut-off of 00:01
   * to look past today. It does not, and it is right not to: the rule keeps
   * today's session while any of it is still ahead of the member, which is the
   * spec's own last edge case (a 22:00 session and a 21:00 cut-off must not be
   * skipped over). So the gate was asserting the opposite of the requirement.
   *
   * A session at 00:30 that lasted half an hour is finished whenever this runs,
   * so "before the cut-off" still answers `today` and "after" is free to look
   * ahead.
   */
  const todaySessionId = randomUUID();
  await rest('POST', '/sessions', {
    token,
    body: {
      id: todaySessionId,
      plannedAt: wall(today, '00:30', CAIRO).toISOString(),
      durationMin: 30,
      sport: 'gym',
      title: 'Gate session today',
    },
  });

  await setCutoff('23:59');
  const before = await graphql(NEXT, token);
  record(
    "before the cut-off, today's session is the one shown",
    before.data?.nextPractice?.reason === 'today' &&
      before.data?.nextPractice?.isToday === true,
    `reason=${before.data?.nextPractice?.reason} title=${before.data?.nextPractice?.session?.title}`,
  );

  await setCutoff('00:01');
  const after = await graphql(NEXT, token);
  record(
    'after the cut-off, the next future session is shown',
    after.data?.nextPractice?.reason === 'after-cutoff' &&
      after.data?.nextPractice?.isToday === false &&
      Date.parse(after.data?.nextPractice?.session?.plannedAt ?? 0) >
        Date.parse(wall(today, '23:59', CAIRO).toISOString()),
    `reason=${after.data?.nextPractice?.reason} at=${
      after.data?.nextPractice?.session?.plannedAt
    } today=${JSON.stringify(
      (
        await sessionRows(
          token,
          wall(today, '00:00', CAIRO).toISOString(),
          wall(addDays(today, 1), '00:00', CAIRO).toISOString(),
        )
      ).map((row) => `${row.title}@${row.plannedAt}/${row.status}`),
    )}`,
  );

  await setCutoff('21:00');

  /*
   * ---- 3. logging, skipping, deleting ----------------------------------
   */
  const logId = randomUUID();
  await rest('POST', '/sessions', {
    token,
    body: {
      id: logId,
      plannedAt: wall(addDays(today, 1), '18:00', CAIRO).toISOString(),
      durationMin: 60,
      sport: 'gym',
      title: 'Gate log session',
      exercises: [
        {
          id: 'ex-1',
          name: 'Squat',
          notes: null,
          mediaRefs: [],
          sets: [{ targetReps: 5, targetWeightKg: 100, done: false }],
        },
      ],
    },
  });

  const logged = await rest('POST', `/sessions/${logId}/log`, {
    token,
    body: {
      exercises: [
        {
          id: 'ex-1',
          sets: [
            {
              targetReps: 5,
              targetWeightKg: 100,
              actualReps: 5,
              actualWeightKg: 102.5,
              done: true,
            },
          ],
        },
      ],
      notes: 'felt strong',
    },
  });

  const afterLog = await sessionRows(token, from, to);
  const loggedRow = afterLog.find((row) => row.id === logId);
  const set = loggedRow?.exercises?.[0]?.sets?.[0];
  record(
    'what was done sits beside what was planned (FR-004)',
    logged.status < 400 &&
      set?.targetReps === 5 &&
      set?.actualWeightKg === 102.5 &&
      set?.done === true,
    `status=${logged.status} target=${set?.targetReps} actual=${set?.actualWeightKg}`,
  );
  record(
    'logging does not complete the session',
    loggedRow?.status === 'planned',
    `status=${loggedRow?.status}`,
  );

  // The slot-made ones, from the pull rather than the read model — see the
  // note on `SESSIONS`.
  const synced = await syncedSessions(sync);
  const skipId = synced.find(
    (row) =>
      row.slotId &&
      row.slotId !== 'gym-0' &&
      !row.deletedAt &&
      Date.parse(row.plannedAt) >= Date.parse(from) &&
      Date.parse(row.plannedAt) <= Date.parse(to),
  )?.id;
  if (!skipId) {
    skip('skipping keeps the row', 'no slot-made session to skip');
  } else {
    await rest('POST', `/sessions/${skipId}/skip`, { token });
    const afterSkip = await sessionRows(token, from, to);
    const skipped = afterSkip.find((row) => row.id === skipId);
    record(
      'a skipped session stays in the week, marked (FR-005)',
      skipped?.status === 'skipped',
      `present=${Boolean(skipped)} status=${skipped?.status}`,
    );
  }

  /*
   * ---- 4. missed, which nothing writes (FR-018) ------------------------
   */
  const missedId = randomUUID();
  await rest('POST', '/sessions', {
    token,
    body: {
      id: missedId,
      plannedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      durationMin: 60,
      sport: 'gym',
      title: 'Gate missed session',
      exercises: [
        { id: 'ex-1', name: 'Row', notes: null, mediaRefs: [], sets: [] },
      ],
    },
  });

  const withMissed = await sessionRows(
    token,
    new Date(Date.now() - DAY_MS).toISOString(),
    to,
  );
  const missedRow = withMissed.find((row) => row.id === missedId);
  record(
    'a past unlogged session reads as missed, with no status of its own',
    missedRow?.isMissed === true && missedRow?.status === 'planned',
    `isMissed=${missedRow?.isMissed} status=${missedRow?.status}`,
  );

  const lateLog = await rest('POST', `/sessions/${missedId}/complete`, { token });
  const afterLate = await sessionRows(
    token,
    new Date(Date.now() - DAY_MS).toISOString(),
    to,
  );
  const repaired = afterLate.find((row) => row.id === missedId);
  record(
    'it is still loggable late, with no status correction first (FR-018)',
    lateLog.status < 400 &&
      repaired?.status === 'completed' &&
      repaired?.isMissed === false,
    `status=${repaired?.status} isMissed=${repaired?.isMissed}`,
  );

  /*
   * ---- 5. a slot removed ------------------------------------------------
   */
  /*
   * Read through `/sync`, because this is the one check whose whole subject is
   * `slotId` — the field the reconcile turns on, which the read model does not
   * serve. A tombstoned session leaves the read model but stays in the pull as
   * a tombstone, so the assertion is about `deletedAt` rather than absence.
   */
  const beforeRemoval = await syncedSessions(sync);
  const keptCount = beforeRemoval.filter(
    (row) => row.slotId === 'gym-0' && !row.deletedAt,
  ).length;
  await rest('PUT', '/athlete/slots', {
    token,
    body: { slots: slots.filter((slot) => slot.id !== 'gym-0') },
  });

  const afterRemoval = await eventually(async () => {
    const rows = await syncedSessions(sync);
    const live = rows.filter((row) => row.slotId === 'gym-0' && !row.deletedAt);
    return live.length < keptCount ? rows : null;
  });
  const orphans = (afterRemoval ?? []).filter(
    (row) =>
      row.slotId === 'gym-0' &&
      !row.deletedAt &&
      Date.parse(row.plannedAt) > Date.now(),
  );
  record(
    'a removed slot loses its future sessions (story 1 scenario 2)',
    keptCount > 0 && orphans.length === 0,
    `was=${keptCount} future remaining=${orphans.length}`,
  );

  /*
   * ---- 6. a program, its warning, and the horizon (FR-008) -------------
   */
  const programId = randomUUID();
  const weekTemplates = [0, 1, 2, 3].map((index) => ({
    index,
    sessions: [
      {
        templateId: `w${index}`,
        weekday: null,
        title: `Week ${index + 1} session`,
        focus: `block ${index + 1}`,
        exercises: [
          {
            name: 'Bench press',
            notes: null,
            mediaRefs: [],
            sets: [{ targetReps: 5, targetWeightKg: 80 + index * 5 }],
          },
        ],
      },
    ],
  }));

  const created = await rest('POST', '/programs', {
    token,
    body: {
      id: programId,
      title: 'Gate four-week block',
      sport: 'gym',
      source: 'user',
      sourceLinkIds: [],
      weeks: weekTemplates,
    },
  });

  const refused = await rest('POST', `/programs/${programId}/apply`, {
    token,
    body: { startDate: today },
  });
  record(
    'applying over planned content is refused, and says what it would replace',
    created.status < 400 &&
      refused.status === 409 &&
      Array.isArray(refused.body?.wouldReplace) &&
      refused.body.wouldReplace.length > 0,
    `create=${created.status} apply=${refused.status} wouldReplace=${refused.body?.wouldReplace?.length}`,
  );
  record(
    'the session with logged content is not among them (FR-008)',
    !(refused.body?.wouldReplace ?? []).some(
      (entry) => entry.sessionId === logId,
    ),
    `checked ${refused.body?.wouldReplace?.length ?? 0} entries`,
  );

  const forced = await rest('POST', `/programs/${programId}/apply`, {
    token,
    body: { startDate: today, force: true },
  });
  const filled = await eventually(async () => {
    const rows = (await sessionRows(token, from, to)).filter((row) =>
      row.title?.startsWith('Week '),
    );
    return rows.length > 0 ? rows : null;
  });
  record(
    'forcing it fills the fortnight from the week templates',
    forced.status < 400 && (filled ?? []).length > 0,
    `status=${forced.status} filled=${filled?.length ?? 0}`,
  );

  const weeksSeen = new Set((filled ?? []).map((row) => row.title));
  record(
    'only the weeks inside the horizon are filled so far',
    weeksSeen.size > 0 && weeksSeen.size <= 3,
    `titles=${[...weeksSeen].join(' | ')}`,
  );

  /*
   * The clearest proof of FR-008's second half available without waiting a
   * fortnight: raise the horizon and run the pass again. Weeks three and four
   * of the program land *now*, on the way past, rather than having been
   * dropped at apply time.
   */
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    skip('a program outlives the horizon (FR-008)', 'no admin credentials');
  } else {
    const adminSignIn = await rest('POST', '/auth/login', {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const adminToken = adminSignIn.body?.accessToken;
    if (!adminToken) {
      skip('a program outlives the horizon (FR-008)', 'admin sign-in failed');
    } else {
      const raised = await rest('PATCH', '/admin/settings/training.materialiseDays', {
        token: adminToken,
        body: { value: 35 },
      });
      await internal('/training/materialise');

      const wide = await sessionRows(
        token,
        from,
        new Date(Date.parse(from) + 35 * DAY_MS).toISOString(),
      );
      const laterWeeks = new Set(
        wide
          .map((row) => row.title)
          .filter((title) => title?.startsWith('Week ')),
      );
      record(
        'raising the horizon lands the program’s later weeks (FR-008)',
        raised.status < 400 && laterWeeks.size > weeksSeen.size,
        `before=${weeksSeen.size} after=${laterWeeks.size}: ${[...laterWeeks].join(' | ')}`,
      );

      // Put it back, so the gate leaves the installation as it found it.
      await rest('PATCH', '/admin/settings/training.materialiseDays', {
        token: adminToken,
        body: { value: 14 },
      });
    }
  }

  /*
   * ---- 7. archiving rewrites nothing (story 4 scenario 4) --------------
   */
  const archived = await rest('POST', `/programs/${programId}/archive`, { token });
  await internal('/training/materialise');
  const afterArchive = await sessionRows(token, from, to);
  const stillFilled = afterArchive.filter((row) =>
    row.title?.startsWith('Week '),
  );
  record(
    'archiving leaves the sessions it already filled alone',
    archived.status < 400 && stillFilled.length >= (filled?.length ?? 0),
    `was=${filled?.length} now=${stillFilled.length}`,
  );

  /*
   * ---- 8. the reminder (FR-014) ----------------------------------------
   */
  const sessionAlerts = async () => {
    const pulled = await sync({ since: null, entities: ['sessions'] });
    return (pulled.body?.pendingAlerts ?? []).filter(
      (alert) => alert.source?.kind === 'session',
    );
  };

  const planned = await eventually(async () => {
    const alerts = await sessionAlerts();
    return alerts.length > 0 ? alerts : null;
  });
  record(
    'a session produces a reminder before it starts (FR-014)',
    (planned ?? []).length > 0,
    `alerts=${planned?.length ?? 0}`,
  );

  const alertFor = (planned ?? [])[0]?.source?.id;
  if (!alertFor) {
    skip('dealing with a session clears its reminder', 'no session alert');
  } else {
    await rest('POST', `/sessions/${alertFor}/cancel`, { token });
    const cleared = await eventually(async () => {
      const alerts = await sessionAlerts();
      return alerts.every((alert) => alert.source?.id !== alertFor) ? true : null;
    });
    record(
      'a session cancelled stops reminding (FR-014)',
      cleared === true,
      `cleared=${cleared === true}`,
    );
  }

  /*
   * ---- 9. the nightly pass ---------------------------------------------
   */
  const asMember = await internal('/training/materialise', '', token);
  record(
    'the materialise endpoint refuses a member’s own token (constitution VI)',
    asMember.ok === false,
    asMember.ok ? `accepted: ${JSON.stringify(asMember.body)}` : 'refused',
  );

  const health = await (await fetch(`${API}/health`)).json().catch(() => null);
  const jobs = Array.isArray(health?.jobs) ? health.jobs : [];
  const heartbeat = jobs.find((job) => job.job === 'training.materialise');
  record(
    'the pass stamps a heartbeat /health can report',
    Boolean(heartbeat) && heartbeat.stale !== true,
    heartbeat
      ? `stale=${heartbeat.stale} lastOkAt=${heartbeat.lastOkAt}`
      : `jobs=${jobs.map((job) => job.job).join(',') || 'none'}`,
  );

  /*
   * ---- 10. sync ---------------------------------------------------------
   */
  const pulled = await sync({
    since: null,
    entities: ['sessions', 'programs', 'workouts', 'athlete_profile'],
  });
  record(
    'all four collections travel over /sync',
    Array.isArray(pulled.body?.pull?.sessions) &&
      Array.isArray(pulled.body?.pull?.programs) &&
      Array.isArray(pulled.body?.pull?.workouts),
    `sessions=${pulled.body?.pull?.sessions?.length} programs=${pulled.body?.pull?.programs?.length} workouts=${pulled.body?.pull?.workouts?.length}`,
  );
  record(
    'the athlete profile comes back as a patch, not a list',
    pulled.body?.pull?.athlete_profile !== undefined &&
      !Array.isArray(pulled.body?.pull?.athlete_profile),
    `type=${Array.isArray(pulled.body?.pull?.athlete_profile) ? 'array' : typeof pulled.body?.pull?.athlete_profile}`,
  );

  /*
   * ---- 11. the two ports that were stubs for three phases --------------
   */
  const tomorrow = addDays(today, 1);
  const tomorrowSession = (await sessionRows(token, from, to)).find(
    (row) => localDate(new Date(row.plannedAt), CAIRO) === tomorrow,
  );

  if (!userId || !SERVICE_TOKEN) {
    skip("the evening proposal names tomorrow's session", 'no service token');
  } else if (!tomorrowSession) {
    skip("the evening proposal names tomorrow's session", 'nothing tomorrow');
  } else {
    const forcedTouch = await internal(
      '/rhythm/prompt',
      JSON.stringify({ userId, kind: 'plan' }),
    );
    const named = await eventually(async () => {
      const answer = await graphql(`query { conversations { id kind } }`, token);
      const coach = (answer.data?.conversations ?? []).find(
        (row) => row.kind === 'coach',
      );
      if (!coach) return null;
      const messages = await graphql(
        `query M($id: ID!) { messages(conversationId: $id, afterSeq: 0, first: 50) { nodes { content } } }`,
        token,
        { id: coach.id },
      );
      if (messages.errors) return null;
      return (messages.data?.messages?.nodes ?? []).some((node) =>
        String(node.content).toLowerCase().includes(tomorrowSession.sport),
      )
        ? true
        : null;
    });
    record(
      "the evening proposal names tomorrow's session (FR-011, T640)",
      named === true && forcedTouch.ok,
      named === true ? `named ${tomorrowSession.sport}` : 'not named',
    );
  }

  const agenda = await graphql(AGENDA, token, { from, to });
  const trainingItems = (agenda.data?.agenda ?? []).flatMap((day) =>
    day.items.filter((item) => item.kind === 'session'),
  );
  record(
    'the calendar shows training beside meetings (FR-011, T641)',
    trainingItems.length > 0,
    `session items=${trainingItems.length}${agenda.errors ? ` errors=${JSON.stringify(agenda.errors)}` : ''}`,
  );

  const gone = await rest('POST', '/auth/delete-account', {
    token,
    body: { password },
  });
  record(
    'the member can delete their own account, purging all four collections',
    gone.status === 200,
    `status=${gone.status}`,
  );
}

await main().catch((error) => {
  record('the gate ran', false, error.message);
});

const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped);
console.log(
  `\n${results.length - failed.length - skipped.length}/${results.length - skipped.length} checks passed against ${API}` +
    (skipped.length > 0 ? ` (${skipped.length} skipped)` : ''),
);
if (failed.length > 0) {
  console.log('\nfailed:');
  for (const f of failed)
    console.log(`  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
}
process.exit(failed.length === 0 ? 0 : 1);
