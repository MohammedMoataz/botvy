import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../api/client';
import { getStats, type AdminStats } from '../api/admin';

function Dot({ ok }: { ok: boolean | undefined }) {
  const state = ok === undefined ? 'unknown' : ok ? 'up' : 'down';
  return <span className={`dot dot-${state}`} aria-label={state} />;
}

const STAT_CARDS: Array<{ key: keyof AdminStats; label: string }> = [
  { key: 'totalUsers', label: 'Total users' },
  { key: 'totalDevices', label: 'Devices' },
  { key: 'messagesToday', label: 'Messages today' },
  { key: 'tokensToday', label: 'Tokens today' },
];

export default function Overview() {
  const health = useQuery({ queryKey: ['/health'], queryFn: getHealth, refetchInterval: 30_000 });
  const stats = useQuery({ queryKey: ['/admin/stats'], queryFn: getStats });

  return (
    <>
      <h1>Overview</h1>

      <section>
        <h2>System health</h2>
        <div className="grid">
          <div className="card">
            <div className="stat-label">Overall</div>
            <div className="stat-value">
              <Dot ok={health.data && health.data.status === 'ok'} />
              {health.isPending ? 'checking…' : (health.data?.status ?? 'unreachable')}
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Database</div>
            <div className="stat-value">
              <Dot ok={health.data?.database} />
              {health.data ? (health.data.database ? 'up' : 'down') : '—'}
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Ollama</div>
            <div className="stat-value">
              <Dot ok={health.data?.ollama} />
              {health.data ? (health.data.ollama ? 'up' : 'down') : '—'}
            </div>
          </div>
        </div>
        {health.error && (
          <p className="error" role="alert">
            GET /health failed: {health.error.message}
          </p>
        )}
      </section>

      <section>
        <h2>Usage</h2>
        <div className="grid">
          {STAT_CARDS.map(({ key, label }) => (
            <div className="card" key={key}>
              <div className="stat-label">{label}</div>
              <div className="stat-value">
                {stats.data ? (
                  stats.data[key].toLocaleString()
                ) : (
                  <span className="muted">{stats.isPending ? '…' : '—'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {stats.error && (
          <p className="error" role="alert">
            GET /admin/stats failed: {stats.error.message}
          </p>
        )}
      </section>
    </>
  );
}
