import { useEffect, useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import { PanelStore } from '../../lib/store';
import { locales, type Locale } from '../../lib/i18n';

export const App = observer(function App() {
  // A new store per mount, hydrated from chrome.storage + Dexie — the panel is
  // destroyed every time it is closed, so React state is never the record.
  const [store] = useState(() => new PanelStore());
  const [password, setPassword] = useState('');

  useEffect(() => {
    void store.hydrate();
  }, [store]);

  if (!store.hydrated) return <div className="panel-shell text-muted">…</div>;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void store.login(password);
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
          <div className="alert alert-success py-2">
            {store.t('login.welcome', { name: store.displayName })}
          </div>
          {/* The working panel — today's tasks and meetings — arrives with P9.
              Said plainly, because a signed-in panel with nothing on it reads
              as a failure rather than as a phase boundary. */}
          <p className="text-muted small">{store.t('panel.soon')}</p>
          <button
            className="btn btn-outline-secondary btn-sm"
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
