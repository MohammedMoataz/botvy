/**
 * P5's gate, as a command whose output can be pasted into a report.
 *
 * The earlier gates prove the foundation, the two stores, the task and alert
 * pipelines, the per-member clock and the streaming chat. This proves what P5
 * promises and no unit test can, because every one of these needs a real store,
 * a real change stream, or a real clock:
 *
 *   1. **A six-week series with one skip and one move renders five
 *      occurrences, one at the moved time** — SC-001, through the public
 *      GraphQL agenda rather than through the expander a unit test can call.
 *   2. **Monthly on the 31st, both ways.** `BYMONTHDAY=31` skips February;
 *      `BYMONTHDAY=-1` lands on the 28th or 29th. The editor chooses; this
 *      proves the server expands both, which is the half a fixture cannot show
 *      against a real `rrule` build.
 *   3. **A series spanning a clock change keeps its local wall time** — SC-005.
 *   4. **Reminders exist for exactly the live occurrences** and stop for the
 *      skipped one. This is the check the phase's whole alert branch exists
 *      for, and unlike a rhythm touch's alert a meeting's *is* in the future,
 *      so it really does appear in `pendingAlerts`.
 *   5. **Cancelling and completing both clear the alerts**; restoring a deleted
 *      meeting brings them back.
 *   6. **A time-zone change moves an unpinned series and its warnings within
 *      the minute, and leaves a pinned one alone** — FR-014, the requirement
 *      that exists because v1 once shifted every extracted reminder by three
 *      hours and nobody noticed for months.
 *   7. **The nightly reconcile is service-only and stamps its heartbeat**, so a
 *      pass that stops arriving shows up in `/health` within fifteen minutes.
 *      A silent 401 between n8n and the gateway went unnoticed for days once.
 *   8. **Both collections travel over `/sync`**, a purge of a live row is
 *      refused `not_deleted`, and a foreign id is refused `invalid` and never
 *      `stale` — a stale verdict sends the phone into a retry loop against a
 *      rule that will never accept it.
 *   9. **The month overview marks a busy day**, and an empty one stays unmarked.
 *  10. **A personal event repeats, skips and moves like a meeting** — FR-011.
 *  11. **The evening proposal and the morning briefing both name the day's
 *      meetings** — FR-012, and the briefing is the half that gets forgotten.
 *
 * Written against the public surface: REST and GraphQL through Caddy, and
 * `/internal/*` from inside the Docker network, because Caddy does not route it
 * and that is constitution V doing its job.
 *
 * It cleans up after itself: the member deletes their own account at the end,
 * which also exercises this phase's purge handler.
 */
import { randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API =
  process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
/*
 * `INTERNAL_SERVICE_TOKEN`, which is the name **`.env` uses** — and getting this
 * wrong is not hypothetical.
 *
 * Compose exports the same secret to n8n under two *other* names,
 * `BOTVY_SERVICE_TOKEN` and `BOTVY_INTERNAL_TOKEN`, because the cron workflows
 * read one and an earlier version of compose set the other. Those names exist
 * only inside the container. A gate reading them from the host gets `undefined`,
 * sends an empty `Bearer `, and every internal call comes back 401 — which is
 * exactly the silent failure that left no scheduled job running on this
 * installation for two phases, and it would report here as "the reconcile does
 * not work" rather than as "the gate is misconfigured".
 *
 * `verify-p3.mjs` reads `INTERNAL_SERVICE_TOKEN` for the same reason. One name
 * on the host, and the check below says so out loud when it is missing.
 */
const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const RELAY_TIMEOUT_MS = 45_000;
const DAY_MS = 86_400_000;

const CAIRO = 'Africa/Cairo';
const BERLIN = 'Europe/Berlin';

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

/**
 * `/internal/*`, from inside the Docker network. P3's helper, unchanged.
 *
 * `--post-data=` with an empty value is what makes wget send a POST with no
 * body; the reconcile takes none.
 */
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
// Every moment this gate uses is computed from the clock it runs on. A gate
// carrying a literal date passes until the day the clock reaches it, and the
// month-end and clock-change checks below are exactly the ones whose literal
// dates would rot.

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

/** The instant a wall clock names in a zone. The gate's own `wallClockToUtc`. */
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

function addLocalDays(date, days) {
  const moved = new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
  return moved.toISOString().slice(0, 10);
}

/** The next local date whose day-of-month is `day`. */
function nextDayOfMonth(day, zone) {
  let date = localDate(new Date(), zone);
  for (let index = 0; index < 400; index += 1) {
    if (Number(date.slice(8, 10)) === day) return date;
    date = addLocalDays(date, 1);
  }
  return null;
}

/**
 * The next local date in `zone` whose UTC offset differs from the day before.
 *
 * Asked of the zone rather than looked up, so a rule change in some future
 * year leaves the check correct. Midday rather than midnight because a
 * spring-forward gap can swallow 00:30 and make two adjacent days compare
 * equal.
 */
function nextOffsetChange(zone) {
  const offsetAtNoon = (date) =>
    wall(date, '12:00', zone).getTime() - Date.parse(`${date}T12:00:00Z`);
  let date = localDate(new Date(), zone);
  let previous = offsetAtNoon(date);
  for (let index = 0; index < 430; index += 1) {
    const next = addLocalDays(date, 1);
    const offset = offsetAtNoon(next);
    if (offset !== previous) return next;
    previous = offset;
    date = next;
  }
  return null;
}

// ---------------------------------------------------------------- the queries

const AGENDA = `
  query Agenda($from: DateTime!, $to: DateTime!) {
    agenda(from: $from, to: $to) {
      date
      items { kind id occurrenceAt endAt title }
    }
  }`;

const MONTH = `
  query Month($year: Int!, $month: Int!) {
    monthOverview(year: $year, month: $month) { date total busy }
  }`;

const OCCURRENCES = `
  query Occurrences($from: DateTime!, $to: DateTime!) {
    meetingOccurrences(from: $from, to: $to) {
      meetingId originalStart startAt endAt title moved
    }
  }`;

/** Every agenda item of one kind, flattened out of its days. */
function itemsOfKind(agenda, kind) {
  return (agenda ?? []).flatMap((day) =>
    day.items.filter((item) => item.kind === kind),
  );
}

async function main() {
  if (!SERVICE_TOKEN) {
    record(
      'the gate has a service token',
      false,
      'INTERNAL_SERVICE_TOKEN is unset on the host; the internal reconcile and ' +
        'the forced rhythm touch cannot be called, and both would report as ' +
        'broken features rather than as a misconfigured gate',
    );
  }

  const email = `p5-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const installId = randomUUID();

  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: 'P5 Gate',
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
      device: { installId, kind: 'android', name: 'P5 gate phone' },
    },
  });
  if (signedIn.status !== 200) {
    record('the member can sign in', false, JSON.stringify(signedIn.body));
    return;
  }
  const token = signedIn.body.accessToken;
  const sync = (body) =>
    rest('POST', '/sync', { token, body: { installId, ...body } });

  /*
   * ---- 1. six weeks, one skip, one move (SC-001) ----------------------
   *
   * Anchored on tomorrow rather than today so no occurrence is already in the
   * past — a past occurrence would drop out of the alert window below and make
   * the counts argue with each other for a reason that is not a defect.
   */
  const anchorDate = addLocalDays(localDate(new Date(), CAIRO), 1);
  const anchor = wall(anchorDate, '18:00', CAIRO);
  const seriesId = randomUUID();

  const created = await rest('POST', '/meetings', {
    token,
    body: {
      id: seriesId,
      title: 'Standup with Sara',
      startAt: anchor.toISOString(),
      durationMin: 30,
      location: { onlineLink: 'https://meet.example/p5-gate' },
      prepMinutes: 15,
      prepNotes: 'read the notes',
      reminderOffsets: [30],
      recurrence: { dtstart: anchor.toISOString(), rrule: 'FREQ=WEEKLY;COUNT=6' },
    },
  });
  record(
    'a repeating meeting is created through REST',
    created.status === 200 || created.status === 201,
    `status=${created.status}${created.status >= 400 ? ` ${JSON.stringify(created.body)}` : ''}`,
  );

  const windowFrom = wall(anchorDate, '00:00', CAIRO).toISOString();
  const windowTo = new Date(anchor.getTime() + 60 * DAY_MS).toISOString();

  const full = await graphql(AGENDA, token, { from: windowFrom, to: windowTo });
  const fullMeetings = itemsOfKind(full.data?.agenda, 'meeting');
  record(
    'the agenda expands the series to six occurrences',
    fullMeetings.length === 6,
    `occurrences=${fullMeetings.length}${full.errors ? ` errors=${JSON.stringify(full.errors)}` : ''}`,
  );

  const prep = itemsOfKind(full.data?.agenda, 'prep');
  record(
    'each occurrence carries its preparation block (FR-002)',
    prep.length === fullMeetings.length && prep.length > 0,
    `prep=${prep.length} meetings=${fullMeetings.length}`,
  );

  const occurrences = await graphql(OCCURRENCES, token, {
    from: windowFrom,
    to: windowTo,
  });
  const keys = (occurrences.data?.meetingOccurrences ?? []).map(
    (row) => row.originalStart,
  );
  record(
    'the published occurrence read agrees with the agenda',
    keys.length === fullMeetings.length,
    `occurrences=${keys.length} agenda=${fullMeetings.length}`,
  );

  const skipped = keys[2];
  const movedFrom = keys[4];
  const movedTo = new Date(Date.parse(movedFrom) + 3_600_000).toISOString();

  const skipCall = await rest(
    'POST',
    `/meetings/${seriesId}/occurrences/${encodeURIComponent(skipped)}/skip`,
    { token },
  );
  const moveCall = await rest(
    'POST',
    `/meetings/${seriesId}/occurrences/${encodeURIComponent(movedFrom)}/move`,
    { token, body: { startAt: movedTo } },
  );
  record(
    'one occurrence is skipped and one is moved',
    skipCall.status < 400 && moveCall.status < 400,
    `skip=${skipCall.status} move=${moveCall.status}`,
  );

  const bent = await graphql(AGENDA, token, { from: windowFrom, to: windowTo });
  const bentMeetings = itemsOfKind(bent.data?.agenda, 'meeting');
  record(
    'five occurrences remain, one of them at the moved time (SC-001)',
    bentMeetings.length === 5 &&
      bentMeetings.some((item) => item.occurrenceAt === movedTo) &&
      !bentMeetings.some((item) => item.occurrenceAt === skipped),
    `occurrences=${bentMeetings.length} moved=${bentMeetings.some((i) => i.occurrenceAt === movedTo)}`,
  );

  /*
   * ---- 2. monthly on the 31st, both ways -----------------------------
   */
  const thirtyFirst = nextDayOfMonth(31, CAIRO);
  if (!thirtyFirst) {
    skip('monthly on the 31st', 'no 31st within a year, which cannot happen');
  } else {
    const monthStart = wall(thirtyFirst, '10:00', CAIRO);
    const monthWindow = {
      from: monthStart.toISOString(),
      to: new Date(monthStart.getTime() + 400 * DAY_MS).toISOString(),
    };

    for (const [rrule, expectFebruary, label] of [
      ['FREQ=MONTHLY;BYMONTHDAY=31', false, 'BYMONTHDAY=31 skips February'],
      [
        'FREQ=MONTHLY;BYMONTHDAY=-1',
        true,
        'BYMONTHDAY=-1 lands on the last day of February',
      ],
    ]) {
      const id = randomUUID();
      await rest('POST', '/meetings', {
        token,
        body: {
          id,
          title: `rent ${label}`,
          startAt: monthStart.toISOString(),
          durationMin: 15,
          location: { address: 'the bank' },
          reminderOffsets: [],
          recurrence: { dtstart: monthStart.toISOString(), rrule },
        },
      });

      const answer = await graphql(OCCURRENCES, token, monthWindow);
      const mine = (answer.data?.meetingOccurrences ?? []).filter(
        (row) => row.meetingId === id,
      );
      const februaries = mine.filter(
        (row) => localDate(new Date(row.startAt), CAIRO).slice(5, 7) === '02',
      );
      record(
        label,
        expectFebruary
          ? februaries.length === 1 &&
              ['28', '29'].includes(
                localDate(new Date(februaries[0].startAt), CAIRO).slice(8, 10),
              )
          : februaries.length === 0 && mine.length > 5,
        `total=${mine.length} february=${februaries.length}${
          februaries[0]
            ? ` on ${localDate(new Date(februaries[0].startAt), CAIRO)}`
            : ''
        }`,
      );

      await rest('DELETE', `/meetings/${id}`, { token });
    }
  }

  /*
   * ---- 3. a series across a clock change (SC-005) ---------------------
   *
   * Written in Berlin, so Berlin is the authoring zone, and read back on
   * Berlin's clock — the pair the expander distinguishes. A series written in
   * one zone and asserted in another is a fixture describing a member who does
   * not exist.
   */
  const change = nextOffsetChange(BERLIN);
  if (!change) {
    skip('a series keeps its wall time across a clock change', 'no transition found');
  } else {
    const dstStart = addLocalDays(change, -7);
    const dstAnchor = wall(dstStart, '18:00', BERLIN);
    const dstId = randomUUID();

    await rest('PATCH', '/profile', { token, body: { timezone: BERLIN } });
    await rest('POST', '/meetings', {
      token,
      body: {
        id: dstId,
        title: 'across the clocks',
        startAt: dstAnchor.toISOString(),
        durationMin: 30,
        location: { address: 'Berlin' },
        reminderOffsets: [],
        recurrence: {
          dtstart: dstAnchor.toISOString(),
          rrule: 'FREQ=DAILY;COUNT=14',
        },
      },
    });

    const answer = await graphql(OCCURRENCES, token, {
      from: dstAnchor.toISOString(),
      to: new Date(dstAnchor.getTime() + 15 * DAY_MS).toISOString(),
    });
    const mine = (answer.data?.meetingOccurrences ?? []).filter(
      (row) => row.meetingId === dstId,
    );
    const times = new Set(
      mine.map((row) => localHhMm(new Date(row.startAt), BERLIN)),
    );
    const crossed =
      mine.some((row) => localDate(new Date(row.startAt), BERLIN) < change) &&
      mine.some((row) => localDate(new Date(row.startAt), BERLIN) >= change);
    record(
      'every occurrence reads 18:00 across the clock change (SC-005)',
      times.size === 1 && times.has('18:00') && crossed,
      `distinct local times=${[...times].join(',')} crossed=${crossed} count=${mine.length}`,
    );

    await rest('DELETE', `/meetings/${dstId}`, { token });
    await rest('PATCH', '/profile', { token, body: { timezone: CAIRO } });
  }

  /*
   * ---- 4. the alerts ---------------------------------------------------
   *
   * A meeting's alert is in the *future*, so unlike a rhythm touch's it does
   * appear in `pendingAlerts` — which is what makes this readable from the
   * public surface at all. The reconcile is event-driven through the relay, so
   * it is eventual and read through `eventually`.
   */
  const meetingAlerts = async () => {
    const pulled = await sync({ since: null, entities: ['meetings'] });
    // `PendingAlertsQueryHandler` answers `{ source: { kind, id, occurrenceAt },
    // notifyAt, ... }`, so this reads that shape and only that shape. A filter
    // that accepted two spellings would quietly find nothing if the wire
    // changed, and report a working pipeline as broken.
    return (pulled.body?.pendingAlerts ?? []).filter(
      (alert) => alert.source?.kind === 'meeting',
    );
  };

  const planned = await eventually(async () => {
    const alerts = await meetingAlerts();
    return alerts.length > 0 ? alerts : null;
  });
  const forSeries = (planned ?? []).filter(
    (alert) => alert.source?.id === seriesId,
  );
  record(
    'the meeting has reminders planned for its occurrences',
    forSeries.length > 0,
    `alerts=${forSeries.length}`,
  );
  record(
    'no reminder survives for the skipped occurrence (SC-002)',
    !forSeries.some((alert) => alert.source?.occurrenceAt === skipped),
    `checked ${forSeries.length} alert(s) against the skipped occurrence`,
  );

  /*
   * ---- 5. the time-zone re-plan (FR-014) -------------------------------
   *
   * Two meetings, one pinned to Cairo and one not, and one profile change. The
   * pinned one's instants must not move; the unpinned one's must. This is the
   * requirement that exists because resolving a user-facing time against the
   * wrong zone once shifted every reminder in this product by three hours.
   */
  const pinnedId = randomUUID();
  const floatingId = randomUUID();
  const tzAnchorDate = addLocalDays(localDate(new Date(), CAIRO), 2);
  const tzAnchor = wall(tzAnchorDate, '17:00', CAIRO);

  for (const [id, lockTimezone] of [
    [pinnedId, CAIRO],
    [floatingId, null],
  ]) {
    await rest('POST', '/meetings', {
      token,
      body: {
        id,
        title: lockTimezone ? 'pinned to Cairo' : 'follows me',
        startAt: tzAnchor.toISOString(),
        durationMin: 30,
        location: { address: 'somewhere' },
        reminderOffsets: [60],
        ...(lockTimezone ? { lockTimezone } : {}),
        recurrence: {
          dtstart: tzAnchor.toISOString(),
          rrule: 'FREQ=DAILY;COUNT=5',
        },
      },
    });
  }

  const tzWindow = {
    from: tzAnchor.toISOString(),
    to: new Date(tzAnchor.getTime() + 6 * DAY_MS).toISOString(),
  };
  const before = await graphql(OCCURRENCES, token, tzWindow);
  const startsOf = (answer, id) =>
    (answer.data?.meetingOccurrences ?? [])
      .filter((row) => row.meetingId === id)
      .map((row) => row.startAt)
      .sort();

  const pinnedBefore = startsOf(before, pinnedId);
  const floatingBefore = startsOf(before, floatingId);

  await rest('PATCH', '/profile', { token, body: { timezone: BERLIN } });

  const after = await graphql(OCCURRENCES, token, tzWindow);
  const pinnedAfter = startsOf(after, pinnedId);
  const floatingAfter = startsOf(after, floatingId);

  record(
    'a meeting pinned to a place keeps its instants when the member moves',
    pinnedBefore.length > 0 &&
      JSON.stringify(pinnedBefore) === JSON.stringify(pinnedAfter),
    `${pinnedBefore.length} occurrence(s), unchanged=${JSON.stringify(pinnedBefore) === JSON.stringify(pinnedAfter)}`,
  );
  record(
    'an unpinned meeting follows the member, keeping its wall time (FR-014)',
    floatingBefore.length > 0 &&
      JSON.stringify(floatingBefore) !== JSON.stringify(floatingAfter) &&
      new Set(
        floatingAfter.map((start) => localHhMm(new Date(start), BERLIN)),
      ).size === 1 &&
      localHhMm(new Date(floatingAfter[0]), BERLIN) === '17:00',
    `moved=${JSON.stringify(floatingBefore) !== JSON.stringify(floatingAfter)} local=${
      floatingAfter[0] ? localHhMm(new Date(floatingAfter[0]), BERLIN) : 'none'
    }`,
  );

  const replanned = await eventually(async () => {
    const alerts = await meetingAlerts();
    const mine = alerts.filter((alert) => alert.source?.id === floatingId);
    if (mine.length === 0) return null;
    // An hour before a 17:00 Berlin occurrence is 16:00 Berlin. Reading the
    // *warning* rather than the occurrence is the point: FR-014 asks for the
    // advance warnings to move with the meeting, not merely for the calendar
    // to redraw.
    const local = new Set(
      mine.map((alert) => localHhMm(new Date(alert.notifyAt), BERLIN)),
    );
    return local.has('16:00') ? mine : null;
  });
  record(
    "the member's warnings move with the meeting, without waiting a day",
    Boolean(replanned),
    replanned
      ? `${replanned.length} alert(s) at 16:00 Berlin`
      : `nothing at 16:00 Berlin after ${RELAY_TIMEOUT_MS / 1000}s`,
  );

  await rest('PATCH', '/profile', { token, body: { timezone: CAIRO } });

  /*
   * ---- 6. cancelling, completing and restoring -------------------------
   */
  const cancelled = await rest('POST', `/meetings/${pinnedId}/cancel`, { token });
  const cleared = await eventually(async () => {
    const alerts = await meetingAlerts();
    const mine = alerts.filter((alert) => alert.source?.id === pinnedId);
    return mine.length === 0 ? true : null;
  });
  record(
    'cancelling a meeting clears its reminders',
    cancelled.status < 400 && cleared === true,
    `status=${cancelled.status} cleared=${cleared === true}`,
  );

  const deleted = await rest('DELETE', `/meetings/${floatingId}`, { token });
  const pulledAfterDelete = await sync({ since: null, entities: ['meetings'] });
  const tombstone = (pulledAfterDelete.body?.pull?.meetings ?? []).find(
    (row) => row.id === floatingId,
  );
  record(
    'deleting leaves the status untouched, so the Deleted view can show it',
    deleted.status < 400 && Boolean(tombstone?.deletedAt) &&
      tombstone?.status === 'scheduled',
    `deletedAt=${Boolean(tombstone?.deletedAt)} status=${tombstone?.status}`,
  );

  const purgeLive = await rest('DELETE', `/meetings/${seriesId}/purge`, { token });
  record(
    'purging a live row is refused',
    purgeLive.status === 409 || purgeLive.status === 400,
    `status=${purgeLive.status}`,
  );

  /*
   * ---- 7. the nightly reconcile ---------------------------------------
   */
  /*
   * The guard is probed from *inside* the network with the member's own token.
   *
   * Going through Caddy would have proved nothing: Caddy does not route
   * `/internal/*` at all, so the 404 it returns is the edge doing its job and
   * says nothing about whether the endpoint itself would have refused a person.
   * A check that passes for the wrong reason is worse than no check, because it
   * reads green in the phase report.
   *
   * `wget -q` exits non-zero on an HTTP error and prints nothing, so a refusal
   * arrives here as `ok: false` — which is the outcome being asserted. A 200
   * with a JSON body would be the failure.
   */
  const asMember = await internal(
    '/notifications/reconcile-meeting-alerts',
    '',
    token,
  );
  record(
    'the reconcile endpoint refuses a member’s own token (constitution VI)',
    asMember.ok === false,
    asMember.ok ? `accepted: ${JSON.stringify(asMember.body)}` : 'refused',
  );

  if (SERVICE_TOKEN) {
    const pass = await internal('/notifications/reconcile-meeting-alerts');
    record(
      'the nightly reconcile runs with the service token',
      pass.ok && typeof pass.body === 'object' && pass.body !== null,
      pass.ok ? JSON.stringify(pass.body) : pass.error,
    );

    const health = await (await fetch(`${API}/health`)).json().catch(() => null);
    /*
     * The rows are `{ job, lastRunAt, lastOkAt, lastError, stale }` — the key
     * is `job`, not `name`. Worth stating, because reading the wrong key gives
     * `undefined` for every row, the `find` misses, and the check reports a
     * working heartbeat as a missing one. P4's gate made the sibling mistake
     * about this same field, so the detail below prints the names it actually
     * saw rather than only the verdict.
     */
    const jobs = Array.isArray(health?.jobs) ? health.jobs : [];
    const heartbeat = jobs.find(
      (job) => job.job === 'notifications.meeting-alerts',
    );
    record(
      'the reconcile stamps a heartbeat /health can report',
      Boolean(heartbeat) && heartbeat.stale !== true,
      heartbeat
        ? `stale=${heartbeat.stale} lastOkAt=${heartbeat.lastOkAt}`
        : `jobs=${jobs.map((job) => job.job).join(',') || 'none'}`,
    );
  } else {
    skip('the nightly reconcile runs', 'no service token');
  }

  /*
   * ---- 8. sync, and a foreign row -------------------------------------
   */
  const pulled = await sync({
    since: null,
    entities: ['meetings', 'calendar_events'],
  });
  record(
    'both collections travel over /sync',
    Array.isArray(pulled.body?.pull?.meetings) &&
      Array.isArray(pulled.body?.pull?.calendar_events),
    `meetings=${pulled.body?.pull?.meetings?.length} events=${pulled.body?.pull?.calendar_events?.length}`,
  );

  const foreign = await sync({
    since: null,
    entities: ['meetings'],
    push: {
      meetings: [
        {
          id: randomUUID(),
          op: 'update',
          updatedAt: new Date().toISOString(),
          baseUpdatedAt: null,
          fields: { title: 'not mine' },
        },
      ],
    },
  });
  const rejection = (foreign.body?.rejections ?? [])[0];
  record(
    'a push against a row that is not there is refused, and not as stale',
    Boolean(rejection) &&
      rejection.entity === 'meetings' &&
      rejection.reason !== 'stale',
    rejection ? `${rejection.entity}/${rejection.reason}` : 'no rejection',
  );

  /*
   * ---- 9. the month overview ------------------------------------------
   */
  const monthOf = new Date(anchor);
  const month = await graphql(MONTH, token, {
    year: Number(localDate(monthOf, CAIRO).slice(0, 4)),
    month: Number(localDate(monthOf, CAIRO).slice(5, 7)),
  });
  const days = month.data?.monthOverview ?? [];
  const busy = days.filter((day) => day.busy);
  record(
    'the month overview marks the days that hold something (FR-009)',
    busy.length > 0 && busy.every((day) => day.total > 0) &&
      days.some((day) => !day.busy),
    `busy=${busy.length}/${days.length}`,
  );

  /*
   * ---- 10. a personal event (FR-011) ----------------------------------
   */
  const eventId = randomUUID();
  const eventStart = wall(anchorDate, '09:00', CAIRO);
  const eventCreated = await rest('POST', '/calendar-events', {
    token,
    body: {
      id: eventId,
      title: 'Focus block',
      startAt: eventStart.toISOString(),
      endAt: new Date(eventStart.getTime() + 3_600_000).toISOString(),
      allDay: false,
      color: '#0ea5e9',
      recurrence: {
        dtstart: eventStart.toISOString(),
        rrule: 'FREQ=DAILY;COUNT=4',
      },
    },
  });

  const withEvent = await graphql(AGENDA, token, {
    from: windowFrom,
    to: windowTo,
  });
  const eventItems = itemsOfKind(withEvent.data?.agenda, 'event');
  record(
    'a repeating personal event expands onto the agenda (FR-011)',
    eventCreated.status < 400 && eventItems.length === 4,
    `status=${eventCreated.status} occurrences=${eventItems.length}`,
  );

  const eventSkip = await rest(
    'POST',
    `/calendar-events/${eventId}/occurrences/${encodeURIComponent(
      eventItems[1]?.occurrenceAt ?? eventStart.toISOString(),
    )}/skip`,
    { token },
  );
  const afterEventSkip = await graphql(AGENDA, token, {
    from: windowFrom,
    to: windowTo,
  });
  record(
    'one occurrence of an event is skippable, exactly as a meeting is',
    eventSkip.status < 400 &&
      itemsOfKind(afterEventSkip.data?.agenda, 'event').length === 3,
    `status=${eventSkip.status} remaining=${itemsOfKind(afterEventSkip.data?.agenda, 'event').length}`,
  );

  /*
   * ---- 11. the rhythm names the day's meetings (FR-012) ----------------
   *
   * Through P3's forced prompt, which claims the touch unconditionally, so the
   * check does not depend on what time the gate happens to run. The sentence is
   * read out of the coach conversation rather than out of the plan, because it
   * is the sentence the member reads that FR-012 is about.
   */
  /*
   * Two meetings and two touches, because the two touches are about different
   * days — and conflating them is how this check passed for the wrong reason
   * on its first run.
   *
   * The **evening proposal** proposes *tomorrow*; the **morning briefing**
   * describes *today*. A single meeting created today therefore cannot satisfy
   * both, and asserting one title against both touches reports a working
   * evening proposal as broken. So there is one meeting on each day, with
   * distinct titles, and each touch is asserted against its own.
   *
   * The briefing is the half that gets forgotten — the phase's own task file
   * emphasises it — so it is worth having both, separately, rather than one
   * check that could pass on either.
   */
  const today = localDate(new Date(), CAIRO);
  const tomorrow = addLocalDays(today, 1);

  const touchMeetings = [
    { kind: 'morning', day: today, title: 'Gate call today', when: 'the morning briefing' },
    { kind: 'plan', day: tomorrow, title: 'Gate call tomorrow', when: 'the evening proposal' },
  ];

  for (const meeting of touchMeetings) {
    await rest('POST', '/meetings', {
      token,
      body: {
        id: randomUUID(),
        title: meeting.title,
        // 23:30 local, so "today" is still in the member's future whenever the
        // gate runs — a moment already past would be a correct omission and an
        // indistinguishable failure.
        startAt: wall(meeting.day, '23:30', CAIRO).toISOString(),
        durationMin: 15,
        location: { onlineLink: 'https://meet.example/touch' },
        reminderOffsets: [],
      },
    });
  }

  /*
   * The touch is forced through P3's `POST /internal/rhythm/prompt`, which
   * claims the date unconditionally — so this check does not depend on what
   * time of day the gate happens to run. It is service-only, hence `internal`.
   */
  const meAnswer = await graphql(`query { me { id } }`, token);
  const userId = meAnswer.data?.me?.id;

  /*
   * `first`, not `limit`.
   *
   * The read is `messages(conversationId: ID!, afterSeq: Int, first: Int = 50)`
   * — and this asked for `limit`, which GraphQL refuses. The refusal came back
   * as an `errors` array with no `data`, the optional chain read `undefined`,
   * and the check reported "not named": a green pipeline failing a gate because
   * the gate's own query was malformed. Hence the explicit errors check below —
   * a query that cannot even be validated must not be reported as a missing
   * feature.
   */
  const MESSAGES = `
    query M($id: ID!) {
      messages(conversationId: $id, afterSeq: 0, first: 50) {
        nodes { content }
      }
    }`;

  for (const meeting of touchMeetings) {
    if (!userId || !SERVICE_TOKEN) {
      skip(
        `${meeting.when} names the day's meetings`,
        userId ? 'no service token' : 'could not read the member id',
      );
      continue;
    }

    const forced = await internal(
      '/rhythm/prompt',
      JSON.stringify({ userId, kind: meeting.kind }),
    );
    if (!forced.ok) {
      skip(`${meeting.when} names the day's meetings`, `prompt: ${forced.error}`);
      continue;
    }

    let lastError = null;
    const named = await eventually(async () => {
      const answer = await graphql(`query { conversations { id kind } }`, token);
      const coach = (answer.data?.conversations ?? []).find(
        (row) => row.kind === 'coach',
      );
      if (!coach) {
        lastError = 'no coach conversation';
        return null;
      }
      const messages = await graphql(MESSAGES, token, { id: coach.id });
      if (messages.errors) {
        lastError = `graphql: ${JSON.stringify(messages.errors[0]?.message)}`;
        return null;
      }
      const nodes = messages.data?.messages?.nodes ?? [];
      lastError = `${nodes.length} message(s), none naming it`;
      return nodes.some((node) => String(node.content).includes(meeting.title))
        ? true
        : null;
    });
    record(
      `${meeting.when} names the day's meetings (FR-012)`,
      named === true,
      named === true ? `named "${meeting.title}"` : String(lastError),
    );
  }

  const gone = await rest('POST', '/auth/delete-account', {
    token,
    body: { password },
  });
  record(
    'the member can delete their own account, purging both collections',
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
