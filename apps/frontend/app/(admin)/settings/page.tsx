'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { AdminStore, type SettingControl, type SettingEntry } from '@botvy/sdk';
import { Button } from 'primereact/button';
import { Chips } from 'primereact/chips';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputSwitch } from 'primereact/inputswitch';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { useStores } from '../../../stores/provider';
import { RequireAdmin } from '../require-admin';

/**
 * Configure without deploying (P10, US3, FR-006, FR-007).
 *
 * ## The control comes from the server, not from a list kept here
 *
 * Every key carries a `control` derived from the zod schema the registry
 * declares, so this page holds no map of which key is a switch and which is a
 * dropdown. That map was the obvious way to build this page and is the wrong
 * one: it would be a second copy of the registry living in another repository,
 * and it would go wrong the first time somebody added a key without remembering
 * it exists — silently, by rendering a text box for a number.
 *
 * A control kind this build does not know falls back to a text box rather than
 * to nothing, which is what lets the server add a seventh kind without breaking
 * the page.
 *
 * ## The server is still the validator
 *
 * The control narrows what can be typed; it does not decide what is allowed.
 * Every save goes to `PATCH /admin/settings/:key`, and a refusal comes back with
 * the rule named and is shown against that row — which is FR-006 in as many
 * words, and why an out-of-range number is not a silent no-op here.
 */
function SettingsPage() {
  const t = useTranslations('settings');
  const { auth } = useStores();
  const [admin] = useState(() => new AdminStore(auth.client));
  const [entries, setEntries] = useState<SettingEntry[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  async function load() {
    try {
      const rows = await admin.settings();
      setEntries(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.key, row.value])));
    } catch (error) {
      setProblems({ '': error instanceof Error ? error.message : String(error) });
    }
  }

  async function save(entry: SettingEntry) {
    setSaving(entry.key);
    setProblems((current) => ({ ...current, [entry.key]: '' }));
    try {
      await admin.patchSetting(entry.key, drafts[entry.key]);
      // Re-read rather than assume: the registry may normalise, and a screen
      // showing what was *asked for* rather than what was stored is a screen an
      // Owner cannot trust.
      await load();
      setSaved(entry.key);
      setTimeout(() => setSaved(null), 2_000);
    } catch (error) {
      const message =
        (error as { body?: { message?: string } })?.body?.message ??
        (error instanceof Error ? error.message : String(error));
      setProblems((current) => ({ ...current, [entry.key]: message }));
    } finally {
      setSaving(null);
    }
  }

  const shown = (entries ?? []).filter(
    (entry) =>
      filter === '' ||
      entry.key.toLowerCase().includes(filter.toLowerCase()) ||
      entry.description.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <main className="shell">
      <h1>{t('title')}</h1>
      <p className="muted">{t('explain')}</p>

      {problems[''] && <Message severity="error" text={problems['']} />}

      <InputText
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder={t('filter')}
        aria-label={t('filter')}
        style={{ marginBottom: 16, maxWidth: 360, width: '100%' }}
      />

      {!entries && <p className="muted">{t('loading')}</p>}

      {shown.map((entry) => (
        <section className="panel" key={entry.key}>
          <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>{entry.key}</h2>
            {entry.readOnly && <Tag severity="info" value={t('systemWritten')} />}
          </div>

          <p className="muted">{entry.description}</p>

          {/*
            FR-007: a key the system writes is readable and has no control at
            all — not a disabled one. A disabled input invites somebody to work
            out how to enable it; a value with a sentence beside it says what is
            true, which is that this number is the system's own record.
          */}
          {entry.readOnly ? (
            <p>
              <code>{JSON.stringify(entry.value)}</code>
            </p>
          ) : (
            <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Control
                control={entry.control}
                value={drafts[entry.key]}
                onChange={(next) =>
                  setDrafts((current) => ({ ...current, [entry.key]: next }))
                }
                label={entry.key}
              />
              <Button
                label={t('save')}
                size="small"
                loading={saving === entry.key}
                disabled={
                  saving !== null ||
                  JSON.stringify(drafts[entry.key]) === JSON.stringify(entry.value)
                }
                onClick={() => void save(entry)}
              />
              {saved === entry.key && <span className="muted">{t('saved')}</span>}
            </div>
          )}

          <p className="muted" style={{ marginTop: 8 }}>
            {t('default', { value: JSON.stringify(entry.default) })}
          </p>

          {problems[entry.key] && (
            <Message severity="error" text={problems[entry.key]} />
          )}
        </section>
      ))}
    </main>
  );
}

/** One input, chosen by the server's own description of the key. */
function Control({
  control,
  value,
  onChange,
  label,
}: {
  control: SettingControl;
  value: unknown;
  onChange: (next: unknown) => void;
  label: string;
}) {
  switch (control.kind) {
    case 'switch':
      return (
        <InputSwitch
          checked={value === true}
          aria-label={label}
          onChange={(event) => onChange(event.value === true)}
        />
      );

    case 'number':
      return (
        <InputNumber
          value={typeof value === 'number' ? value : null}
          aria-label={label}
          min={'min' in control ? control.min : undefined}
          max={'max' in control ? control.max : undefined}
          useGrouping={false}
          maxFractionDigits={'integer' in control && control.integer ? 0 : 2}
          onValueChange={(event) => onChange(event.value ?? null)}
        />
      );

    case 'choice':
      return (
        <Dropdown
          value={value}
          aria-label={label}
          options={('options' in control ? control.options : []).map((option) => ({
            label: option,
            value: option,
          }))}
          onChange={(event) => onChange(event.value)}
        />
      );

    case 'time':
      return (
        <InputText
          type="time"
          value={typeof value === 'string' ? value : ''}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'chips':
      return (
        <Chips
          value={Array.isArray(value) ? (value as string[]) : []}
          aria-label={label}
          onChange={(event) => onChange(event.value ?? [])}
        />
      );

    case 'json':
      return (
        <InputTextarea
          value={JSON.stringify(value, null, 2)}
          aria-label={label}
          rows={4}
          style={{ width: '100%', fontFamily: 'monospace' }}
          onChange={(event) => {
            try {
              onChange(JSON.parse(event.target.value));
            } catch {
              // Left as it is while it is half-typed. The Save button compares
              // against the stored value, so an unparseable draft simply never
              // becomes one — and the server would refuse it anyway.
            }
          }}
        />
      );

    default:
      // A kind this build has not heard of. A text box is honest and editable;
      // rendering nothing would make the key unreachable until the portal was
      // redeployed.
      return (
        <InputText
          value={typeof value === 'string' ? value : JSON.stringify(value)}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

export default observer(function Settings() {
  return (
    <RequireAdmin>
      <SettingsPage />
    </RequireAdmin>
  );
});
