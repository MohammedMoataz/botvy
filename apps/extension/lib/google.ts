/**
 * Google sign-in, and the host permission this browser needs (T950, T951).
 *
 * Two things that both happen once, at sign-in, and nowhere else.
 */

/**
 * Ask for access to the member's own Botvy, and only that.
 *
 * The manifest requests **no** `host_permissions`. An extension that asked for
 * `<all_urls>` up front is refused by store review and would be asking for the
 * whole web to reach one machine — so the origin is requested here, at the
 * moment the member types where their Botvy lives, which is also the first
 * moment anybody knows what to ask for.
 *
 * Returns whether it was granted. A refusal is not fatal and must not be
 * treated as one: Chrome grants same-origin `fetch` from an extension page to
 * an origin in `optional_host_permissions` only after this, but a member who
 * declines gets a clear failure on the next request rather than a dead panel
 * with no explanation.
 */
export async function requestBotvyOrigin(gateway: string): Promise<boolean> {
  const origin = originPatternFor(gateway);
  if (!origin) return false;

  try {
    const already = await chrome.permissions.contains({ origins: [origin] });
    if (already) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    // `permissions.request` throws when it is not called from a user gesture.
    // The sign-in button is one, so this is the unusual path — a programmatic
    // retry, say — and the honest answer is "not granted" rather than a crash.
    return false;
  }
}

/** `https://botvy.example.com/*` — the pattern the permissions API wants. */
export function originPatternFor(gateway: string): string | null {
  try {
    const url = new URL(gateway);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return null;
  }
}

/**
 * The Google token, through the browser's own flow.
 *
 * `launchWebAuthFlow` rather than `chrome.identity.getAuthToken`: the latter is
 * Chrome-only and signs in with the *browser profile's* Google account, which
 * is not necessarily the account the member uses for Botvy — and it cannot be
 * used at all in a Chromium build without Google's own client id baked in.
 *
 * The **id token** is what Botvy verifies, so the flow asks for `id_token`
 * directly: an access token would have to be exchanged somewhere, and the
 * somewhere would be a second place holding a client secret.
 */
export async function googleIdToken(clientId: string): Promise<string | null> {
  if (!clientId) return null;

  const redirect = chrome.identity.getRedirectURL('google');
  const nonce = crypto.randomUUID();
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=id_token` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&nonce=${encodeURIComponent(nonce)}`;

  try {
    const answered = await chrome.identity.launchWebAuthFlow({
      url,
      interactive: true,
    });
    if (!answered) return null;

    // The token comes back in the **fragment**, not the query — an implicit
    // flow never puts a credential where a server could log it.
    const fragment = new URL(answered).hash.replace(/^#/, '');
    return new URLSearchParams(fragment).get('id_token');
  } catch {
    // The member closed the window, or the browser refused the flow. Neither is
    // an error worth showing as one: they can try again or use a password.
    return null;
  }
}
