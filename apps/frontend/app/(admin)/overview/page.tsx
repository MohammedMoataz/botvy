'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useLocale, useTranslations } from 'next-intl';
import { todayIn, type SettingEntry, type UsageRow } from '@botvy/sdk';
import { Button } from 'primereact/button';
import { InputSwitch } from 'primereact/inputswitch';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

const REGISTRATION_KEY = 'auth.registrationOpen';

function OverviewPage() {
  const t = useTranslations('overview');
  const locale = useLocale();
  const { auth, admin, health, profile } = useStores();
  const [settings, setSettings] = useState<SettingEntry[] | null>(null);
  const [today, setToday] = useState<UsageRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /*
   * The zone the *administrator* keeps, not the browser's and not the server's.
   *
   * Constitution XI, on a screen where it is easy to forget it applies: an Owner
   * reading "the rhythm tick last ran at 22:05" needs to know whose ten past ten
   * that is, and a laptop in an airport lounge answers differently from the one
   * at home. The zone is named beside the times for the same reason — a time
   * with no zone on it is a time somebody will read in their own.
   *
   * Until the profile has loaded there is nothing honest to claim, so the
   * formatter falls back to the browser's zone and the label says which it is.
   */
  const zone = profile.profile?.timezone ?? null;
  const format = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(zone ? { timeZone: zone } : {}),
    });
  }, [locale, zone]);

  const zoneLabel = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    // Live for as long as this screen is open, and stopped when it is not: a
    // timer left running behind a page nobody is looking at is a request every
    // thirty seconds for the life of the tab.
    health.start();
    return () => health.stop();
  }, [health]);

  useEffect(() => {
    if (!profile.ready) void profile.load();
  }, [profile]);

  useEffect(() => {
    void (async () => {
      try {
        const day = todayIn(zone ?? 'UTC');
        const [entries, usage] = await Promise.all([
          admin.settings(),
          admin.usage({ from: day, to: day }),
        ]);
        setSettings(entries);
        setToday(usage);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [admin, zone]);

  const registration = settings?.find((entry) => entry.key === REGISTRATION_KEY);
  const registrationOpen = registration?.value === true;

  const calls = (today ?? []).reduce((sum, row) => sum + row.calls, 0);
  const tokens = (today ?? []).reduce(
    (sum, row) => sum + row.promptTokens + row.completionTokens,
    0,
  );

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

  const report = health.report;

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
      {report?.defaultAdminPassword && (
        <Message severity="warn" text={t('defaultPassword')} style={{ marginBottom: 16 }} />
      )}

      <h1>{t('title')}</h1>

      {problem && <Message severity="error" text={problem} style={{ marginBottom: 16 }} />}
      {health.problem && (
        <Message severity="warn" text={health.problem} style={{ marginBottom: 16 }} />
      )}

      <section className="panel">
        <h2>{t('health')}</h2>
        {!report && <p className="muted">{t('loading')}</p>}
        {report && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Tag
              severity={report.status === 'ok' ? 'success' : 'warning'}
              value={t(report.status === 'ok' ? 'statusOk' : 'statusDegraded')}
            />
            <Tag severity={report.postgres ? 'success' : 'danger'} value={`PostgreSQL`} />
            <Tag severity={report.mongo ? 'success' : 'danger'} value={`MongoDB`} />
            {/* Neither of these degrades the platform on its own, so they are
                shown as plain information rather than as faults. */}
            <Tag severity={report.ollama ? 'success' : 'warning'} value={`Ollama`} />
            <Tag
              severity={report.pushConfigured ? 'success' : 'info'}
              value={t(report.pushConfigured ? 'pushOn' : 'pushOff')}
            />
          </div>
        )}

        {report && report.jobs.length === 0 && (
          <p className="muted" style={{ marginTop: 12 }}>
            {t('noJobsYet')}
          </p>
        )}
        {report && report.jobs.length > 0 && (
          <>
            <ul style={{ marginTop: 12 }}>
              {report.jobs.map((job) => (
                <li key={job.job}>
                  <Tag
                    severity={job.stale ? 'danger' : 'success'}
                    value={job.job}
                    style={{ marginInlineEnd: 8 }}
                  />
                  <span className="muted">
                    {job.lastOkAt ? format.format(new Date(job.lastOkAt)) : t('neverRan')}
                  </span>
                  {job.lastError && <span className="muted"> — {job.lastError}</span>}
                </li>
              ))}
            </ul>
            <p className="muted">{t('inZone', { zone: zoneLabel })}</p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>{t('todayTitle')}</h2>
        {/* The day is the administrator's, which is why it is counted in their
            zone rather than the server's — and why the usage page, which spans
            every member at once, counts in UTC instead and says so. */}
        <p className="muted">{t('todayExplain', { zone: zoneLabel })}</p>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1.6rem' }}>{today ? calls : '—'}</div>
            <div className="muted">{t('countCalls')}</div>
          </div>
          <div>
            <div style={{ fontSize: '1.6rem' }}>
              {today ? tokens.toLocaleString(locale) : '—'}
            </div>
            <div className="muted">{t('countTokens')}</div>
          </div>
        </div>
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
