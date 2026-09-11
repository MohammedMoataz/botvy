'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { DataTable } from 'primereact/datatable';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

/** The six states the pipeline has, as the Owner sees them. */
type LinkStatus =
  | 'queued'
  | 'fetching'
  | 'extracting'
  | 'summarising'
  | 'done'
  | 'failed';

interface QueueRow {
  id: string;
  url: string;
  kind: string;
  title: string | null;
  status: LinkStatus;
  failReason: string | null;
  attempts: number;
  addedAt: string;
  processedAt: string | null;
}

const QUEUE = `
  query IngestionQueue($status: LinkStatus) {
    ingestionQueue(status: $status) {
      id url kind title status failReason attempts addedAt processedAt
    }
  }`;

/**
 * The reading queue across every member (FR-014, T743).
 *
 * ## Why the Owner sees other people's links
 *
 * Because an Owner who cannot see *what* failed cannot tell a broken fetcher
 * from a member pasting nonsense — which is the whole question this screen
 * answers. What it deliberately does **not** show is the summary: the content
 * of somebody's reading is not operational information, and the query behind it
 * asks for none. The route is admin-only on the server (`@Roles('admin')` on
 * the resolver), so `RequireAdmin` here is about what renders rather than about
 * what is permitted.
 *
 * ## Two actions, and they are not the same action
 *
 * **Retry** is the member's own retry, run by the Owner: the same handler, the
 * same attempt ceiling, the same refusal when it is spent. **Clear** is the
 * intervention — it tombstones the entry so it leaves the member's list and
 * stops occupying the queue, erases the extracted document, and writes an
 * `audit_log` row naming the administrator. It asks first, because it is the
 * one thing on this screen that touches somebody else's data.
 *
 * ## The default view is what is unfinished
 *
 * "No filter" means every status but `done`, because a queue screen listing
 * every article the installation has ever read is a screen nobody can find a
 * stuck row in. `done` is available by name.
 */
function IngestionPage() {
  const t = useTranslations('ingestion');
  const { auth } = useStores();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The audit action the last act wrote, so the Owner can go and read it. */
  const [recorded, setRecorded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy('page');
    setProblem(null);
    try {
      const answer = await auth.client.query<{ ingestionQueue: QueueRow[] }>(
        QUEUE,
        { status },
      );
      setRows(answer.ingestionQueue);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [auth.client, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(row: QueueRow) {
    setBusy(row.id);
    setProblem(null);
    setNote(null);
    setRecorded(null);
    try {
      await auth.client.rest('POST', `/admin/knowledge/${row.id}/retry`);
      setNote(t('retried'));
      setRecorded('knowledge.retry_link');
      await load();
    } catch (error) {
      // The API's own message: "this link has been refused 3 times; the limit
      // is 3" is the sentence the Owner needs, and paraphrasing it here would
      // mean maintaining the same words twice.
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  function clear(row: QueueRow) {
    confirmDialog({
      message: t('clearConfirm', { url: row.url }),
      header: t('clear'),
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        setBusy(row.id);
        setProblem(null);
        setNote(null);
        setRecorded(null);
        try {
          await auth.client.rest('DELETE', `/admin/knowledge/${row.id}`);
          setNote(t('cleared'));
          // Clearing somebody else's link is an administrative act on a member's
          // data, so it writes an audit row — and the Owner is shown where,
          // rather than being asked to take it on trust (FR-005, T1024).
          setRecorded('knowledge.clear_link');
          await load();
        } catch (error) {
          setProblem(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy(null);
        }
      },
    });
  }

  const statusTemplate = (row: QueueRow) => (
    <Tag
      value={t(`status.${row.status}`)}
      severity={
        row.status === 'failed'
          ? 'danger'
          : row.status === 'done'
            ? 'success'
            : 'info'
      }
    />
  );

  const reasonTemplate = (row: QueueRow) =>
    row.failReason ? (
      <span className="muted">
        {row.failReason} ({row.attempts})
      </span>
    ) : null;

  const actionsTemplate = (row: QueueRow) => (
    <div className="row" style={{ gap: 8 }}>
      <Button
        label={t('retry')}
        size="small"
        outlined
        // Only a failed link can be retried, and the server says so as well —
        // this is the affordance rather than the rule.
        disabled={row.status !== 'failed' || busy !== null}
        onClick={() => void retry(row)}
      />
      <Button
        label={t('clear')}
        size="small"
        severity="danger"
        outlined
        disabled={busy !== null}
        onClick={() => clear(row)}
      />
    </div>
  );

  return (
    <main className="stack">
      <ConfirmDialog />
      <h1>{t('title')}</h1>
      <p className="muted">{t('intro')}</p>

      <div className="row" style={{ gap: 12 }}>
        <Dropdown
          value={status}
          options={[
            { label: t('unfinished'), value: null },
            { label: t('status.queued'), value: 'queued' },
            { label: t('status.fetching'), value: 'fetching' },
            { label: t('status.extracting'), value: 'extracting' },
            { label: t('status.summarising'), value: 'summarising' },
            { label: t('status.failed'), value: 'failed' },
            { label: t('status.done'), value: 'done' },
          ]}
          onChange={(event) => setStatus(event.value as LinkStatus | null)}
          placeholder={t('unfinished')}
        />
        <Button
          label={t('refresh')}
          onClick={() => void load()}
          loading={busy === 'page'}
        />
      </div>

      {problem ? <Message severity="error" text={problem} /> : null}
      {note ? <Message severity="success" text={note} /> : null}
      {recorded ? (
        <p className="muted">
          <Link href={`/audit?action=${recorded}`}>{t('seeRecord')}</Link>
        </p>
      ) : null}

      <DataTable value={rows} emptyMessage={t('empty')} stripedRows>
        <Column field="title" header={t('what')} body={(row: QueueRow) => (
          <div className="stack" style={{ gap: 2 }}>
            <strong>{row.title ?? row.url}</strong>
            <span className="muted">{row.url}</span>
          </div>
        )} />
        <Column field="kind" header={t('kind')} />
        <Column header={t('state')} body={statusTemplate} />
        <Column header={t('reason')} body={reasonTemplate} />
        <Column header="" body={actionsTemplate} />
      </DataTable>
    </main>
  );
}

export default function Page() {
  return (
    <RequireAdmin>
      <IngestionPage />
    </RequireAdmin>
  );
}
