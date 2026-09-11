import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '../../components/locale-switcher';

/**
 * The portal chrome.
 *
 * A server component, so the navigation is markup rather than something that
 * waits for a store to hydrate. Whether a link *works* is settled by the API —
 * every admin route carries `@Roles('admin')` — and whether a page renders is
 * settled by `RequireAdmin` inside it. Hiding a link based on a role the
 * browser claims to have would be theatre.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          {t('app.name')}
        </Link>
        <nav className="row" style={{ gap: 12 }}>
          <Link href="/overview">{t('admin.overview')}</Link>
          <Link href="/users">{t('admin.users')}</Link>
          <Link href="/ingestion">{t('admin.ingestion')}</Link>
          <Link href="/service-clients">{t('admin.serviceClients')}</Link>
        </nav>
        <span className="muted">{t('admin.title')}</span>
        <LocaleSwitcher />
      </header>
      {children}
    </>
  );
}
