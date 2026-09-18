import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import type { PanelStore } from '../../lib/store';

/**
 * Where this browser looks for Botvy.
 *
 * Its own component because it is needed in **two** places, and for a while it
 * was only in one: `Settings` renders inside the signed-in branch of the panel,
 * so a member whose Botvy is not at the build-time default could not reach the
 * field without signing in, and could not sign in without the field. A fresh
 * install against a tunnel — which is every install that is not the developer's
 * own laptop — could not be completed at all.
 *
 * The signed-out copy is therefore not a convenience. It is the only way in.
 *
 * Duplicating the form in both branches would have been the smaller diff and
 * the wrong one: the save path normalises a trailing slash and the two copies
 * would have drifted the first time that changed.
 */
export const GatewayField = observer(function GatewayField({
  store,
  hint = true,
}: {
  store: PanelStore;
  /** The sign-in form is tight on space and says it in its own words. */
  hint?: boolean;
}) {
  const [gateway, setGateway] = useState(store.gateway);
  const [saved, setSaved] = useState(false);

  function onSave(event: FormEvent) {
    // Both copies live inside a parent <form> on some renders, so this must
    // stop the event as well as prevent the default: without it, saving the
    // address also submits the sign-in form underneath, against the address
    // that is being replaced.
    event.preventDefault();
    event.stopPropagation();
    void store.setGateway(gateway).then(() => {
      setSaved(true);
      // The confirmation clears itself: a tick that stays on screen for the
      // rest of the session stops meaning "just saved".
      setTimeout(() => setSaved(false), 2_000);
    });
  }

  return (
    <div>
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
        <button
          className="btn btn-outline-secondary"
          type="button"
          onClick={onSave}
        >
          {store.t('settings.save')}
        </button>
      </div>
      {hint && (
        <div className="form-text small">{store.t('settings.gatewayHint')}</div>
      )}
      {saved && <div className="text-success small">✓</div>}
    </div>
  );
});
