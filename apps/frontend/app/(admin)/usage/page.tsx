'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { AdminStore, type UsageRow } from '@botvy/sdk';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

/**
 * What it is costing (P10, US6, FR-011).
 *
 * Tokens, not money: this installation is one person's machine and the model
 * runs on it. The page exists so that **a runaway loop is visible before it
 * becomes a problem** — a saga retrying for ever, a client reconnecting in a
 * tight loop — which is why the per-member total sits beside the per-day
 * breakdown. One number that has doubled says something is wrong; it does not
 * say whose.
 *
 * ## The day is UTC and the column says so
 *
 * Every other date in this product is a member's own, resolved against their
 * zone. This one cannot be: it is an operator-wide view across every member at
 * once, and there is no single midnight to use — a per-member row in one zone
 * and a total in another would not add up. So the boundary is UTC and the header
 * says it, which is better than a boundary nobody can see.
 */
function UsagePage() {
  const t = useTranslations('usage');
  const { auth } = useStores();
  const [admin] = useState(() => new AdminStore(auth.client));
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [perMember, setPerMember] = useState<UsageRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  async function load() {
    setProblem(null);
    try {
      // Both shapes in one pass, because the two questions — "what happened"
      // and "who did it" — are asked together and the second is meaningless
      // without the first.
      const [byDay, byMember] = await Promise.all([
        admin.usage({ from, to }),
        admin.usage({ from, to, byMember: true }),
      ]);
      setRows(byDay);
      setPerMember(byMember);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }

  /** The biggest day in the range, so the bars have something to scale to. */
  const peak = useMemo(
    () =>
      Math.max(
        1,
        ...(rows ?? []).map((row) => row.promptTokens + row.completionTokens),
      ),
    [rows],
  );

  const totals = useMemo(() => {
    const byMember = new Map<string, number>();
    for (const row of perMember ?? []) {
      const key = row.userId ?? 'unknown';
      byMember.set(
        key,
        (byMember.get(key) ?? 0) + row.promptTokens + row.completionTokens,
      );
    }
    return [...byMember.entries()].sort((a, b) => b[1] - a[1]);
  }, [perMember]);

  return (
    <main className="shell">
      <h1>{t('title')}</h1>
      <p className="muted">{t('explain')}</p>

      {problem && <Message severity="error" text={problem} />}

      <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <label>
          <span className="muted">{t('from')}</span>
          <InputText
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          <span className="muted">{t('to')}</span>
          <InputText
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <Button label={t('apply')} size="small" onClick={() => void load()} />
      </div>

      <section className="panel">
        <h2>{t('byDay')}</h2>
        <p className="muted">{t('utcNote')}</p>
        <DataTable value={rows ?? []} emptyMessage={t('none')}>
          <Column field="day" header={t('day')} />
          <Column field="kind" header={t('kind')} />
          <Column field="model" header={t('model')} />
          <Column field="calls" header={t('calls')} />
          <Column
            header={t('tokens')}
            body={(row: UsageRow) => {
              const total = row.promptTokens + row.completionTokens;
              return (
                <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span>{total.toLocaleString()}</span>
                  {/*
                    A bar drawn with a div rather than a charting library: one
                    proportion is not worth a dependency, and a library here
                    would be the largest thing on the page by an order of
                    magnitude.
                  */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      height: 8,
                      width: `${Math.round((total / peak) * 120)}px`,
                      background: 'var(--p-primary-color, #6366f1)',
                      borderRadius: 4,
                    }}
                  />
                </span>
              );
            }}
          />
        </DataTable>
      </section>

      <section className="panel">
        <h2>{t('byMember')}</h2>
        <DataTable
          value={totals.map(([userId, tokens]) => ({ userId, tokens }))}
          emptyMessage={t('none')}
        >
          <Column field="userId" header={t('member')} />
          <Column
            header={t('tokens')}
            body={(row: { tokens: number }) => row.tokens.toLocaleString()}
          />
        </DataTable>
      </section>
    </main>
  );
}

export default observer(function Usage() {
  return (
    <RequireAdmin>
      <UsagePage />
    </RequireAdmin>
  );
});
