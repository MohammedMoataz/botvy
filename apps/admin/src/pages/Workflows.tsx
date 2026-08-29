import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateWorkflow,
  deactivateWorkflow,
  listWorkflows,
  runWorkflow,
  type WorkflowSummary,
} from '../api/workflows';
import { fmtDate } from './ListScreen';

const ENDPOINT = '/workflows';

export default function Workflows() {
  const qc = useQueryClient();
  const { data, error, isPending } = useQuery({
    queryKey: [ENDPOINT],
    queryFn: listWorkflows,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [ENDPOINT] });

  const toggle = useMutation({
    mutationFn: (w: WorkflowSummary) =>
      w.active ? deactivateWorkflow(w.id) : activateWorkflow(w.id),
    onSuccess: invalidate,
  });

  const run = useMutation({
    mutationFn: (w: WorkflowSummary) => runWorkflow(w.id),
    // A run produces an execution, so the last-execution column is stale.
    onSuccess: invalidate,
  });

  const busy = toggle.isPending || run.isPending;
  const actionError = toggle.error ?? run.error;

  return (
    <>
      <h1>Workflows</h1>
      <div className="card">
        {isPending && <p className="muted">Loading…</p>}
        {error && (
          <p className="error" role="alert">
            GET {ENDPOINT} failed: {error.message}
          </p>
        )}
        {actionError && (
          <p className="error" role="alert">
            {actionError.message}
          </p>
        )}
        {data &&
          (data.length === 0 ? (
            <div className="empty">
              <p className="muted">
                No workflows found in n8n. Import them with{' '}
                <code>node workflows/import.mjs</code>.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>State</th>
                    <th>Next run</th>
                    <th>Last execution</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      <td>
                        <span className={`pill pill-${w.active ? 'active' : 'banned'}`}>
                          {w.active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td>
                        {w.nextRun ? (
                          fmtDate(w.nextRun)
                        ) : (
                          <span className="muted">
                            {w.active ? 'no schedule' : 'inactive'}
                          </span>
                        )}
                      </td>
                      <td>
                        {w.lastExecution ? (
                          <>
                            {w.lastExecution.status} · {fmtDate(w.lastExecution.startedAt)}
                          </>
                        ) : (
                          <span className="muted">never run</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggle.mutate(w)}
                        >
                          {w.active ? 'Deactivate' : 'Activate'}
                        </button>{' '}
                        <button
                          type="button"
                          disabled={busy || !w.canTrigger}
                          title={
                            w.canTrigger
                              ? 'Trigger this workflow now'
                              : 'This workflow has no webhook trigger, so it cannot be run on demand'
                          }
                          onClick={() => run.mutate(w)}
                        >
                          Run now
                        </button>
                      </td>
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
