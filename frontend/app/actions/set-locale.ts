'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale, type Locale } from '../../i18n/config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Sets the member's language. This runs on the server rather than assigning to
 * `document.cookie` in the browser for two reasons: the value is validated
 * against the locales we actually ship before it is stored, and the cookie is
 * written by the same process that reads it when the tree re-renders, so the
 * page and its `dir` attribute can never disagree for one paint.
 */
export async function setLocale(next: Locale): Promise<void> {
  if (!isLocale(next)) return;

  const jar = await cookies();
  jar.set(LOCALE_COOKIE, next, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  });
}
