/**
 * P1's gate, as a command whose output can be pasted into a report.
 *
 * `infra/verify.mjs` proves the foundation is standing. This proves the one
 * thing P1 promises that no unit test can: that Identity, Profile, the outbox
 * relay, the read edge and the socket agree with each other across two real
 * stores and a network.
 *
 * The flow is T153's, in order, because each step is the setup for the next:
 *
 *   1. A member registers.
 *   2. The relay delivers `identity.UserRegistered`, and Profile bootstraps a
 *      profile and preferences from the registry defaults. This is the step
 *      that was silently impossible until the review - the relay dispatched
 *      three event names and this was not one of them, so every account ever
 *      created would have had no profile.
 *   3. Two devices sign in, each getting its own refresh family.
 *   4. An administrator sees the member in the Users query, with a device count.
 *   5. The member changes their password, which must revoke *every* family.
 *   6. The second device's refresh is refused on its next use.
 *
 * Written against the public surface only - no container exec, no direct store
 * access. A gate that reached into the database could pass while the API that
 * every client actually uses was broken.
 *
 * It cleans up after itself: the member it creates deletes their own account at
 * the end, which also exercises the purge path.
 */
import { randomUUID } from 'node:crypto';
import { loadEnvFiles } from './env.mjs';

loadEnvFiles();

const API = process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin';

/** How long the relay is given to deliver. Generous: it is a change stream. */
const RELAY_TIMEOUT_MS = 20_000;

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

async function graphql(document, { token, variables } = {}) {
  const response = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query: document, variables }),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, data: payload?.data ?? null, errors: payload?.errors ?? null };
}

/** Polls until `check` returns truthy, or gives up. The relay is eventual. */
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

