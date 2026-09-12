'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { AdminStore, type WorkflowSummary } from '@botvy/sdk';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { InputSwitch } from 'primereact/inputswitch';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

/**
 * The automation, visible (P10, US4, FR-008).
 *
 * ## An unreachable tool is said, never shown as an empty list
 *
 * The spec's own edge case, and the reason this page distinguishes three
 * states rather than two. An empty list is a statement of fact — "you have no
 * workflows" — and it would be false for every installation that imported them
 * months ago. The Owner would go looking for what they had already done.
 *
 * The server tells them apart: a **503** is an installation with no automation
 * key, which is a thing to set up rather than a fault, and a **502** is a tool
 * that is not answering, which is a fault and not this platform's.
 *
 * ## Event forwarding is not a page
 *
 * FR-009's subscriptions are the `automation.subscriptions` registry key, edited
 * on the settings page with the control that key's own schema asks for. A second
 * screen would be a second way to write one value, and the audit row would then
 * depend on which screen somebody used.
 */
function WorkflowsPage() {
  const t = useTranslations('workflows');
  const { auth } = useStores();
  const [admin] = useState(() => new AdminStore(auth.client));
  const [rows, setRows] = useState<WorkflowSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  async function load() {
    setProblem(null);
    setUnconfigured(false);
    try {
      setRows(await admin.workflows());
    } catch (error) {
      const status = (error as { status?: number }).status;
      const message =
        (error as { body?: { message?: string } })?.body?.message ??
        (error instanceof Error ? error.message : String(error));

      // 503 is "never set up" and 502 is "not answering". Both leave `rows`
      // null, because a list is what this page must not invent.
      if (status === 503) setUnconfigured(true);
      else setProblem(message);
      setRows(null);
    }
  }

  async function toggle(row: WorkflowSummary, active: boolean) {
    setBusy(row.id);
    try {
      await admin.setWorkflowActive(row.id, active);
      await load();
    } catch (error) {
      setProblem(
        (error as { body?: { message?: string } })?.body?.message ??
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setBusy(null);
    }
  }

  async function run(row: WorkflowSummary) {
    setBusy(row.id);
    setNote(null);
    try {
      await admin.runWorkflow(row.id);
      setNote(t('ran', { name: row.name }));
      // Re-read, because what the Owner wants to see is the *last run* moving.
      // A button that said "done" without the row changing would be a button
      // that proves nothing, which is the opposite of why it exists.
      await load();
    } catch (error) {
      setProblem(
        (error as { body?: { message?: string } })?.body?.message ??
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="shell">
      <h1>{t('title')}</h1>
      <p className="muted">{t('explain')}</p>

      {unconfigured && <Message severity="info" text={t('notConfigured')} />}
      {problem && <Message severity="warn" text={`${t('unreachable')} — ${problem}`} />}
      {note && <Message severity="success" text={note} />}

      {rows && (
        <DataTable value={rows} dataKey="id" emptyMessage={t('none')}>
          <Column field="name" header={t('name')} />
          <Column
            header={t('active')}
            body={(row: WorkflowSummary) => (
              <InputSwitch
                checked={row.active}
                disabled={busy !== null}
                aria-label={`${t('active')}: ${row.name}`}
                onChange={(event) => void toggle(row, event.value === true)}
              />
            )}
          />
          <Column
            header={t('lastRun')}
            body={(row: WorkflowSummary) =>
              row.lastRunAt ? (
                <span>
                  {new Date(row.lastRunAt).toLocaleString()}{' '}
                  {row.lastStatus && (
                    <Tag
                      severity={row.lastStatus === 'success' ? 'success' : 'warning'}
                      value={row.lastStatus}
                    />
                  )}
                </span>
              ) : (
                <span className="muted">{t('neverRan')}</span>
              )
            }
          />
          <Column
            header={t('actions')}
            body={(row: WorkflowSummary) => (
              <Button
                label={t('run')}
                size="small"
                severity="secondary"
                loading={busy === row.id}
                disabled={busy !== null}
                onClick={() => void run(row)}
              />
            )}
          />
        </DataTable>
      )}

      <Button
        label={t('refresh')}
        severity="secondary"
        size="small"
        style={{ marginTop: 16 }}
        onClick={() => void load()}
      />
    </main>
  );
}

export default observer(function Workflows() {
  return (
    <RequireAdmin>
      <WorkflowsPage />
    </RequireAdmin>
  );
});
