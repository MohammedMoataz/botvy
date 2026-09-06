import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listSettings, updateSetting, type AdminSetting } from '../api/admin';
import { fmtDate } from './ListScreen';

const ENDPOINT = '/api/admin/settings';

/** Values are jsonb: show strings bare, everything else as the JSON you must type back. */
function toText(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

/**
 * A bare word is a string, anything else is JSON. Lets an operator type
 * `Africa/Cairo` and `["1h","0m"]` in the same box without thinking about it;
 * the gateway validates per key regardless, so a wrong guess here is a 400,
 * not a corrupt setting.
 */
function fromText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function SettingRow({ setting }: { setting: AdminSetting }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(toText(setting.value));

  const save = useMutation({
    mutationFn: () => updateSetting(setting.key, fromText(text)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ENDPOINT] }),
  });

  const dirty = text !== toText(setting.value);

  return (
    <tr>
      <td>
        <code>{setting.key}</code>
        <div className="muted">{setting.description}</div>
        {save.error && (
          <div className="error" role="alert">
            {save.error.message}
          </div>
        )}
      </td>
      <td>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Value for ${setting.key}`}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
      </td>
      <td>{setting.overridden ? 'custom' : <span className="muted">default</span>}</td>
      <td>
        <button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {setting.overridden && (
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              setText(toText(setting.default));
              save.mutate();
            }}
          >
            Reset
          </button>
        )}
      </td>
    </tr>
  );
}

export default function Config() {
  const { data, error, isPending } = useQuery({ queryKey: [ENDPOINT], queryFn: listSettings });

  return (
    <>
      <h1>Config</h1>
      <div className="card">
        <p className="muted">
          Changes take effect within a minute — no restart. Secrets and connection settings are not
          here: those stay in the environment.
        </p>
        {isPending && <p className="muted">Loading…</p>}
        {error && (
          <p className="error" role="alert">
            GET {ENDPOINT} failed: {error.message}
          </p>
        )}
        {data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Value</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.settings.map((s) => (
                  <SettingRow key={s.key} setting={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* The scheduled jobs run in n8n. If these stop advancing, that path is broken. */}
      <h2>Scheduled jobs</h2>
      <div className="card">
        {data &&
          (data.ops.length === 0 ? (
            <div className="empty">
              <p className="muted">
                No sweep or coaching tick has run yet — the n8n schedules may not be reaching the
                gateway.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Last result</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ops.map((o) => (
                    <tr key={o.key}>
                      <td>
                        <code>{o.key}</code>
                      </td>
                      <td>
                        <code>{JSON.stringify(o.value)}</code>
                      </td>
                      <td>{fmtDate(o.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </>
  );
}
