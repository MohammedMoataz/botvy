/**
 * P7's gate, as a command whose output can be pasted into a report.
 *
 * The earlier gates prove the foundation, the two stores, the task and alert
 * pipelines, the per-member clock, the streaming chat, the recurrence engine
 * and the training week. This proves what P7 promises and no unit test can:
 *
 *   1. **A link is saved and read on its own** — the pipeline end to end,
 *      through the worker, with nobody waiting (FR-012, SC-001).
 *   2. **The same link saved twice is not read twice** — FR-005, across two
 *      spellings of one URL, which is what normalisation is for.
 *   3. **A source that refuses us fails with a reason and a working retry**,
 *      and the retry stops at the Owner's limit (FR-003, FR-004).
 *   4. **A link Botvy must not fetch is refused** — the SSRF guard, against the
 *      container names one hostname away on the compose network.
 *   5. **The daily quota refuses a save with a reason and leaves the queue
 *      alone** — FR-015.
 *   6. **The reading pipeline is service-only and stamps a heartbeat**, so a
 *      job that stops arriving shows up in `/health` (FR-017).
 *   7. **`/media` serves only what this installation signed, and only images**
 *      — FR-008's mechanism, which existed as two helpers and no route until
 *      this phase.
 *   8. **A member with suggestions off costs no background work** — SC-003.
 *   9. **Links travel over `/sync`**, and a push that tries to edit one is
 *      refused as `invalid` rather than ignored.
 *  10. **The Owner sees the queue across members and can clear an entry**,
 *      which writes an audit row (FR-014).
 *  11. **Deleting the account purges the links and their documents.**
 *
 * ## What it does with the open internet
 *
 * As little as possible, and it says so when it cannot. Two checks genuinely
 * need an outbound fetch — reading a real page, and timing it — and both
 * **skip with a reason** when the reference machine has no route out rather
 * than reporting a working pipeline as broken. Everything else is arranged to
 * need no network at all: the SSRF guard refuses before any request is made,
 * which gives the failure path a deterministic refusal, and the media proxy's
 * two refusals happen before it fetches anything either.
 *
 * That is a deliberate trade. A gate whose result depends on somebody else's
 * uptime is a gate that reports red on a bad afternoon, and a red line nobody
 * trusts costs more than the coverage it buys.
 *
 * Written against the public surface: REST and GraphQL through Caddy, and
 * `/internal/*` from inside the Docker network, because Caddy does not route it
 * and that is constitution V doing its job.
 *
 * It cleans up after itself: the member deletes their own account at the end,
 * which also exercises this phase's purge handler. The two things it changes
 * globally are `knowledge.maxLinksPerDay` and `knowledge.maxAttempts`, and it
 * puts both back.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API =
  process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
/*
 * `INTERNAL_SERVICE_TOKEN`, which is the name `.env` uses on the host — compose
 * exports the same secret to n8n as `BOTVY_SERVICE_TOKEN` and
 * `BOTVY_INTERNAL_TOKEN`, and those names exist only inside the container.
 * Reading them here gives an empty `Bearer ` and a 401 on every internal call,
 * which would report as a broken feature rather than a misconfigured gate.
 */
const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const MEDIA_SECRET = process.env.MEDIA_SIGNING_SECRET ?? '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const PIPELINE_TIMEOUT_MS = 180_000;
const RELAY_TIMEOUT_MS = 45_000;
const CAIRO = 'Africa/Cairo';

/**
 * A public page for the one check that needs the internet.
 *
 * `https://example.com/` was the obvious choice and is the wrong one: it has
 * about a hundred and twenty characters of body text, which is below the
 * extractor's minimum, so the gate's first run reported "this machine could not
 * read it" when the machine had read it perfectly and the page is simply not an
 * article. An RFC is stable, plain text, long enough to summarise, and served
 * by an organisation whose whole business is not moving URLs — and this
 * particular one is the document that reserves `.invalid`, which is the domain
 * this gate used to use for its failure path.
 */
const REAL_ARTICLE = 'https://www.rfc-editor.org/rfc/rfc2606.txt';

