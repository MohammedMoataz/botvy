import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '../../components/locale-switcher';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations();

  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          {t('app.name')}
        </Link>
        <span className="muted">{t('admin.title')}</span>
        <LocaleSwitcher />
      </header>
      {children}
    </>
  );
}
