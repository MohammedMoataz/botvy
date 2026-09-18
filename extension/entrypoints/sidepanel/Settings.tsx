import { observer } from 'mobx-react-lite';
import type { PanelStore } from '../../lib/store';
import { GatewayField } from './GatewayField';

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
 *
 * The field itself lives in `GatewayField`, because the sign-in form needs it
 * too — this panel is only reachable once signed in, and signing in needs the
 * address to already be right.
 */
export const Settings = observer(function Settings({
  store,
}: {
  store: PanelStore;
}) {
  return (
    <details className="mt-3">
      <summary className="small text-muted">
        {store.t('settings.title')}
      </summary>

      <div className="mt-2">
        <GatewayField store={store} />
      </div>

      <button
        className="btn btn-outline-secondary btn-sm mt-3"
        onClick={() => void store.logout()}
      >
        {store.t('login.signOut')}
      </button>
    </details>
  );
});
