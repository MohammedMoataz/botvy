/**
 * Locale constants only — no next/headers, no server imports, so the client
 * locale switcher can share them with the request config.
 */
export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';
export const LOCALE_COOKIE = 'botvy_locale';

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}

/** Arabic is the only RTL locale we ship; the html `dir` follows this. */
export function isRtl(locale: string): boolean {
  return locale === 'ar';
}
