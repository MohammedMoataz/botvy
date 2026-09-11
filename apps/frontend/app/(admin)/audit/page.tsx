'use client';

import { Suspense, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AdminStore, type AuditEntry } from '@botvy/sdk';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

/**
 * What was changed, by whom (P10, US2 scenario 3, FR-005).
 *
 * ## Appending, never replacing
 *
 * "Load more" adds to what is on screen rather than swapping the page, and the
 * cursor comes from the previous answer. That is not a UI preference: the rows
 * are ordered and cursored by id on the server because **acts arrive while the
 * Owner is reading**, and a page-number control over a growing collection shows
 * one act twice and hides another. For an audit trail the second half of that
 * sentence is the whole problem.
 *
 * ## The actor is a name here and an id in the store
 *
 * `audit_log` records the principal as it was — a type and an id — and nothing
 * else, so a member who changes their address does not rewrite history. The name
 * is resolved when the page is drawn, and somebody who has since deleted their
 * account shows as their id, which is honest and still traceable.
 */
function AuditPage() {
  const t = useTranslations('audit');
  const { auth } = useStores();
  const [admin] = useState(() => new AdminStore(auth.client));
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /*
   * An act somewhere else can hand the trail its own filter (T1024): clearing a
   * stuck link offers "see what was recorded", and the link arrives here as
   * `?action=knowledge.clear_link`. Read once, as the initial value of a field
   * the Owner can then edit — a filter that kept snapping back to the URL would
   * be a filter that cannot be changed.
   */
  const params = useSearchParams();
  const [actor, setActor] = useState('');
  const [action, setAction] = useState(() => params.get('action') ?? '');
  const [targetType, setTargetType] = useState(() => params.get('targetType') ?? '');

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  async function load(fresh: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      const page = await admin.audit({
        ...(actor ? { actor } : {}),
        ...(action ? { action } : {}),
        ...(targetType ? { targetType } : {}),
        first: 50,
        ...(fresh || !cursor ? {} : { after: cursor }),
      });
      setRows((current) => (fresh ? page.nodes : [...current, ...page.nodes]));
      setCursor(page.endCursor);
      setMore(page.hasNextPage);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <h1>{t('title')}</h1>
      <p className="muted">{t('explain')}</p>

      {problem && <Message severity="error" text={problem} />}

      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label>
          <span className="muted">{t('actor')}</span>
          <InputText value={actor} onChange={(event) => setActor(event.target.value)} />
        </label>
        <label>
          <span className="muted">{t('action')}</span>
          <InputText
            value={action}
            placeholder="admin.ban"
            onChange={(event) => setAction(event.target.value)}
          />
        </label>
        <label>
          <span className="muted">{t('targetType')}</span>
          <InputText
            value={targetType}
            placeholder="user"
            onChange={(event) => setTargetType(event.target.value)}
          />
        </label>
        <Button label={t('apply')} size="small" onClick={() => void load(true)} />
      </div>

      <DataTable value={rows} dataKey="id" emptyMessage={t('none')} style={{ marginTop: 16 }}>
        <Column
          header={t('when')}
          body={(row: AuditEntry) => new Date(row.at).toLocaleString()}
        />
        <Column
          header={t('who')}
          body={(row: AuditEntry) => (
            <span>
              {row.actorLabel} <Tag severity="info" value={row.actorType} />
            </span>
          )}
        />
        <Column field="action" header={t('action')} />
        <Column
          header={t('target')}
          body={(row: AuditEntry) =>
            row.targetId ? `${row.targetType} · ${row.targetId}` : row.targetType
          }
        />
        <Column
          header={t('detail')}
          body={(row: AuditEntry) =>
            row.meta ? <code>{JSON.stringify(row.meta)}</code> : null
          }
        />
      </DataTable>

      {more && (
        <Button
          label={t('loadMore')}
          severity="secondary"
          size="small"
          loading={busy}
          style={{ marginTop: 12 }}
          onClick={() => void load(false)}
        />
      )}
    </main>
  );
}

const Audit = observer(function Audit() {
  return (
    <RequireAdmin>
      <AuditPage />
    </RequireAdmin>
  );
});

export default function AuditRoute() {
  // `useSearchParams` opts a route into client rendering, and Next demands the
  // boundary be explicit rather than inferred — without it `next build` refuses
  // the page outright.
  return (
    <Suspense fallback={null}>
      <Audit />
    </Suspense>
  );
}
