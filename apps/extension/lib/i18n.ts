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
    'login.invalid': 'Email or password is incorrect.',
    'login.replay': 'That session was ended for security. Sign in again.',
    'login.failed': 'Sign-in failed. Check that Botvy is reachable.',
    'login.welcome': 'Signed in as {name}.',
    'login.signOut': 'Sign out',
    'panel.soon': 'Today’s tasks and meetings arrive with the working panel.',
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
    'login.invalid': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'login.replay': 'تم إنهاء تلك الجلسة لأسباب أمنية. سجّل الدخول من جديد.',
    'login.failed': 'تعذّر تسجيل الدخول. تأكد من إمكانية الوصول إلى بوتفي.',
    'login.welcome': 'تم تسجيل الدخول بصفة {name}.',
    'login.signOut': 'تسجيل الخروج',
    'panel.soon': 'مهام اليوم والاجتماعات تصل مع لوحة العمل.',
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

/**
 * Looks a key up, falling back to English and then to the key itself.
 *
 * `params` fills `{placeholders}`. Without it a string like
 * `Signed in as {name}.` renders the braces to the member, which is the kind of
 * thing that ships because nobody signed in while looking at the panel.
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template = catalogues[locale][key] ?? catalogues.en[key] ?? key;
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    // An unreplaced placeholder is left as-is rather than blanked: seeing
    // `{count}` in the panel tells you which key is wrong, where an empty gap
    // tells you nothing.
    name in params ? String(params[name]) : whole,
  );
}
