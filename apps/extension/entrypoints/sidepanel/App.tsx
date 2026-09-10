import { useEffect, useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import type { PanelTaskRow } from '../../lib/db';
import { SYNC_NUDGE_MESSAGE } from '../../lib/config';
import { PanelStore } from '../../lib/store';
import { locales, type Locale } from '../../lib/i18n';

export const App = observer(function App() {
  // A new store per mount, hydrated from chrome.storage + Dexie — the panel is
  // destroyed every time it is closed, so React state is never the record.
  const [store] = useState(() => new PanelStore());
  const [password, setPassword] = useState('');
  const [draft, setDraft] = useState('');
  // The one piece of genuinely transient state, and it is transient on purpose:
  // a task completed here leaves Today's list immediately, so the undo has to
  // hang on to the id for as long as the strip is on screen and no longer. It
  // survives nothing, and nothing should want it to — Dexie already holds the
  // outcome.
  const [undoable, setUndoable] = useState<PanelTaskRow | null>(null);

  useEffect(() => {
    void store.hydrate();
  }, [store]);

  // The nudge. FCM does not work in an extension, so this and the sync on mount
  // are the whole of how the panel hears about a change made on the phone.
  useEffect(() => {
    const onMessage = (message: unknown): void => {
      if ((message as { type?: string } | null)?.type === SYNC_NUDGE_MESSAGE) {
        void store.syncNow();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [store]);

  if (!store.hydrated) return <div className="panel-shell text-muted">…</div>;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void store.login(password);
  }

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const title = draft;
    setDraft('');
    void store.addTask(title);
  }

  function onComplete(task: PanelTaskRow) {
    setUndoable(task);
    void store.setCompleted(task.id, true);
  }

  function onUndo(task: PanelTaskRow) {
    setUndoable(null);
    void store.setCompleted(task.id, false);
  }

  return (
    <div className="panel-shell">
      <div className="d-flex align-items-start mb-3">
        <div className="me-auto">
          <div className="brand">{store.t('app.name')}</div>
          <div className="text-muted small">{store.t('app.tagline')}</div>
        </div>
        <select
          className="form-select form-select-sm w-auto"
          aria-label={store.t('locale.label')}
          value={store.locale}
          onChange={(e) => void store.setLocale(e.target.value as Locale)}
        >
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {store.t(`locale.${locale}`)}
            </option>
          ))}
        </select>
      </div>

      {store.isAuthenticated ? (
        <div>
          {/* The sync indicator. It reports the *last completed pass*, read back
              out of Dexie, so a reopened panel says "synced 14:02" rather than
              "not synced yet" — the round trip is durable and the label has to
              agree with it. */}
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="text-muted small me-auto">
              {store.syncing
                ? store.t('sync.syncing')
                : store.lastSyncedAt
                  ? store.t('sync.at', { time: formatTime(store.lastSyncedAt, store.locale) })
                  : store.t('sync.never')}
            </span>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => void store.syncNow()}
              disabled={store.syncing}
            >
              {store.t('sync.now')}
            </button>
          </div>

          {/* One notice line for both the round trip and the commands. A blocked
              push is the case the contract is strictest about: the edit is never
              discarded, so it must be possible to see it and retry it. */}
          {store.noticeKey && (
            <div className="alert alert-warning py-2 small d-flex align-items-center gap-2">
              <span className="me-auto">
                {store.t(store.noticeKey, { count: store.blockedCount })}
              </span>
              {store.blockedCount > 0 && (
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => void store.retryBlocked()}
                >
                  {store.t('sync.retry')}
                </button>
              )}
            </div>
          )}

          <form className="input-group input-group-sm mb-3" onSubmit={onAdd}>
            <input
              className="form-control"
              placeholder={store.t('tasks.add')}
              aria-label={store.t('tasks.add')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
              {store.t('tasks.addSubmit')}
            </button>
          </form>

          {undoable && (
            <div className="alert alert-secondary py-2 small d-flex align-items-center gap-2">
              <span className="me-auto text-truncate">{undoable.title}</span>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => onUndo(undoable)}
              >
                {store.t('tasks.undo')}
              </button>
            </div>
          )}

          <h1 className="h6">{store.t('tasks.today')}</h1>

          {/* Drawn only once the member's own zone is known. An empty list would
              be a lie while it is not: without a zone there is no "today", and
              guessing at one from the browser is the mistake that shifted every
              extracted reminder by three hours in v1. */}
          {store.timezone === null ? (
            <p className="text-muted small">{store.t('tasks.waiting')}</p>
          ) : store.today.length === 0 ? (
            <p className="text-muted small">{store.t('tasks.empty')}</p>
          ) : (
            <ul className="list-unstyled task-list">
              {store.today.map((task) => (
                <li key={task.id} className="task-row">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={false}
                    aria-label={`${store.t('tasks.complete')}: ${task.title}`}
                    // A task whose create is still queued has no server row to
                    // complete, so the route would answer 404. Disabled rather
                    // than allowed to fail.
                    disabled={task.pendingOp === 'create'}
                    onChange={() => onComplete(task)}
                  />
                  <span
                    className={`prio prio-${task.priority}`}
                    aria-label={store.t('tasks.priority', { level: task.priority })}
                    role="img"
                  />
                  <span className="task-title text-truncate">{task.title}</span>
                  {task.label && (
                    // The colour is the server's — labels are coloured from
                    // `settings.labels.palette`, an operator knob, so a client
                    // that shipped its own copy would be a hard-coded default.
                    <span className="label-chip" style={{ background: task.label.color }}>
                      {task.label.name}
                    </span>
                  )}
                  {task.pendingOp && (
                    <span className="badge text-bg-light">{store.t('tasks.unsent')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button
            className="btn btn-outline-secondary btn-sm mt-3"
            onClick={() => void store.logout()}
          >
            {store.t('login.signOut')}
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <h1 className="h6">{store.t('login.title')}</h1>

          <div className="mb-2">
            <label className="form-label small" htmlFor="email">
              {store.t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              className="form-control form-control-sm"
              autoComplete="username"
              required
              value={store.email}
              onChange={(e) => store.setEmail(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="form-label small" htmlFor="password">
              {store.t('login.password')}
            </label>
            <input
              id="password"
              type="password"
              className="form-control form-control-sm"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={store.status === 'pending'}
          >
            {store.status === 'pending'
              ? store.t('login.pending')
              : store.t('login.submit')}
          </button>

          {/* One message for a wrong password and an unknown address alike:
              the API answers the same way for both, deliberately. */}
          {store.failure === 'invalid_credentials' && (
            <div className="alert alert-danger py-2 mt-3 mb-0">
              {store.t('login.invalid')}
            </div>
          )}
          {/* The session was ended on purpose — most likely the refresh token
              was replayed. Not a typo, and not worth hunting for one. */}
          {store.failure === 'session_replay' && (
            <div className="alert alert-warning py-2 mt-3 mb-0">
              {store.t('login.replay')}
            </div>
          )}
          {store.failure === 'unknown' && (
            <div className="alert alert-danger py-2 mt-3 mb-0">
              {store.t('login.failed')}
            </div>
          )}
        </form>
      )}
    </div>
  );
});

/**
 * The clock time of the last pass, in the panel's locale.
 *
 * A wall-clock time and not a relative one ("3 minutes ago"), because a
 * relative label has to be re-rendered to stay true and this component only
 * re-renders when something changes. A stale "just now" is worse than a fixed
 * time that the member can read against their own clock.
 */
function formatTime(instant: string, locale: string): string {
  return new Date(instant).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
