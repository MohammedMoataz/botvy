'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { AdminStore, MemberGone, type MemberSummary, type Role } from '@botvy/sdk';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

function UsersPage() {
  const t = useTranslations('users');
  const { auth } = useStores();
  const [admin] = useState(() => new AdminStore(auth.client));
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'active' | 'banned' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // One subscription, so a row action updates the table without a re-read.
  // Re-reading would reshuffle the list under the Owner's cursor, and with a
  // cursor-paged list, page two of a changed list is not the same page two.
  useEffect(() => admin.subscribe(() => {
    setMembers([...admin.members]);
    setHasMore(admin.hasMore);
  }), [admin]);

  useEffect(() => {
    void run(() => admin.search({}));
  }, [admin]);

  async function run(action: () => Promise<unknown>, userId?: string) {
    setBusy(userId ?? 'page');
    setProblem(null);
    try {
      await action();
    } catch (error) {
      if (error instanceof MemberGone) {
        /*
         * Not a guard rail — the account itself is gone, deleted from another
         * tab or by the member themselves since this list was drawn. The store
         * has already removed the row, so the Owner is back at the list with
         * one line saying what happened rather than pressing a button against
         * something that is not there.
         */
        setNote(null);
        setProblem(t('gone'));
        return;
      }
      // The API's own message, deliberately: "this is the only administrator"
      // and "an administrator cannot ban their own account" are the two an
      // Owner most needs to read, and paraphrasing them here would mean
      // maintaining the same sentences twice.
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const roleTemplate = (member: MemberSummary) => (
    <Dropdown
      value={member.role}
      options={[
        { label: t('roleUser'), value: 'user' },
        { label: t('roleAdmin'), value: 'admin' },
      ]}
      disabled={busy === member.id}
      onChange={(event) => void run(() => admin.setRole(member.id, event.value as Role), member.id)}
    />
  );

  const statusTemplate = (member: MemberSummary) => (
    <Tag
      severity={member.status === 'active' ? 'success' : 'danger'}
      value={t(member.status === 'active' ? 'active' : 'banned')}
    />
  );

  const actionsTemplate = (member: MemberSummary) =>
    member.status === 'active' ? (
      <Button
        label={t('ban')}
        severity="danger"
        outlined
        disabled={busy === member.id}
        onClick={() =>
          void run(async () => {
            const { sessionsEnded } = await admin.ban(member.id);
            // Said out loud, because it is the part an Owner does not expect:
            // banning ends live sessions rather than waiting for them to expire.
            setNote(t('banResult', { count: sessionsEnded }));
          }, member.id)
        }
      />
    ) : (
      <Button
        label={t('unban')}
        severity="secondary"
        outlined
        disabled={busy === member.id}
        onClick={() =>
          void run(async () => {
            await admin.unban(member.id);
            // The other half of the same surprise: unbanning does not sign them
            // back in, because the ban revoked their sessions on purpose.
            setNote(t('unbanned'));
          }, member.id)
        }
      />
    );

  return (
    <main className="shell">
      <h1>{t('title')}</h1>

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <InputText
          value={query}
          placeholder={t('searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void run(() => admin.search({ ...(query ? { query } : {}), ...(status ? { status } : {}) }));
            }
          }}
        />
        <Dropdown
          value={status}
          placeholder={t('anyStatus')}
          showClear
          options={[
            { label: t('active'), value: 'active' },
            { label: t('banned'), value: 'banned' },
          ]}
          onChange={(event) => {
            const next = (event.value as 'active' | 'banned' | null) ?? null;
            setStatus(next);
            void run(() => admin.search({ ...(query ? { query } : {}), ...(next ? { status: next } : {}) }));
          }}
        />
        <Button
          label={t('search')}
          onClick={() =>
            void run(() =>
              admin.search({ ...(query ? { query } : {}), ...(status ? { status } : {}) }),
            )
          }
        />
      </div>

      {problem && <Message severity="error" text={problem} style={{ marginBottom: 12 }} />}
      {note && <Message severity="info" text={note} style={{ marginBottom: 12 }} />}

      <DataTable value={members} loading={busy === 'page'} emptyMessage={t('none')}>
        <Column field="email" header={t('email')} />
        <Column field="displayName" header={t('name')} />
        <Column header={t('role')} body={roleTemplate} />
        <Column header={t('status')} body={statusTemplate} />
        <Column field="deviceCount" header={t('devices')} />
        <Column
          header={t('lastSeen')}
          body={(member: MemberSummary) =>
            member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : t('never')
          }
        />
        <Column header={t('actions')} body={actionsTemplate} />
      </DataTable>

      {hasMore && (
        <Button
          label={t('loadMore')}
          severity="secondary"
          style={{ marginTop: 12 }}
          onClick={() => void run(() => admin.loadMore())}
        />
      )}
    </main>
  );
}

export default observer(function Users() {
  return (
    <RequireAdmin>
      <UsersPage />
    </RequireAdmin>
  );
});
