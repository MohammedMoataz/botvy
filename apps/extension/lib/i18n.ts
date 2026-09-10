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
    'tasks.today': 'Today',
    'tasks.empty': 'Nothing due today.',
    'tasks.waiting': 'Waiting for your time zone…',
    'tasks.add': 'Add a task…',
    'tasks.addSubmit': 'Add',
    'tasks.complete': 'Complete',
    'tasks.undo': 'Undo',
    'tasks.unsent': 'Not sent yet',
    'tasks.failed': 'That did not reach the server. Try again.',
    'tasks.priority': 'Priority {level}',
    'meetings.next': 'Next 7 days',
    'meetings.empty': 'No meetings in the next seven days.',
    'meetings.waiting': 'Waiting for your time zone…',
    'meetings.add': 'Add a meeting',
    'meetings.name': 'Name',
    'meetings.start': 'Starts',
    'meetings.length': 'Length',
    'meetings.lengthHint': 'Minutes. Blank uses your usual length.',
    'meetings.link': 'Online link',
    'meetings.address': 'Address',
    'meetings.where': 'Give a link or an address — at least one.',
    'meetings.join': 'Join',
    'meetings.moved': 'Moved',
    'meetings.addSubmit': 'Add meeting',
    'meetings.failed': 'That meeting did not reach the server. Try again.',
    'sync.now': 'Sync now',
    'sync.syncing': 'Syncing…',
    'sync.never': 'Not synced yet',
    'sync.at': 'Synced {time}',
    'sync.failed': 'Could not reach Botvy. Your changes are still queued.',
    'sync.blocked': '{count} change(s) the server keeps refusing.',
    'sync.retry': 'Retry those',
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
    'tasks.today': 'اليوم',
    'tasks.empty': 'لا شيء مستحق اليوم.',
    'tasks.waiting': 'في انتظار منطقتك الزمنية…',
    'tasks.add': 'أضف مهمة…',
    'tasks.addSubmit': 'إضافة',
    'tasks.complete': 'إتمام',
    'tasks.undo': 'تراجع',
    'tasks.unsent': 'لم تُرسل بعد',
    'tasks.failed': 'لم يصل ذلك إلى الخادم. حاول مرة أخرى.',
    'tasks.priority': 'الأولوية {level}',
    'meetings.next': 'الأيام السبعة القادمة',
    'meetings.empty': 'لا اجتماعات في الأيام السبعة القادمة.',
    'meetings.waiting': 'في انتظار منطقتك الزمنية…',
    'meetings.add': 'أضف اجتماعًا',
    'meetings.name': 'الاسم',
    'meetings.start': 'يبدأ',
    'meetings.length': 'المدة',
    'meetings.lengthHint': 'بالدقائق. اتركها فارغة لاستخدام مدتك المعتادة.',
    'meetings.link': 'رابط الاجتماع',
    'meetings.address': 'العنوان',
    'meetings.where': 'أدخل رابطًا أو عنوانًا — واحدًا على الأقل.',
    'meetings.join': 'انضم',
    'meetings.moved': 'مُنقول',
    'meetings.addSubmit': 'إضافة اجتماع',
    'meetings.failed': 'لم يصل هذا الاجتماع إلى الخادم. حاول مرة أخرى.',
    'sync.now': 'مزامنة الآن',
    'sync.syncing': 'جارٍ المزامنة…',
    'sync.never': 'لم تتم المزامنة بعد',
    'sync.at': 'تمت المزامنة {time}',
    'sync.failed': 'تعذّر الوصول إلى بوتفي. تغييراتك لا تزال في الانتظار.',
    'sync.blocked': '{count} من التغييرات يرفضها الخادم باستمرار.',
    'sync.retry': 'أعد المحاولة',
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