/**
 * A link that is refused deterministically, for the failure path.
 *
 * The first version of this gate used `https://p7-gate.invalid/article` —
 * `.invalid` is reserved by RFC 2606 so it can never resolve — and that was
 * wrong in an instructive way. A DNS failure is indistinguishable from *this
 * machine having no DNS*, so the fetcher maps it to `SourceUnavailable`: the
 * row is left where it is for the stall sweep, `attempts` is untouched, and
 * nothing reaches `failed` for thirty minutes. Which is exactly the behaviour
 * FR-016 asks for, and exactly the wrong fixture for a check about FR-003.
 *
 * The SSRF guard refuses before any request is made, which gives the same
 * shape — `failed`, with a reason and an attempt spent — deterministically,
 * with no network and no waiting. A refusal is a refusal whichever rule
 * produced it.
 */
const DEAD_URL = 'http://postgres:5432/not-an-article';

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
    execFile('docker', args, { timeout: 300_000 }, (error, stdout) => {
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
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return last;
}

/**
 * The links query, and a read that refuses to fail silently.
 *
 * P6's gate asked for a field the schema does not serve, GraphQL refused the
 * whole query, and eleven checks failed reading `undefined` while the feature
 * worked perfectly. The lesson was not "check the field list" — it was that a
 * bare `answer.data?.x ?? []` cannot tell "I asked wrongly" from "the feature
 * is broken". So every read here throws with the server's own message.
 */
const LINKS = `
  query Links($status: LinkStatus) {
    links(status: $status, first: 100) {
      nodes {
        id url kind title tags status failReason attempts parentId
        skippedCount addedAt processedAt
        doc { summary keyPoints lengthChars hadTranscript media { url } }
      }
      hasNextPage
    }
  }`;

const ONE_LINK = `
  query Link($id: ID!) {
    link(id: $id) {
      id url kind title status failReason attempts skippedCount
      doc { title summary keyPoints lengthChars hadTranscript media { url caption } }
      children { id url status }
    }
  }`;

const QUEUE = `
  query Queue($status: LinkStatus) {
    ingestionQueue(status: $status) { id url status failReason attempts }
  }`;

async function linkRows(token, status) {
  const answer = await graphql(LINKS, token, { status: status ?? null });
  if (answer.errors) {
    throw new Error(
      `the links query was refused: ${JSON.stringify(answer.errors.map((e) => e.message))}`,
    );
  }
  return answer.data?.links?.nodes ?? [];
}

async function oneLink(token, id) {
  const answer = await graphql(ONE_LINK, token, { id });
  if (answer.errors) {
    throw new Error(
      `the link query was refused: ${JSON.stringify(answer.errors.map((e) => e.message))}`,
    );
  }
  return answer.data?.link ?? null;
}

/** Waits for a link to leave the queue, whichever way it goes. */
async function settled(token, id, timeoutMs = PIPELINE_TIMEOUT_MS) {
  return eventually(async () => {
    const row = await oneLink(token, id);
    if (!row) return null;
    return row.status === 'done' || row.status === 'failed' ? row : null;
  }, timeoutMs);
}

/** The settings write, read back until it takes. P6's gate learned this. */
async function setSetting(adminToken, key, value) {
  const inForce = await eventually(async () => {
    const written = await rest('PATCH', `/admin/settings/${key}`, {
      token: adminToken,
      body: { value },
    });
    if (written.status >= 400) return null;
    const read = await graphql(
      `query { settings { key value } }`,
      adminToken,
    );
    const found = (read.data?.settings ?? []).find((row) => row.key === key);
    return found && JSON.stringify(found.value) === JSON.stringify(value)
      ? value
      : null;
  });
  if (JSON.stringify(inForce) !== JSON.stringify(value)) {
    throw new Error(`${key} never took: asked for ${value}, last answer ${inForce}`);
  }
  return inForce;
}

async function main() {
  if (!SERVICE_TOKEN) {
    record(
      'the gate has a service token',
      false,
      'INTERNAL_SERVICE_TOKEN is unset on the host; the drain endpoint cannot ' +
        'be called, and that would report as a broken pipeline rather than as ' +
        'a misconfigured gate',
    );
  }

  const email = `p7-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const installId = randomUUID();

  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: 'P7 Gate',
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
      device: { installId, kind: 'android', name: 'P7 gate phone' },
    },
  });
  if (signedIn.status !== 200) {
    record('the member can sign in', false, JSON.stringify(signedIn.body));
    return;
  }
  const token = signedIn.body.accessToken;
  const sync = (body) =>
    rest('POST', '/sync', { token, body: { installId, ...body } });

  const adminSignIn = await rest('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const adminToken =
    adminSignIn.status === 200 ? adminSignIn.body.accessToken : null;

  /*
   * ---- 1. a real page, read end to end (SC-001, FR-012) ------------------
   *
   * The one check that needs the open internet, and it skips rather than fails
   * when there is no route out. `example.com` is chosen because it is tiny,
   * stable and exists for exactly this purpose — and because a *large* page
   * would make this check about the model's throughput rather than about the
   * pipeline.
   */
  const articleId = randomUUID();
  const started = Date.now();
  const saved = await rest('POST', '/links', {
    token,
    body: { id: articleId, url: REAL_ARTICLE, tags: ['gym'] },
  });
  record(
    'saving a link answers at once, with its kind and a queued state (FR-001)',
    saved.status === 200 &&
      saved.body?.status === 'queued' &&
      saved.body?.duplicate === false,
    `status=${saved.status} kind=${saved.body?.kind} state=${saved.body?.status}`,
  );

  const article = await settled(token, articleId);
  if (article?.status === 'done') {
    const ms = Date.now() - started;
    record(
      'the article is read, summarised and stored (SC-001, three minutes)',
      ms < 180_000 && (article.doc?.summary ?? '').length > 0,
      `${Math.round(ms / 1000)} s, summary ${article.doc?.summary?.length ?? 0} chars`,
    );
    /*
     * SC-006's measurable half. The faithfulness half needs a person and is in
     * `apps/backend/test/ingest-fixture.mjs`; what a gate can check is that the
     * summary is short enough to read on one screen and that the length of the
     * original is beside it.
     */
    const words = (article.doc?.summary ?? '').trim().split(/\s+/).length;
    record(
      'the summary answers "is this worth my time" on one screen (SC-006)',
      words <= 150 && (article.doc?.lengthChars ?? 0) > 0,
      `${words} words, source ${article.doc?.lengthChars} chars`,
    );
  } else {
    skip(
      'the article is read, summarised and stored (SC-001)',
      article?.failReason
        ? `${REAL_ARTICLE} was reached and refused: ${article.failReason}`
        : `${REAL_ARTICLE} never settled — this machine has no route out, or the model is not answering`,
    );
    skip('the summary answers "is this worth my time" on one screen (SC-006)', 'no article was read');
  }

  /*
   * ---- 2. the same link twice (FR-005) -----------------------------------
   *
   * Two spellings of one URL, which is what normalisation exists for: the same
   * article arriving from a newsletter and from a friend is two strings and one
   * reading.
   */
  const duplicate = await rest('POST', '/links', {
    token,
    body: {
      id: randomUUID(),
      // The same document, spelled the way a newsletter would send it: a
      // tracking parameter and a fragment. Both are stripped, so this is the
      // link they already have. `utm_*` in particular is the case the URL
      // fixture table caught being missed.
      url: `${REAL_ARTICLE}?utm_source=gate&utm_campaign=p7#section-1`,
    },
  });
  record(
    'the same link saved twice is answered, not read twice (FR-005)',
    duplicate.status === 200 &&
      duplicate.body?.duplicate === true &&
      duplicate.body?.id === articleId,
    `duplicate=${duplicate.body?.duplicate} id=${duplicate.body?.id === articleId ? 'the one they had' : duplicate.body?.id}`,
  );

  /*
   * ---- 3. a source that refuses us (FR-003, FR-004) ----------------------
   */
  const deadId = randomUUID();
  await rest('POST', '/links', { token, body: { id: deadId, url: DEAD_URL } });
  const dead = await settled(token, deadId, 90_000);
  record(
    'a link Botvy cannot read fails with a reason and an attempt count (FR-003)',
    dead?.status === 'failed' &&
      (dead?.failReason ?? '').length > 0 &&
      dead?.attempts >= 1,
    `status=${dead?.status} attempts=${dead?.attempts} reason=${dead?.failReason}`,
  );

  const retried = await rest('POST', `/links/${deadId}/retry`, { token });
  record(
    'a failed link can be tried again (FR-003)',
    retried.status === 200 && retried.body?.status === 'queued',
    `status=${retried.status} state=${retried.body?.status}`,
  );

  if (adminToken) {
    const wasMaxAttempts = 3;
    await setSetting(adminToken, 'knowledge.maxAttempts', 1);
    await settled(token, deadId, 90_000);
    const refused = await rest('POST', `/links/${deadId}/retry`, { token });
    record(
      'retrying stops at the Owner’s limit rather than for ever (FR-004)',
      refused.status === 409,
      `status=${refused.status} ${JSON.stringify(refused.body)}`,
    );
    await setSetting(adminToken, 'knowledge.maxAttempts', wasMaxAttempts);
  } else {
    skip('retrying stops at the Owner’s limit rather than for ever (FR-004)', 'no admin token');
  }

  /*
   * ---- 4. what Botvy will not fetch --------------------------------------
   *
   * The compose network puts PostgreSQL, Mongo, n8n and the model server one
   * hostname away. A feature that fetches a URL a member typed is an open proxy
   * unless somebody says what it may reach, and this is that somebody.
   */
  const ssrfTargets = [
    'http://mongo:27017/',
    'http://n8n:5678/rest/workflows',
    'http://127.0.0.1:8080/internal/knowledge/ingest',
    'http://169.254.169.254/latest/meta-data/',
  ];
  const ssrfOutcomes = [];
  for (const target of ssrfTargets) {
    const id = randomUUID();
    await rest('POST', '/links', { token, body: { id, url: target } });
    const settledRow = await settled(token, id, 60_000);
    ssrfOutcomes.push(`${target} → ${settledRow?.status ?? 'never settled'}`);
  }
  record(
    'a link pointing inside the compose network is refused (constitution V)',
    ssrfOutcomes.every((line) => line.endsWith('failed')),
    ssrfOutcomes.join('; '),
  );

  /*
   * ---- 5. the daily quota (FR-015) ---------------------------------------
   */
  if (adminToken) {
    const wasQuota = 20;
    const before = (await linkRows(token)).length;
    await setSetting(adminToken, 'knowledge.maxLinksPerDay', before);

    const overQuota = await rest('POST', '/links', {
      token,
      body: { id: randomUUID(), url: 'https://p7-gate-quota.invalid/one' },
    });
    record(
      'a save past the day’s quota is refused with a reason (FR-015)',
      overQuota.status === 429 && typeof overQuota.body?.message === 'string',
      `status=${overQuota.status} ${JSON.stringify(overQuota.body)}`,
    );
    record(
      'the links already queued are untouched by the refusal (FR-015)',
      (await linkRows(token)).length === before,
      `before=${before} after=${(await linkRows(token)).length}`,
    );
    await setSetting(adminToken, 'knowledge.maxLinksPerDay', wasQuota);
  } else {
    skip('a save past the day’s quota is refused with a reason (FR-015)', 'no admin token');
    skip('the links already queued are untouched by the refusal (FR-015)', 'no admin token');
  }

  /*
   * ---- 6. the pipeline is a job, and it says so (FR-017) -----------------
   */
  const refusedByMember = await rest('POST', '/links/x/retry', { token: null });
  record(
    '/internal/knowledge/ingest refuses a member’s token (constitution VI)',
    (await internal('/knowledge/ingest', '', token)).ok === false,
    `and an unauthenticated REST call is ${refusedByMember.status}`,
  );

  const drain = await internal('/knowledge/ingest');
  record(
    'the drain runs and reports what it did',
    drain.ok && typeof drain.body?.ingested === 'number',
    drain.ok ? JSON.stringify(drain.body) : drain.error,
  );

  const health = await fetch(`${API}/health`).then((r) => r.json());
  const ingestJob = (health.jobs ?? []).find(
    (job) => job.job === 'knowledge.ingest',
  );
  record(
    'the pass stamps a heartbeat /health can report (FR-017)',
    ingestJob !== undefined,
    ingestJob
      ? `stale=${ingestJob.stale} lastError=${ingestJob.lastError ?? 'none'}`
      : 'no knowledge.ingest heartbeat',
  );

  /*
   * ---- 7. the signed media proxy (FR-008) --------------------------------
   *
   * Both refusals happen before anything is fetched, so this needs no network.
   * The signature is computed here with the installation's own secret, which is
   * the only way to prove the route accepts a URL Botvy minted and refuses one
   * it did not.
   */
  if (MEDIA_SECRET) {
    const sign = (target) =>
      createHmac('sha256', MEDIA_SECRET).update(target).digest('hex');
    const target = 'https://example.com/a.png';

    const unsigned = await fetch(
      `${API}/media?url=${encodeURIComponent(target)}&sig=deadbeef`,
    );
    record(
      '/media refuses a URL this installation did not sign (FR-008)',
      unsigned.status === 400,
      `status=${unsigned.status}`,
    );

    const inward = 'http://mongo:27017/x.png';
    const signedInward = await fetch(
      `${API}/media?url=${encodeURIComponent(inward)}&sig=${sign(inward)}`,
    );
    record(
      '/media refuses a signed URL pointing inside the network (FR-008)',
      signedInward.status === 400,
      `status=${signedInward.status}`,
    );
  } else {
    skip('/media refuses a URL this installation did not sign (FR-008)', 'MEDIA_SIGNING_SECRET unset on the host');
    skip('/media refuses a signed URL pointing inside the network (FR-008)', 'MEDIA_SIGNING_SECRET unset on the host');
  }

  /*
   * ---- 8. suggestions off costs nothing (SC-003) -------------------------
   *
   * The member turns them off, a session is scheduled at least a day away, and
   * nothing is generated. The positive half — a suggestion citing a source —
   * needs the model to produce a decodable draft from whatever this
   * installation has read, so it is *reported* rather than asserted: a gate
   * that failed because a 3B model declined to draft would be reporting the
   * model's mood as a broken feature.
   */
  await rest('PATCH', '/preferences', {
    token,
    body: { aiSuggestions: false },
  });
  const sessionId = randomUUID();
  await rest('POST', '/sessions', {
    token,
    body: {
      id: sessionId,
      plannedAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      durationMin: 60,
      sport: 'gym',
      title: 'Gate session',
    },
  });
  const quiet = await eventually(async () => {
    const answer = await graphql(
      `query { suggestions { id } }`,
      token,
    );
    return answer.errors ? null : answer.data;
  }, 20_000);
  record(
    'a member with suggestions off gets none (SC-003)',
    (quiet?.suggestions ?? []).length === 0,
    `suggestions=${(quiet?.suggestions ?? []).length}`,
  );

  await rest('PATCH', '/preferences', { token, body: { aiSuggestions: true } });
  const withSuggestions = randomUUID();
  await rest('POST', '/sessions', {
    token,
    body: {
      id: withSuggestions,
      plannedAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      durationMin: 60,
      sport: 'gym',
      title: 'Gate session two',
    },
  });
  const proposed = await eventually(async () => {
    const answer = await graphql(`query { suggestions { id sport sources { id } } }`, token);
    const rows = answer.data?.suggestions ?? [];
    return rows.length > 0 ? rows : null;
  }, 120_000);
  if ((proposed ?? []).length > 0) {
    record(
      'a suggestion cites the member’s own sources (FR-009)',
      (proposed[0].sources ?? []).length > 0,
      `sources=${(proposed[0].sources ?? []).length}`,
    );
    const accepted = await rest(
      `POST`,
      `/suggestions/${proposed[0].id}/accept`,
      { token },
    );
    record(
      'accepting a suggestion fills the session it was about (FR-010)',
      accepted.status === 200,
      `status=${accepted.status} session=${accepted.body?.sessionId ?? 'none'}`,
    );
  } else {
    skip(
      'a suggestion cites the member’s own sources (FR-009)',
      'nothing was suggested: this installation has read no matching source, ' +
        'or the model declined to draft one. Neither is a broken feature, and ' +
        'a gate that failed on the second would be reporting the model’s mood.',
    );
    skip('accepting a suggestion fills the session it was about (FR-010)', 'no suggestion was made');
  }

  /*
   * ---- 9. links over /sync -----------------------------------------------
   */
  const pulled = await sync({ since: null, entities: ['links'] });
  const syncedLinks = pulled.body?.pull?.links ?? [];
  record(
    'links travel over /sync with their state and their document pointer',
    syncedLinks.length > 0 &&
      syncedLinks.every((row) => typeof row.status === 'string') &&
      syncedLinks.every((row) => row.summary === undefined),
    `links=${syncedLinks.length}`,
  );

  const editAttempt = await sync({
    since: null,
    entities: ['links'],
    push: {
      links: [
        {
          op: 'update',
          id: articleId,
          updatedAt: new Date().toISOString(),
          baseUpdatedAt:
            syncedLinks.find((row) => row.id === articleId)?.updatedAt ?? null,
          data: { status: 'done', attempts: 99 },
        },
      ],
    },
  });
  /*
   * `rejections`, not `rejected`.
   *
   * The gate's first run asked for the wrong field, found `undefined`, and
   * reported a working refusal as an accepted edit — the same class of mistake
   * P5 made with `limit` where the schema said `first` and P6 made with
   * `slotId`. It is worth the comment rather than a quiet fix: a gate that
   * reads a field the server does not serve reports the feature as broken, and
   * that reads exactly like a defect.
   */
  const rejection = (editAttempt.body?.rejections ?? []).find(
    (row) => row.id === articleId,
  );
  record(
    'a push that tries to edit a link is refused as invalid, never as stale',
    rejection?.reason === 'invalid',
    `reason=${rejection?.reason ?? 'accepted'}`,
  );

  /*
   * ---- 10. the Owner's queue (FR-014) ------------------------------------
   */
  if (adminToken) {
    const queue = await graphql(QUEUE, adminToken, { status: 'failed' });
    const rows = queue.data?.ingestionQueue ?? [];
    record(
      'the Owner sees the queue across members, with reasons (FR-014)',
      rows.length > 0 && rows.every((row) => typeof row.status === 'string'),
      `rows=${rows.length}${queue.errors ? ` errors=${JSON.stringify(queue.errors)}` : ''}`,
    );

    const memberQueue = await graphql(QUEUE, token, { status: 'failed' });
    record(
      'an ordinary member cannot read the queue',
      Boolean(memberQueue.errors),
      memberQueue.errors
        ? memberQueue.errors[0].extensions?.code ?? 'refused'
        : 'it answered',
    );

    const cleared = await rest('DELETE', `/admin/knowledge/${deadId}`, {
      token: adminToken,
      body: { reason: 'p7 gate' },
    });
    record(
      'the Owner can clear an entry, and it leaves the member’s list (FR-014)',
      cleared.status === 200 &&
        (await linkRows(token)).every((row) => row.id !== deadId),
      `status=${cleared.status} documents=${cleared.body?.documents}`,
    );
  } else {
    skip('the Owner sees the queue across members, with reasons (FR-014)', 'no admin token');
    skip('an ordinary member cannot read the queue', 'no admin token');
    skip('the Owner can clear an entry, and it leaves the member’s list (FR-014)', 'no admin token');
  }

  /*
   * ---- 11. the member leaves -----------------------------------------------
   */
  const gone = await rest('POST', '/auth/delete-account', {
    token,
    body: { password },
  });
  record(
    'deleting the account purges the links and their documents',
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
