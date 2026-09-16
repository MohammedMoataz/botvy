'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from './locale-switcher';

/**
 * The portal chrome: a rail of links beside a sticky bar.
 *
 * ## Why this is a client component when the old header was not
 *
 * Because "you are here" is the one thing the navigation could not say without
 * knowing the path, and a rail of eight identical links with nothing marked is
 * a rail a reader has to re-read every time. `usePathname` is the only reason
 * for the boundary; nothing here waits on a store, so the markup still arrives
 * with the first paint.
 *
 * Whether a link *works* is still settled by the API — every admin route
 * carries `@Roles('admin')` — and whether a page renders is settled by
 * `RequireAdmin` inside it. Hiding a link based on a role the browser claims to
 * have would be theatre.
 *
 * ## Sign-in gets no navigation
 *
 * `/login` shares this route group with the rest of the portal, so it used to
 * render the whole admin bar around a form for somebody who is, by definition,
 * not signed in — eight links to pages that would bounce them straight back
 * here. Deciding by path keeps the pages where they are.
 */
const NAV = [
  { href: '/overview', key: 'overview', icon: 'pi-home' },
  { href: '/users', key: 'users', icon: 'pi-users' },
  { href: '/settings', key: 'settings', icon: 'pi-cog' },
  { href: '/workflows', key: 'workflows', icon: 'pi-bolt' },
  { href: '/ingestion', key: 'ingestion', icon: 'pi-book' },
  { href: '/usage', key: 'usage', icon: 'pi-chart-bar' },
  { href: '/audit', key: 'audit', icon: 'pi-history' },
  { href: '/service-clients', key: 'serviceClients', icon: 'pi-key' },
] as const;

function Brand() {
  const t = useTranslations('app');
  return (
    <Link className="brand" href="/">
      {/* A mark rather than a logo: the product's letter in the accent, which
          is a placeholder that looks deliberate until there is a real one. */}
      <span className="brand-mark" aria-hidden="true">
        B
      </span>
      {t('name')}
    </Link>
  );
}

export function AdminChrome({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const pathname = usePathname();

  if (pathname === '/login') {
    return (
      <div className="auth">
        <header className="auth-head">
          <Brand />
          <LocaleSwitcher />
        </header>
        <div className="auth-body">{children}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="app-side">
        <p className="nav-label">{t('title')}</p>
        <nav className="nav-group" aria-label={t('title')}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              className="nav-link"
              href={item.href}
              // The attribute a screen reader announces, and the hook the
              // stylesheet marks the current page with. One source of truth
              // rather than a class that can drift from it.
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              <i className={`pi ${item.icon}`} aria-hidden="true" />
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <p className="app-side-foot">v2</p>
      </aside>

      <div className="app-main">
        <header className="app-bar">
          <Brand />
          <LocaleSwitcher />
        </header>
        {children}
      </div>
    </div>
  );
}
