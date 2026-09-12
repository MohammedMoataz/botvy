import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import type { PanelStore } from '../../lib/store';

/**
 * The address, and the way out (T934).
 *
 * Two controls, and the address is the interesting one: **where this browser
 * looks for Botvy is a per-browser setting**, not a build constant and not an
 * operator key. It differs per member and per install, and an operator has no
 * way to reach a browser that is already installed — so the one place it can
 * live is here.
 *
 * Changing it signs nobody out. The tokens are the member's and the address is
 * where they are spent; a member moving from a LAN address to their tunnel is
 * the same member, and making them sign in again would teach them not to touch
 * the field.
 */
export const Settings = observer(function Settings({
  store,
}: {
  store: PanelStore;
}) {
  const [gateway, setGateway] = useState(store.gateway);
  const [saved, setSaved] = useState(false);

  function onSave(event: FormEvent) {
    event.preventDefault();
    void store.setGateway(gateway).then(() => {
      setSaved(true);
      // The confirmation clears itself: a tick that stays on screen for the rest
      // of the session stops meaning "just saved".
      setTimeout(() => setSaved(false), 2_000);
    });
  }

  return (
    <details className="mt-3">
      <summary className="small text-muted">{store.t('settings.title')}</summary>

      <form className="mt-2" onSubmit={onSave}>
        <label className="form-label small" htmlFor="gateway">
          {store.t('settings.gateway')}
        </label>
        <div className="input-group input-group-sm">
          <input
            id="gateway"
            className="form-control"
            inputMode="url"
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
          />
          <button className="btn btn-outline-secondary" type="submit">
            {store.t('settings.save')}
          </button>
        </div>
        <div className="form-text small">{store.t('settings.gatewayHint')}</div>
        {saved && <div className="text-success small">✓</div>}
      </form>

      <button
        className="btn btn-outline-secondary btn-sm mt-3"
        onClick={() => void store.logout()}
      >
        {store.t('login.signOut')}
      </button>
    </details>
  );
});
