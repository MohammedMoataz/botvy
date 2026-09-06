/**
 * en + ar for the side panel. The strings are the same ones the frontend keeps
 * in apps/frontend/messages/*.json — flattened, because the panel needs a
 * lookup and not a whole i18n runtime.
 *
 * Locale resolution: a manual override in chrome.storage wins; otherwise the
 * browser's UI language decides. Arabic flips document.documentElement.dir to
 * "rtl", which is what makes Bootstrap's logical properties mirror the layout.
 */
export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const LOCALE_STORAGE_KEY = 'botvy.locale';

const catalogues: Record<Locale, Record<string, string>> = {
  en: {
    'app.name': 'Botvy',
    'app.tagline': 'One assistant for your day.',
    'login.title': 'Sign in',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.pending': 'Signing in…',
    'login.notYet': 'Sign-in arrives in the next phase.',
    'login.failed': 'Sign-in failed.',
    'login.welcome': 'Signed in.',
    'login.signOut': 'Sign out',
    'locale.label': 'Language',
    'locale.en': 'English',
    'locale.ar': 'العربية',
  },
  ar: {
    'app.name': 'بوتفي',
    'app.tagline': 'مساعد واحد ليومك.',
    'login.title': 'تسجيل الدخول',
    'login.email': 'البريد الإلكتروني',
    'login.password': 'كلمة المرور',
    'login.submit': 'تسجيل الدخول',
    'login.pending': 'جارٍ تسجيل الدخول…',
    'login.notYet': 'تسجيل الدخول يصل في المرحلة القادمة.',
    'login.failed': 'تعذّر تسجيل الدخول.',
    'login.welcome': 'تم تسجيل الدخول.',
    'login.signOut': 'تسجيل الخروج',
    'locale.label': 'اللغة',
    'locale.en': 'English',
    'locale.ar': 'العربية',
  },
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (locales as readonly string[]).includes(value)
  );
}

/** Browser UI language, e.g. "ar", "ar-EG", "en-GB". */
export function detectLocale(): Locale {
  const ui = chrome.i18n?.getUILanguage?.() ?? 'en';
  return ui.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export async function loadLocale(): Promise<Locale> {
  const stored = await chrome.storage.local.get(LOCALE_STORAGE_KEY);
  const override = stored[LOCALE_STORAGE_KEY];
  return isLocale(override) ? override : detectLocale();
}

export async function saveLocale(locale: Locale): Promise<void> {
  await chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: locale });
}

/** Called on every panel mount — the panel is torn down each time it is closed. */
export function applyDirection(locale: Locale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export function translate(locale: Locale, key: string): string {
  return catalogues[locale][key] ?? catalogues.en[key] ?? key;
}
