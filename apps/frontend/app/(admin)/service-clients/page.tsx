'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { AdminStore, type ServiceClientSummary } from '@botvy/sdk';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

function ServiceClientsPage() {
  const t = useTranslations('serviceClients');
  const { auth } = useStores();
  const [admin] = useState(() => new AdminStore(auth.client));
  const [clients, setClients] = useState<ServiceClientSummary[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('');
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = async () => setClients(await admin.serviceClients());

  useEffect(() => {
    void reload().catch((error: Error) => setProblem(error.message));
  }, [admin]);

  async function create() {
    setBusy(true);
    setProblem(null);
    try {
      const created = await admin.createServiceClient(
        name.trim(),
        scopes
          .split(',')
          .map((scope) => scope.trim())
          .filter(Boolean),
      );
      // Held in state and shown in a dialog, because this is the only moment it
      // exists. The API hashes it at rest, so there is no second chance and no
      // "show secret" button to add later.
      setSecret({ name: created.name, secret: created.secret });
      setName('');
      setScopes('');
      await reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(client: ServiceClientSummary) {
    setBusy(true);
    setProblem(null);
    try {
      await admin.revokeServiceClient(client.name);
      await reload();
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

      {problem && <Message severity="error" text={problem} style={{ marginBottom: 12 }} />}

      <section className="panel">
        <h2>{t('create')}</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field">
            <label htmlFor="client-name">{t('name')}</label>
            <InputText
              id="client-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="client-scopes">{t('scopes')}</label>
            <InputText
              id="client-scopes"
              value={scopes}
              placeholder="internal:alerts, internal:ops"
              onChange={(event) => setScopes(event.target.value)}
            />
          </div>
          <Button
            label={t('createButton')}
            disabled={busy || name.trim() === ''}
            onClick={() => void create()}
          />
        </div>
      </section>

      <DataTable value={clients} emptyMessage={t('none')}>
        <Column field="name" header={t('name')} />
        <Column
          header={t('scopes')}
          body={(client: ServiceClientSummary) => client.scopes.join(', ') || '—'}
        />
        <Column
          header={t('status')}
          body={(client: ServiceClientSummary) => (
            <Tag
              severity={client.revokedAt ? 'danger' : 'success'}
              value={t(client.revokedAt ? 'revoked' : 'active')}
            />
          )}
        />
        <Column
          header={t('lastUsed')}
          body={(client: ServiceClientSummary) =>
            client.lastUsedAt ? new Date(client.lastUsedAt).toLocaleString() : t('never')
          }
        />
        <Column
          header={t('actions')}
          body={(client: ServiceClientSummary) =>
            client.revokedAt ? null : (
              <Button
                label={t('revoke')}
                severity="danger"
                outlined
                disabled={busy}
                onClick={() => void revoke(client)}
              />
            )
          }
        />
      </DataTable>

      {/*
        Not dismissible by clicking away, and no close button in the corner. The
        secret is gone the moment this closes, so the only way out is the button
        that says so.
      */}
      <Dialog
        visible={secret !== null}
        header={t('secretTitle', { name: secret?.name ?? '' })}
        closable={false}
        dismissableMask={false}
        style={{ maxWidth: 560 }}
        onHide={() => setSecret(null)}
        footer={<Button label={t('secretDone')} onClick={() => setSecret(null)} />}
      >
        <Message severity="warn" text={t('secretWarning')} style={{ marginBottom: 12 }} />
        <code
          style={{
            display: 'block',
            padding: 12,
            overflowWrap: 'anywhere',
            userSelect: 'all',
          }}
        >
          {secret?.secret}
        </code>
      </Dialog>
    </main>
  );
}

export default observer(function ServiceClients() {
  return (
    <RequireAdmin>
      <ServiceClientsPage />
    </RequireAdmin>
  );
});
