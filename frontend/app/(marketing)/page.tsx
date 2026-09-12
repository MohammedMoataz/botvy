import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '../../components/locale-switcher';

/**
 * Somewhere to point people (P10, US7, FR-012).
 *
 * ## Static, so it loads when the API does not
 *
 * A server component with no data fetching at all: the page is content, and the
 * spec's own edge case is that it must load while the API is stopped. Anything
 * that awaited the backend here would make the public face of the product go
 * down with it — which is the worst moment for it to be unreachable, because a
 * member checking whether their own machine is up is exactly who is visiting.
 *
 * ## No third-party anything (FR-012, and the spec's "out of scope")
 *
 * No analytics, no fonts from a CDN, no embedded video. This is a page about
 * software that runs on the reader's own hardware; loading it would be a page
 * that contradicts its own first sentence.
 */
export default async function MarketingPage() {
  const t = await getTranslations('marketing');
  const app = await getTranslations('app');

  const features = ['day', 'coach', 'training', 'food', 'reading'] as const;

  return (
    <main className="shell">
      <header className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong className="brand">{app('name')}</strong>
        <LocaleSwitcher />
      </header>

      <h1>{t('headline')}</h1>
      <p className="muted" style={{ fontSize: '1.1rem', maxWidth: '60ch' }}>
        {t('body')}
      </p>

      <section className="panel">
        <h2>{t('featuresTitle')}</h2>
        <ul>
          {features.map((feature) => (
            <li key={feature} style={{ marginBottom: 8 }}>
              <strong>{t(`features.${feature}.title`)}</strong>
              <div className="muted">{t(`features.${feature}.body`)}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>{t('downloadTitle')}</h2>
        <p className="muted">{t('downloadBody')}</p>
        <ul>
          <li>
            {/*
              The releases page rather than a pinned file: the assets are built
              per tag, and a hard-coded filename here would point at whatever
              was current the day somebody wrote it. `rel="noreferrer"` because
              the destination has no business knowing where the visitor came
              from — this is a page about running your own software.
            */}
            <a
              href="https://github.com/MohammedMoataz/botvy/releases/latest"
              rel="noreferrer"
            >
              {t('downloadAndroid')}
            </a>
          </li>
          <li>
            <a
              href="https://github.com/MohammedMoataz/botvy/releases/latest"
              rel="noreferrer"
            >
              {t('downloadExtension')}
            </a>
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>{t('privacyTitle')}</h2>
        <p>{t('privacyBody')}</p>
        <ul>
          <li>{t('privacyPoints.ownMachine')}</li>
          <li>{t('privacyPoints.ownModel')}</li>
          <li>{t('privacyPoints.noAnalytics')}</li>
        </ul>
      </section>

      <p>
        <Link href="/login">{t('signIn')}</Link>
      </p>
    </main>
  );
}
