import { observer } from 'mobx-react-lite';
import type { PanelStore } from '../../lib/store';

/**
 * Whether the panel is telling the truth about how current it is (T933, FR-007).
 *
 * The strip is not decoration. A companion surface that shows yesterday's tasks
 * with no indication that it is stale is worse than one that shows nothing: the
 * member acts on it. So this says which of five things is true, and the two that
 * need the member — **blocked** and **offline** — say so in a colour rather than
 * in a footnote.
 */
export const Status = observer(function Status({ store }: { store: PanelStore }) {
  const state = store.syncState;
  const tone =
    state === 'blocked'
      ? 'text-bg-warning'
      : state === 'offline' || state === 'stale'
        ? 'text-bg-secondary'
        : state === 'catching-up'
          ? 'text-bg-info'
          : 'text-bg-success';

  return (
    <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
      <span className={`badge ${tone}`}>{store.t(`sync.state.${state}`)}</span>

      <span className="text-muted small">
        {store.lastSyncedAt
          ? store.t('sync.at', {
              time: formatTime(store.lastSyncedAt, store.locale),
            })
          : store.t('sync.never')}
      </span>

      {/* The number, because "catching up" without one does not tell a member
          whether the thing they just typed is in it. */}
      {store.unsentCount > 0 && (
        <span className="badge text-bg-light">
          {store.t('sync.unsent', { count: store.unsentCount })}
        </span>
      )}

      <button
        className="btn btn-outline-secondary btn-sm ms-auto"
        onClick={() => void store.syncNow()}
        disabled={store.syncing}
      >
        {store.syncing ? store.t('sync.syncing') : store.t('sync.now')}
      </button>

      {/* Retrying is the way out of `blocked`, and it is the member's to press:
          the contract's one hard rule about the attempt cap is that the edit is
          never discarded, so something has to put it back in the rotation. */}
      {store.blockedCount > 0 && (
        <button
          className="btn btn-outline-warning btn-sm"
          onClick={() => void store.retryBlocked()}
        >
          {store.t('sync.retry')}
        </button>
      )}
    </div>
  );
});

/**
 * The clock time of the last pass, in the panel's locale.
 *
 * A wall-clock time and not a relative one ("3 minutes ago"), because a relative
 * label has to be re-rendered to stay true and this component only re-renders
 * when something changes. A stale "just now" is worse than a fixed time the
 * member can read against their own clock.
 */
function formatTime(instant: string, locale: string): string {
  return new Date(instant).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
