import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

const DASH = <span className="muted">—</span>;

/** Short absolute local time. Nulls and unparseable values degrade, not throw. */
export function fmtDate(iso: string | null | undefined): ReactNode {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Falls back to an em dash for null/empty strings. */
export const orDash = (s: string | null | undefined): ReactNode => s || DASH;

/**
 * Shared chrome for the three admin list screens: heading, fetch, and the
 * loading / error / empty branches. The caller owns its own columns — no
 * column-descriptor abstraction, because three tables do not need one.
 */
export default function ListScreen<T>({
  title,
  endpoint,
  query,
  head,
  empty,
  children,
}: {
  title: string;
  endpoint: string;
  query: () => Promise<T[]>;
  /** A single <tr> of <th> cells. */
  head: ReactNode;
  empty: string;
  children: (rows: T[]) => ReactNode;
}) {
  const { data, error, isPending } = useQuery({ queryKey: [endpoint], queryFn: query });

  return (
    <>
      <h1>{title}</h1>
      <div className="card">
        {isPending && <p className="muted">Loading…</p>}
        {error && (
          <p className="error" role="alert">
            GET {endpoint} failed: {error.message}
          </p>
        )}
        {data &&
          (data.length === 0 ? (
            <div className="empty">
              <p className="muted">{empty}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>{head}</thead>
                <tbody>{children(data)}</tbody>
              </table>
            </div>
          ))}
      </div>
    </>
  );
}
