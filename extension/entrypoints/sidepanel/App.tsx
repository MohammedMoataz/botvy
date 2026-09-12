import { useEffect, useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import type { PanelTaskRow } from '../../lib/db';
import { MESSAGES, type ExtensionMessage } from '../../lib/config';
import { PanelStore } from '../../lib/store';
import { locales, type Locale } from '../../lib/i18n';
import { AddReminder } from './AddReminder';
import { Meetings } from './Meetings';
import { Settings } from './Settings';
import { Status } from './Status';

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
  /** Which of the three Add forms is open. Task first: it is the common one. */
  const [adding, setAdding] = useState<'task' | 'reminder' | 'meeting'>('task');

  useEffect(() => {
    void store.hydrate();
  }, [store]);

  /*
   * What the worker says to the panel.
   *
   * FCM does not work in an extension, so this and the sync on mount are the
   * whole of how the panel hears about a change made on the phone.
   *
   * - **nudge**: something changed elsewhere — run a pass.
   * - **captured**: the worker queued a capture while this panel was open, so
   *   the counts are stale even though nothing came off the wire.
   * - **compose**: the keyboard shortcut, which opens the Add form with the
   *   page's title already in it. Handled here rather than in the store because
   *   it is the form's state and nothing durable depends on it.
   */
  useEffect(() => {
    const onMessage = (message: unknown): void => {
      const typed = message as ExtensionMessage | null;
      if (typed?.type === MESSAGES.nudge) void store.syncNow();
      if (typed?.type === MESSAGES.captured) void store.syncNow();
      if (typed?.type === MESSAGES.compose) {
        setAdding('task');
        setDraft(typed.title);
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    // Tell the worker the panel is up, which is the third of the three ways
    // this surface catches up (the socket and the alarm are the others).
    void chrome.runtime.sendMessage({ type: MESSAGES.syncNow }).catch(() => undefined);
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
          <Status store={store} />

          {/* The one notice line that is not a state: something the member
              should read once, such as a pass that could not reach Botvy. The
              strip above already says *what* is true; this says what happened. */}
          {store.noticeKey && (
            <div className="alert alert-warning py-2 small mb-2">
              {store.t(store.noticeKey, { count: store.blockedCount })}
            </div>
          )}

          {/* Three things a member adds, behind three tabs rather than three
              screens: the panel is a column beside their work, and a form they
              have to navigate to is a form they use on the phone instead. */}
          <ul className="nav nav-pills nav-fill mb-2 small">
            {(['task', 'reminder', 'meeting'] as const).map((kind) => (
              <li className="nav-item" key={kind}>
                <button
                  className={`nav-link py-1 ${adding === kind ? 'active' : ''}`}
                  onClick={() => setAdding(kind)}
                >
                  {store.t(`add.${kind}`)}
                </button>
              </li>
            ))}
          </ul>

          {adding === 'task' && (
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
          )}

          {adding === 'reminder' && <AddReminder store={store} />}

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

          {/* Today, then the week ahead. The meetings are expanded from their
              rules on every render — the panel holds the rule and not the rows,
              because recurrence is a rule plus exceptions and never expanded
              rows. */}
          <hr />
          <Meetings store={store} showForm={adding === 'meeting'} />

          <Settings store={store} />
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

// `formatTime` moved to `Status.tsx`, which is the only thing that renders a
// sync time now.
