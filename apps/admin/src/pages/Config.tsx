import { listSettings } from '../api/admin';
import ListScreen, { fmtDate } from './ListScreen';

/** jsonb: objects and arrays as compact JSON, primitives as themselves. */
function renderValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

export default function Config() {
  return (
    <ListScreen
      title="Config"
      endpoint="/admin/settings"
      query={listSettings}
      empty="No settings are stored — the gateway is running on its defaults."
      head={
        <tr>
          <th>Key</th>
          <th>Value</th>
          <th>Updated</th>
        </tr>
      }
    >
      {(settings) =>
        settings.map((s) => (
          <tr key={s.key}>
            <td>{s.key}</td>
            <td>
              <code>{renderValue(s.value)}</code>
            </td>
            <td>{fmtDate(s.updatedAt)}</td>
          </tr>
        ))
      }
    </ListScreen>
  );
}