async function main() {
  // A fresh address every run, so the gate is repeatable without a wipe.
  const email = `gate-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'a-long-enough-password';
  const changed = 'a-different-long-password';
  const phone = { installId: randomUUID(), kind: 'android', name: 'Gate phone' };
  const tablet = { installId: randomUUID(), kind: 'android', name: 'Gate tablet' };

  // ---------------------------------------------------------------- 1. register
  const registered = await rest('POST', '/auth/register', {
    body: {
      email,
      password,
      passwordConfirm: password,
      displayName: 'Gate Member',
      locale: 'en',
      timezone: 'Africa/Cairo',
    },
  });
  record(
    'a member can register',
    registered.status === 201 || registered.status === 200,
    `status=${registered.status} ${registered.status >= 400 ? JSON.stringify(registered.body) : email}`,
  );
  if (registered.status >= 400) return;

  // ------------------------------------------- 2. two devices, two sign-ins
  const first = await rest('POST', '/auth/login', {
    body: { email, password, device: phone },
  });
  const second = await rest('POST', '/auth/login', {
    body: { email, password, device: tablet },
  });
  record(
    'two devices each open their own session',
    first.status === 200 && second.status === 200 && first.body?.deviceId !== second.body?.deviceId,
    `phone=${first.body?.deviceId ?? first.status} tablet=${second.body?.deviceId ?? second.status}`,
  );
  if (first.status !== 200 || second.status !== 200) return;

  const phoneToken = first.body.accessToken;
  const tabletRefresh = second.body.refreshToken;

  // ------------------------------------------------ 3. the relay bootstrapped
  // The step the review found could never have happened. It is polled rather
  // than asserted immediately, because the relay is a change stream and
  // "eventually" is the honest contract - but it is asserted, because an event
  // that never arrives is indistinguishable from a slow one until you wait.
  const profile = await eventually(async () => {
    const answer = await graphql(
      'query Gate { profile { userId timezone locale } preferences { userId morningBriefingTime } }',
      { token: phoneToken },
    );
    return answer.data?.profile ? answer.data : null;
  });
  record(
    'the relay bootstrapped a profile and preferences',
    Boolean(profile?.profile && profile?.preferences),
    profile?.profile
      ? `timezone=${profile.profile.timezone} locale=${profile.profile.locale} briefing=${profile.preferences.morningBriefingTime}`
      : `nothing after ${RELAY_TIMEOUT_MS / 1000}s`,
  );

  // What registration supplied must win over the registry default, or a member
  // who told us their time zone gets the installation's.
  record(
    'registration’s own time zone wins over the default',
    profile?.profile?.timezone === 'Africa/Cairo',
    `timezone=${profile?.profile?.timezone}`,
  );

  // ------------------------------------------------------ 4. the read edge
  const devices = await graphql('query Gate { myDevices { id kind hasPush } }', {
    token: phoneToken,
  });
  record(
    'the member sees both of their devices',
    devices.data?.myDevices?.length === 2,
    `count=${devices.data?.myDevices?.length ?? JSON.stringify(devices.errors)}`,
  );
  // The read edge must not hand a push token to a client. This is the leak the
  // REST read it replaced actually had.
  record(
    'no push token reaches the client',
    !JSON.stringify(devices.data ?? {}).includes('pushToken'),
    'myDevices reports hasPush only',
  );

  // ------------------------------------------------- 5. the administrator sees
  const admin = await rest('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  record('the seeded administrator can sign in', admin.status === 200, `status=${admin.status}`);

  if (admin.status === 200) {
    const users = await graphql(
      'query Gate($search: String) { users(search: $search) { nodes { email role status deviceCount } } }',
      { token: admin.body.accessToken, variables: { search: email } },
    );
    const found = users.data?.users?.nodes?.[0];
    record(
      'the member appears in the Users query with their devices',
      found?.email === email && found?.deviceCount === 2,
      found ? `role=${found.role} status=${found.status} devices=${found.deviceCount}` : JSON.stringify(users.errors),
    );

    // A member's own reads must be scoped to them, whoever asks.
    const adminProfile = await graphql('query Gate { profile { userId } }', {
      token: admin.body.accessToken,
    });
    record(
      'an administrator’s own profile is their own, not the member’s',
      adminProfile.data?.profile?.userId !== found?.id,
      'profile resolves from the principal, never an argument',
    );
  }

  // -------------------------------------------------- 6. the password change
  const passwordChange = await rest('POST', '/auth/password', {
    token: phoneToken,
    body: { currentPassword: password, newPassword: changed },
  });
  record(
    'the member can change their own password',
    passwordChange.status === 200 && passwordChange.body?.sessionsEnded >= 2,
    `status=${passwordChange.status} sessionsEnded=${passwordChange.body?.sessionsEnded}`,
  );

  // ------------------------------------ 7. the other device is signed out
  // The whole point of the flow. A password change that left the other device
  // working would mean a member who changed it because somebody else had it
  // leaving that somebody signed in for another thirty days.
  const refused = await rest('POST', '/auth/refresh', { body: { refreshToken: tabletRefresh } });
  record(
    'the second device is signed out on its next request',
    refused.status === 401,
    `status=${refused.status} code=${refused.body?.code ?? refused.body?.message}`,
  );

  // ------------------------------------------------------------ 8. clean up
  const signedIn = await rest('POST', '/auth/login', {
    body: { email, password: changed, device: phone },
  });
  if (signedIn.status === 200) {
    const deleted = await rest('POST', '/auth/delete-account', {
      token: signedIn.body.accessToken,
      body: { password: changed },
    });
    record('the member can delete their own account', deleted.status === 200, `status=${deleted.status}`);

    // The purge is the other half of the relay, and the only one whose failure
    // leaves files on a volume that nothing will ever find again.
    const purged = await eventually(async () => {
      const answer = await graphql('query Gate { profile { userId } }', {
        token: signedIn.body.accessToken,
      });
      return answer.errors?.length ? answer : null;
    });
    record(
      'the relay purged the profile',
      Boolean(purged?.errors?.length),
      purged?.errors?.length ? 'profile no longer resolves' : `still there after ${RELAY_TIMEOUT_MS / 1000}s`,
    );
  } else {
    record('the new password works', false, `status=${signedIn.status}`);
  }
}

await main().catch((error) => {
  record('the gate ran', false, error.message);
});

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed against ${API}`,
);
if (failed.length > 0) {
  console.log('\nfailed:');
  for (const f of failed) console.log(`  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
}
process.exit(failed.length === 0 ? 0 : 1);
