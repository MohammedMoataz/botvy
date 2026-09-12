'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { setLocale } from '../app/actions/set-locale';
import { locales, type Locale } from '../i18n/config';

/**
 * The locale is a cookie, not a URL segment: there is one admin portal and the
 * marketing page is not localised by path. Setting it re-renders the server
 * tree, which is what flips <html dir> to rtl for Arabic.
 *
 * The write goes through a server action rather than `document.cookie` so the
 * value is validated against the locales we ship before it is stored, and so
 * the process that writes it is the one that reads it back.
 */
export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(next: Locale) {
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <label>
      <span className="muted">{t('label')}: </span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => select(e.target.value as Locale)}
        aria-label={t('label')}
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {t(locale)}
          </option>
        ))}
      </select>
    </label>
  );
}
