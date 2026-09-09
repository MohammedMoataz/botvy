'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { AdminStore, type HealthReport, type SettingEntry } from '@botvy/sdk';
import { Button } from 'primereact/button';
import { InputSwitch } from 'primereact/inputswitch';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

const REGISTRATION_KEY = 'auth.registrationOpen';

function OverviewPage() {
  const t = useTranslations('overview');
  const { auth } = useStores();
  const [admin] = useState(() => new AdminStore(auth.client));
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [settings, setSettings] = useState<SettingEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [report, entries] = await Promise.all([admin.health(), admin.settings()]);
        setHealth(report);
        setSettings(entries);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [admin]);

  const registration = settings?.find((entry) => entry.key === REGISTRATION_KEY);
  const registrationOpen = registration?.value === true;

  async function toggleRegistration(next: boolean) {
    setSaving(true);
    setProblem(null);
    try {
      await admin.patchSetting(REGISTRATION_KEY, next);
      // Re-read rather than assume. The API validates and may normalise, and a
      // switch that shows what was *asked for* rather than what was stored is a
      // switch an Owner cannot trust.
      setSettings(await admin.settings());
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="shell">
      {/*
        The default-password warning, first on the page: the seeded login is
        documented in SETUP.md, so an installation still using it is one anybody
        who read the docs can sign into.

        Read from `/health`, not from the sign-in response. The response only
        knows what password *this* session was opened with, so it says nothing
        after a reload and nothing at all to an administrator who signed in with
        a password they had already changed. The registry key is the durable
        answer, and it survives a page load.
      */}
      {health?.defaultAdminPassword && (
        <Message severity="warn" text={t('defaultPassword')} style={{ marginBottom: 16 }} />
      )}

      <h1>{t('title')}</h1>

      {problem && <Message severity="error" text={problem} style={{ marginBottom: 16 }} />}

      <section className="panel">
        <h2>{t('health')}</h2>
        {!health && <p className="muted">{t('loading')}</p>}
        {health && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Tag
              severity={health.status === 'ok' ? 'success' : 'warning'}
              value={t(health.status === 'ok' ? 'statusOk' : 'statusDegraded')}
            />
            <Tag severity={health.postgres ? 'success' : 'danger'} value={`PostgreSQL`} />
            <Tag severity={health.mongo ? 'success' : 'danger'} value={`MongoDB`} />
            {/* Neither of these degrades the platform on its own, so they are
                shown as plain information rather than as faults. */}
            <Tag severity={health.ollama ? 'success' : 'warning'} value={`Ollama`} />
            <Tag
              severity={health.pushConfigured ? 'success' : 'info'}
              value={t(health.pushConfigured ? 'pushOn' : 'pushOff')}
            />
          </div>
        )}

        {health && health.jobs.length === 0 && (
          <p className="muted" style={{ marginTop: 12 }}>
            {t('noJobsYet')}
          </p>
        )}
        {health && health.jobs.length > 0 && (
          <ul style={{ marginTop: 12 }}>
            {health.jobs.map((job) => (
              <li key={job.job}>
                <Tag
                  severity={job.stale ? 'danger' : 'success'}
                  value={job.job}
                  style={{ marginInlineEnd: 8 }}
                />
                <span className="muted">
                  {job.lastOkAt ? new Date(job.lastOkAt).toLocaleString() : t('neverRan')}
                </span>
                {job.lastError && <span className="muted"> — {job.lastError}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>{t('registration')}</h2>
        <p className="muted">{t('registrationExplain')}</p>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <InputSwitch
            checked={registrationOpen}
            disabled={saving || !settings}
            onChange={(event) => void toggleRegistration(event.value === true)}
          />
          <span>{t(registrationOpen ? 'registrationOpen' : 'registrationClosed')}</span>
        </div>
      </section>

      <section className="panel">
        <h2>{t('you')}</h2>
        <p>
          {auth.member?.email} — <span className="muted">{auth.member?.role}</span>
        </p>
        <Button
          label={t('signOut')}
          severity="secondary"
          onClick={() => void auth.logout()}
        />
      </section>
    </main>
  );
}

export default observer(function Overview() {
  return (
    <RequireAdmin>
      <OverviewPage />
    </RequireAdmin>
  );
});
