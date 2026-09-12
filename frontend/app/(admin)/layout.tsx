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
        {/*
          Wraps rather than scrolls sideways, which is FR-014 at the one place
          it is easiest to lose: eight links in a row is what pushes a phone-width
          portal into a horizontal scroll, and a console nobody can use on a
          phone is a console nobody uses at three in the morning.
        */}
        <nav className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <Link href="/overview">{t('admin.overview')}</Link>
          <Link href="/users">{t('admin.users')}</Link>
          <Link href="/settings">{t('admin.settings')}</Link>
          <Link href="/workflows">{t('admin.workflows')}</Link>
          <Link href="/ingestion">{t('admin.ingestion')}</Link>
          <Link href="/usage">{t('admin.usage')}</Link>
          <Link href="/audit">{t('admin.audit')}</Link>
          <Link href="/service-clients">{t('admin.serviceClients')}</Link>
        </nav>
        <span className="muted">{t('admin.title')}</span>
        <LocaleSwitcher />
      </header>
      {children}
    </>
  );
}
