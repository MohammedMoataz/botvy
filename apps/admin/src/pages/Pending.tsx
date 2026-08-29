import { useQuery } from '@tanstack/react-query';
import { isNotImplemented } from '../api/admin';

/**
 * A routed shell for a screen whose gateway endpoint does not exist yet.
 * It really calls its typed API function; when that function is still a stub it
 * rejects with NotImplementedError and we render the empty state below.
 */
export default function Pending<T>({
  title,
  endpoint,
  query,
}: {
  title: string;
  endpoint: string;
  query: () => Promise<T>;
}) {
  const { data, error, isPending } = useQuery({ queryKey: [endpoint], queryFn: query });

  return (
    <>
      <h1>{title}</h1>
      <div className="card">
        {isPending && <p className="muted">Loading…</p>}
        {error && isNotImplemented(error) && (
          <div className="empty">
            <strong>Endpoint not yet available</strong>
            <p className="muted">
              This screen is wired and waiting on <code>GET {endpoint}</code> from the gateway.
            </p>
          </div>
        )}
        {error && !isNotImplemented(error) && (
          <p className="error" role="alert">
            {error.message}
          </p>
        )}
        {data !== undefined && <pre>{JSON.stringify(data, null, 2)}</pre>}
      </div>
    </>
  );
}
