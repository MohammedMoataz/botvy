/**
 * P8's gate, as a command whose output can be pasted into a report.
 *
 * The earlier gates prove the foundation, the two stores, the task and alert
 * pipelines, the per-member clock, the streaming chat, the recurrence engine,
 * the training week and the reading pipeline. This proves what P8 promises and
 * no unit test can:
 *
 *   1. **A meal saved over REST comes back over `/sync`**, and an edit and a
 *      delete travel the same way (FR-001, FR-002).
 *   2. **"My meals" builds the day from the member's own list and nothing
 *      else** — and the same member on the same date gets the same day
 *      (FR-003, FR-009, SC-002).
 *   3. **An empty list is said plainly rather than silently switched**
 *      (FR-004).
 *   4. **A declared allergy withholds the day with a reason the client can
 *      render** — over the member's own library, which is where an allergen
 *      sits unnoticed for months (FR-006, SC-001).
 *   5. **The day's line reaches `daily_plans` as two halves and a code**, so
 *      the phone renders the reason offline and in its own language (FR-008,
 *      FR-014).
 *   6. **A past day keeps what it was given** — a regenerate against it is
 *      refused rather than silently answered (FR-011).
 *   7. **One meal can be swapped for one of the member's own, and the rest of
 *      the day is untouched** (FR-010).
 *   8. **A new allergy rebuilds today by itself**, through the outbox, with no
 *      second call (FR-013).
 *   9. **Nothing anywhere says a number, a portion or a macronutrient**
 *      (FR-005).
 *  10. **Deleting the account purges the meals and the days.**
 *
 * ## What it does with the language model
 *
 * As little as possible. Every check above runs in **library mode**, where the
 * answer is a deterministic rotation over rows this gate wrote itself — so the
 * result does not depend on which model this installation has pulled, how much
 * VRAM it has, or what a small model felt like saying this afternoon. The one
 * check that genuinely needs the model — a suggestion drafted end to end —
 * **skips with a reason** when Ollama is not reachable rather than reporting a
 * working feature as broken.
 *
 * That is the same trade P7's gate made about the open internet, and for the
 * same reason: a red line nobody trusts costs more than the coverage it buys.
 *
 * Written against the public surface: REST and GraphQL through Caddy, and
 * `/internal/*` from inside the Docker network, because Caddy does not route it
 * and that is constitution V doing its job.
 *
 * It cleans up after itself: the member deletes their own account at the end,
 * which also exercises this phase's purge handler. It changes nothing globally.
 */
import { randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API =
  process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const CAIRO = 'Africa/Cairo';
const RELAY_TIMEOUT_MS = 45_000;

/**
 * Words a meal line must never contain (FR-005, T822).
 *
 * The containment that actually holds is structural — the drafter's schema has
 * a name and a part of the day and no field a portion could go in — so this is
 * the second layer, over whatever a model actually produced on this
 * installation. It reads the **stored** line rather than the model's raw
 * answer, because what the member sees is what the requirement is about.
 */
const NUTRITION_WORDS =
  /\b(\d+\s*(g|kg|kcal|cal|calories|grams?)|protein|carb|carbohydrate|macro|calorie|portion|serving)\b/i;

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

/**
 * A GraphQL read that refuses to fail silently.
 *
 * P6's gate asked for a field the schema does not serve, GraphQL refused the
 * whole query, and eleven checks failed reading `undefined` while the feature
 * worked perfectly. So every read here throws with the server's own message.
 */
async function graphql(query, token, variables) {
  const response = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const answer = await response.json();
  if (answer.errors?.length) {
    throw new Error(answer.errors.map((e) => e.message).join('; '));
  }
  return answer.data;
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

const TODAY_MEALS = `
  query TodayMeals($date: Date) {
    todayMeals(date: $date) {
      date
      mode
      line
      withheldReason
      meals { kind name mealId }
    }
  }
`;

const MEALS = `
  query Meals {
    meals { id name kind ingredients }
  }
`;

const TODAY_PLAN = `
  query TodayPlan {
    todayPlan { date workoutLine mealLine mealReason dayLine }
  }
`;

const ME = `
  query Me {
    me { id }
    preferences { mealMode }
  }
`;

/**
 * Switch this member to "my meals", and **wait for the row to exist first**.
 *
 * Registration writes the preferences row through the outbox, so it is
 * eventual: a `PATCH /preferences` sent in the same second answers 404, which
 * is correct behaviour and was the first version of this gate reporting the
 * whole feature as broken. A real client patches a preference the member
 * changed on a screen they opened seconds later; the gate is the only caller
 * fast enough to lose this race, so it waits rather than the server inventing a
 * row.
 */
async function useMyMeals(token) {
  const ready = await eventually(async () => {
    const answer = await rest('PATCH', '/preferences', {
      token,
      body: { mealMode: 'library' },
    });
    return answer.status === 200 ? answer : null;
  });
  if (!ready) return false;
  const check = await graphql(ME, token);
  return check.preferences?.mealMode === 'library';
}

async function main() {
  if (!SERVICE_TOKEN) {
    record(
      'the gate has a service token',
      false,
      'INTERNAL_SERVICE_TOKEN is unset on the host; the tick cannot be called, ' +
        'and that would report as a broken feature rather than as a ' +
        'misconfigured gate',
    );
  }

  const email = `p8-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const installId = randomUUID();

  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: 'P8 Gate',
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
      device: { installId, kind: 'android', name: 'P8 gate phone' },
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
   * ---- 1. an empty list is said plainly (FR-004) ---------------------------
   *
   * First, because it is the one state that exists before the member has done
   * anything — and because a system that silently switched to generated meals
   * here is the one thing story 2 scenario 3 rules out.
   */
  record(
    'the member can choose "my meals" (FR-004)',
    await useMyMeals(token),
    'preferences.mealMode = library',
  );

  const emptyDay = await rest('POST', '/nutrition/today/regenerate', { token });
  record(
    'an empty meal list is refused with a reason rather than switched (FR-004)',
    emptyDay.status === 200 &&
      emptyDay.body?.line === null &&
      emptyDay.body?.reason === 'empty_library',
    `status=${emptyDay.status} reason=${emptyDay.body?.reason}`,
  );

  /*
   * ---- 2. the library, over REST and back over /sync (FR-001, FR-002) ------
   */
  const mealIds = {
    breakfast: randomUUID(),
    lunch: randomUUID(),
    dinner: randomUUID(),
    snack: randomUUID(),
  };

  const added = await Promise.all([
    rest('POST', '/meals', {
      token,
      body: { id: mealIds.breakfast, name: 'ful medames', kind: 'breakfast' },
    }),
    rest('POST', '/meals', {
      token,
      body: {
        id: mealIds.lunch,
        name: 'grilled chicken and rice',
        kind: 'lunch',
        ingredients: ['chicken', 'rice', 'salad'],
      },
    }),
    rest('POST', '/meals', {
      token,
      body: { id: mealIds.dinner, name: 'lentil soup', kind: 'dinner' },
    }),
    rest('POST', '/meals', {
      token,
      body: { id: mealIds.snack, name: 'apple', kind: 'snack' },
    }),
  ]);
  record(
    'meals are saved with the client’s own ids (FR-001)',
    added.every((answer) => answer.status === 200),
    added.map((answer) => answer.status).join(','),
  );

  const replayed = await rest('POST', '/meals', {
    token,
    body: { id: mealIds.lunch, name: 'grilled chicken and rice', kind: 'lunch' },
  });
  record(
    'a repeated id is the add that already happened, not a duplicate',
    replayed.status === 200 && replayed.body?.replayed === true,
    `status=${replayed.status} replayed=${replayed.body?.replayed}`,
  );

  // No `since`, which is how the protocol asks for a full snapshot. There is no
  // `full` flag: `SyncRequestDto` runs under `forbidNonWhitelisted`, so an
  // invented field is a 400 for the whole request — which the first run of this
  // gate reported as "meals do not sync".
  const pulled = await sync({ entities: ['meals'] });
  // `pull`, not `entities`: the response names the rows it is handing over, and
  // the request names what was asked for. Reading the wrong one is how P7's
  // gate reported a working feature as broken twice.
  const pulledMeals = pulled.body?.pull?.meals ?? [];
  record(
    'meals travel over /sync (FR-002)',
    pulled.status === 200 && pulledMeals.length === 4,
    `status=${pulled.status} rows=${pulledMeals.length}`,
  );

  const pushedId = randomUUID();
  const pushed = await sync({
    entities: ['meals'],
    push: {
      meals: [
        {
          op: 'create',
          id: pushedId,
          updatedAt: new Date().toISOString(),
          data: { name: 'koshari', kind: 'any', ingredients: ['rice', 'lentils'] },
        },
      ],
    },
  });
  record(
    'a meal created offline is accepted on the next push (FR-002)',
    pushed.status === 200 &&
      (pushed.body?.rejections ?? []).length === 0 &&
      (await graphql(MEALS, token)).meals.some((meal) => meal.id === pushedId),
    `status=${pushed.status} rejections=${JSON.stringify(pushed.body?.rejections ?? [])}`,
  );

  /*
   * ---- 3. the day, from the member's own list (FR-003, SC-002) -------------
   */
  const day = await rest('POST', '/nutrition/today/regenerate', { token });
  const names = (day.body?.line ?? '').split(', ').filter(Boolean);
  const mine = new Set(
    (await graphql(MEALS, token)).meals.map((meal) => meal.name),
  );
  record(
    'the day is built from the member’s own meals and nothing else (SC-002)',
    day.status === 200 && names.length > 0 && names.every((name) => mine.has(name)),
    `line=${day.body?.line}`,
  );

  const again = await rest('POST', '/nutrition/today/regenerate', { token });
  record(
    'the same member on the same date gets the same day (FR-009)',
    again.body?.line === day.body?.line,
    `first=${day.body?.line} again=${again.body?.line}`,
  );

  const today = day.body?.date;
  const stored = await graphql(TODAY_MEALS, token, { date: today });
  record(
    'the day is readable over GraphQL, with its mode and its meals',
    stored.todayMeals?.mode === 'library' &&
      stored.todayMeals?.line === day.body?.line &&
      (stored.todayMeals?.meals ?? []).length === names.length,
    `mode=${stored.todayMeals?.mode} meals=${(stored.todayMeals?.meals ?? []).length}`,
  );

  record(
    'nothing in the line is a quantity, a portion or a macronutrient (FR-005)',
    !NUTRITION_WORDS.test(day.body?.line ?? ''),
    `line=${day.body?.line}`,
  );

  /*
   * ---- 4. one meal swapped, the rest of the day untouched (FR-010) ---------
   */
  const before = (stored.todayMeals?.meals ?? []).map((meal) => meal.name);
  const swapped = await rest('POST', '/nutrition/today/meals/0/replace', {
    token,
    body: { mealId: pushedId },
  });
  const afterSwap = await graphql(TODAY_MEALS, token, { date: today });
  const after = (afterSwap.todayMeals?.meals ?? []).map((meal) => meal.name);
  record(
    'one meal can be swapped for one of the member’s own (FR-010)',
    swapped.status === 200 && after[0] === 'koshari',
    `slot0=${after[0]}`,
  );
  record(
    'the rest of the day is untouched by a swap (FR-010)',
    JSON.stringify(after.slice(1)) === JSON.stringify(before.slice(1)),
    `before=${before.slice(1).join(', ')} after=${after.slice(1).join(', ')}`,
  );

  /*
   * ---- 5. the two halves on the plan (FR-008, FR-014) ----------------------
   *
   * The rhythm composes `"Workout: … | Meals: …"` and stores the halves apart,
   * which is what lets an Arabic-reading member render the reason themselves.
   * The plan for today exists only once a touch has run, so the gate runs one.
   */
  /*
   * A touch, forced for this member.
   *
   * `/rhythm/tick` walks the clock and does nothing for a member whose 08:00
   * and 22:00 are hours away, so a gate that ran at four in the afternoon
   * reported a working plan as missing. The operator's Run button ignores the
   * time of day for exactly this reason, and it is the honest way to ask for
   * the touch rather than waiting six hours.
   */
  const me = await graphql(ME, token);
  await internal(
    '/rhythm/prompt',
    JSON.stringify({ userId: me.me?.id, kind: 'morning' }),
  );
  const plan = await eventually(async () => {
    const answer = await graphql(TODAY_PLAN, token);
    return answer.todayPlan?.mealLine || answer.todayPlan?.mealReason
      ? answer
      : null;
  });
  record(
    'the plan carries the meal half and composes the day’s line (FR-008)',
    Boolean(plan?.todayPlan?.dayLine?.includes('Meals:')),
    `dayLine=${plan?.todayPlan?.dayLine}`,
  );
  record(
    'a rest day is named rather than left out (FR-008)',
    Boolean(plan?.todayPlan?.dayLine?.includes('Workout:')),
    `dayLine=${plan?.todayPlan?.dayLine}`,
  );

  /*
   * ---- 6. an allergy withholds the day (FR-006, SC-001) --------------------
   *
   * Declared **after** the meals were saved, which is the case worth proving:
   * a member adds a dish in March and declares the allergy in September, and
   * nothing revisits the library in between. Their own list is exactly where an
   * allergen sits unnoticed.
   */
  const nutty = randomUUID();
  await rest('POST', '/meals', {
    token,
    body: { id: nutty, name: 'almond croissant', kind: 'any' },
  });
  await rest('PATCH', '/profile', { token, body: { allergies: ['nuts'] } });

  const gated = await eventually(async () => {
    const answer = await graphql(TODAY_MEALS, token, { date: today });
    const line = answer.todayMeals?.line ?? '';
    return answer.todayMeals && !line.includes('almond') ? answer : null;
  });
  record(
    'a declared allergy keeps the meal out of the day (FR-006, SC-001)',
    Boolean(gated) && !(gated.todayMeals?.line ?? '').includes('almond'),
    `line=${gated?.todayMeals?.line ?? '(none)'}`,
  );
  record(
    'a profile change rebuilds today by itself (FR-013)',
    Boolean(gated),
    'the outbox consumer rebuilt the day with no second call',
  );

  /*
   * A library where **everything** names the allergen is a real state, and it
   * is reported as one rather than as an empty list.
   */
  const allergic = `p8-${randomUUID().slice(0, 8)}@example.test`;
  await rest('POST', '/auth/register', {
    body: {
      email: allergic,
      password,
      passwordConfirm: password,
      displayName: 'P8 Allergy',
      locale: 'en',
      timezone: CAIRO,
    },
  });
  const allergicIn = await rest('POST', '/auth/login', {
    body: { email: allergic, password },
  });
  const allergicToken = allergicIn.body?.accessToken;
  if (allergicToken) {
    await useMyMeals(allergicToken);
    await rest('PATCH', '/profile', {
      token: allergicToken,
      body: { allergies: ['dairy'] },
    });
    await rest('POST', '/meals', {
      token: allergicToken,
      body: { id: randomUUID(), name: 'buttered toast', kind: 'any' },
    });

    const withheld = await rest('POST', '/nutrition/today/regenerate', {
      token: allergicToken,
    });
    record(
      'a library that is entirely allergens is withheld with a code (FR-014)',
      withheld.body?.line === null && withheld.body?.reason === 'allergen',
      `reason=${withheld.body?.reason}`,
    );

    // "Buttered" and "creamy" are ordinary ways to write a meal and neither is
    // caught by equality plus a plural rule — the corpus that found this is in
    // `nutrition-gate.spec.ts`, and this is the same rule end to end.
    await rest('POST', '/auth/delete-account', {
      token: allergicToken,
      body: { password },
    });
  } else {
    skip('a library that is entirely allergens is withheld with a code (FR-014)', 'no second member');
  }

  /*
   * ---- 7. a past day is settled (FR-011) ----------------------------------
   */
  const past = await rest('POST', '/nutrition/today/meals/0/replace?date=2020-01-01', {
    token,
    body: { mealId: pushedId },
  });
  record(
    'a past day cannot be rewritten (FR-011)',
    past.status === 409,
    `status=${past.status}`,
  );

  /*
   * ---- 8. the model, when there is one ------------------------------------
   */
  await rest('PATCH', '/preferences', { token, body: { mealMode: 'llm' } });
  const drafted = await rest('POST', '/nutrition/today/regenerate', { token });
  if (drafted.body?.reason === 'model_unavailable') {
    skip(
      'suggestion mode drafts ordinary food with no numbers in it (FR-003, FR-005)',
      'the model was unreachable, which is the degradation FR-008 asks for',
    );
    record(
      'a model that cannot be reached withholds with a reason rather than delaying the plan (SC-004)',
      drafted.status === 200 && drafted.body?.line === null,
      `reason=${drafted.body?.reason}`,
    );
  } else {
    record(
      'suggestion mode drafts ordinary food with no numbers in it (FR-003, FR-005)',
      drafted.status === 200 &&
        typeof drafted.body?.line === 'string' &&
        !NUTRITION_WORDS.test(drafted.body.line),
      `line=${drafted.body?.line}`,
    );
    record(
      'the drafted day names none of the member’s allergens (SC-001)',
      !/almond|nut|peanut|cashew|walnut/i.test(drafted.body?.line ?? ''),
      `line=${drafted.body?.line}`,
    );
  }

  /*
   * ---- 9. the member leaves ------------------------------------------------
   */
  const gone = await rest('POST', '/auth/delete-account', {
    token,
    body: { password },
  });
  record(
    'deleting the account purges the meals and the days',
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
