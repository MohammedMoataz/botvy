import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '../../components/locale-switcher';

export default async function MarketingPage() {
  const t = await getTranslations();

  return (
    <main className="shell">
      <h1>{t('app.name')}</h1>
      <p className="muted">{t('app.tagline')}</p>
      <p>{t('marketing.body')}</p>
      <p>
        <Link href="/login">{t('marketing.signIn')}</Link>
      </p>
      <p>
        <LocaleSwitcher />
      </p>
    </main>
  );
}
