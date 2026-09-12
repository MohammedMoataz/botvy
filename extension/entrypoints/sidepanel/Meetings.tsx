import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import type { AgendaEntry, PanelStore } from '../../lib/store';

/**
 * The next seven days of meetings, and the quick add that puts one in.
 *
 * Its own file rather than more of `App.tsx`, which already carries the
 * sign-in form, the sync indicator and Today's list. Nothing here is durable:
 * the occurrences are derived from Dexie on every render by the store, and the
 * form below is a draft the member is in the middle of typing. **Everything
 * that must survive the panel closing is in Dexie or chrome.storage** — the
 * panel is destroyed every time it is closed, so a form's own state is the one
 * kind of React state that is allowed to be the record.
 */
export const Meetings = observer(function Meetings({
  store,
  /**
   * Whether the Add form is open, which the panel's tabs decide.
   *
   * The list is always drawn — "what is coming" is the reason to look at this
   * section at all — and only the form follows the tab. Defaulting to open
   * would put a five-field form under every list on every mount.
   */
  showForm = false,
}: {
  store: PanelStore;
  showForm?: boolean;
}) {
  return (
    <section className="mb-3">
      <h2 className="h6">{store.t('meetings.next')}</h2>

      {/* The list is drawn only once the member's own zone is known. An empty
          list would be a lie while it is not: every occurrence below is a wall
          clock resolved against that zone, and guessing at one from the browser
          is the mistake that shifted every extracted reminder by three hours in
          v1. */}
      {store.timezone === null ? (
        <p className="text-muted small">{store.t('meetings.waiting')}</p>
      ) : store.nextSevenDays.length === 0 ? (
        <p className="text-muted small">{store.t('meetings.empty')}</p>
      ) : (
        <ul className="list-unstyled">
          {store.nextSevenDays.map((entry) => (
            <MeetingRowView
              // An occurrence has no id of its own — it is derived from the
              // rule — so the meeting and the moment the rule produced are its
              // identity. `originalStart` rather than `startAt`, because a
              // moved occurrence keeps its key and only its moment changes.
              key={`${entry.meetingId}:${entry.occurrence.originalStart}`}
              entry={entry}
              store={store}
            />
          ))}
        </ul>
      )}

      {showForm && <QuickAdd store={store} />}
    </section>
  );
});

const MeetingRowView = observer(function MeetingRowView({
  entry,
  store,
}: {
  entry: AgendaEntry;
  store: PanelStore;
}) {
  const { occurrence } = entry;
  const { onlineLink, address } = occurrence.location;

  return (
    <li className="d-flex align-items-start gap-2 py-1 border-bottom">
      {/* `minWidth: 0` is what lets `text-truncate` below actually truncate: a
          flex item's default minimum is its content, so a long title would push
          the Join button out of the panel instead. */}
      <div className="me-auto" style={{ minWidth: 0 }}>
        <div className="text-truncate">{occurrence.title}</div>
        <div className="text-muted small">
          {when(occurrence.startAt, store)}
          {occurrence.moved && ` · ${store.t('meetings.moved')}`}
        </div>
        {/* No link means an address, and the address is shown as written. Both
            may be present — a room that is also dialled into is one meeting —
            in which case the Join button and the address stand together. */}
        {address && <div className="text-muted small">{address}</div>}
      </div>
      {onlineLink && (
        // A plain link rather than `chrome.tabs.create`: `target="_blank"` opens
        // the new tab with no `tabs` permission to ask for, and `rel` keeps the
        // meeting host from reaching back into the panel through `window.opener`.
        <a
          className="btn btn-primary btn-sm flex-shrink-0"
          href={onlineLink}
          target="_blank"
          rel="noreferrer noopener"
        >
          {store.t('meetings.join')}
        </a>
      )}
    </li>
  );
});

const QuickAdd = observer(function QuickAdd({ store }: { store: PanelStore }) {
  const [title, setTitle] = useState('');
  const [startWallClock, setStart] = useState('');
  const [length, setLength] = useState('');
  const [onlineLink, setLink] = useState('');
  const [address, setAddress] = useState('');

  /**
   * **At least one of a link and an address**, per FR-001.
   *
   * Checked here as well as in the store because the panel should not send a
   * request it already knows the server will refuse: the refusal would arrive
   * as a notice about the server, which is not what went wrong, and it would
   * cost a round trip to say it.
   */
  const complete =
    title.trim().length > 0 &&
    startWallClock.length > 0 &&
    (onlineLink.trim().length > 0 || address.trim().length > 0);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const added = await store.addMeeting({
      title,
      startWallClock,
      // Blank means "my usual length": the store sends null and the server
      // resolves the member's own `defaults.meetingDurationMin`. Filling one in
      // here would be a hard-coded default for an operator's knob.
      durationMin: Number(length) || 0,
      onlineLink,
      address,
    });
    // Cleared only on success, so a meeting the server refused is still on
    // screen for the member to fix rather than retyped from memory.
    if (!added) return;
    setTitle('');
    setStart('');
    setLength('');
    setLink('');
    setAddress('');
  }

  return (
    // `<details>` rather than a toggle in React state: the browser owns the
    // open/closed bit, so there is nothing to restore when the panel re-mounts
    // and nothing to keep in step.
    <details className="mt-2">
      <summary className="small">{store.t('meetings.add')}</summary>

      <form className="mt-2" onSubmit={(event) => void onSubmit(event)}>
        <div className="mb-2">
          <label className="form-label small" htmlFor="meeting-title">
            {store.t('meetings.name')}
          </label>
          <input
            id="meeting-title"
            className="form-control form-control-sm"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="d-flex gap-2 mb-2">
          <div className="flex-grow-1">
            <label className="form-label small" htmlFor="meeting-start">
              {store.t('meetings.start')}
            </label>
            {/* Native, so the member gets their own platform's picker — and it
                hands back wall-clock digits with no zone, which the store
                resolves against the *profile's* zone rather than the browser's.
                `new Date(digits)` would use the browser's and place the meeting
                an hour out for a member who is travelling. */}
            <input
              id="meeting-start"
              type="datetime-local"
              className="form-control form-control-sm"
              required
              value={startWallClock}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div style={{ maxWidth: '6rem' }}>
            <label className="form-label small" htmlFor="meeting-length">
              {store.t('meetings.length')}
            </label>
            <input
              id="meeting-length"
              type="number"
              min={1}
              max={480}
              className="form-control form-control-sm"
              placeholder="—"
              aria-describedby="meeting-length-hint"
              value={length}
              onChange={(event) => setLength(event.target.value)}
            />
          </div>
        </div>
        <div id="meeting-length-hint" className="form-text small mb-2">
          {store.t('meetings.lengthHint')}
        </div>

        <div className="mb-2">
          <label className="form-label small" htmlFor="meeting-link">
            {store.t('meetings.link')}
          </label>
          <input
            id="meeting-link"
            type="url"
            className="form-control form-control-sm"
            value={onlineLink}
            onChange={(event) => setLink(event.target.value)}
          />
        </div>

        <div className="mb-2">
          <label className="form-label small" htmlFor="meeting-address">
            {store.t('meetings.address')}
          </label>
          <input
            id="meeting-address"
            className="form-control form-control-sm"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>

        {!complete && (
          <div className="form-text small mb-2">
            {store.t('meetings.where')}
          </div>
        )}

        <button
          className="btn btn-primary btn-sm"
          type="submit"
          disabled={!complete || store.timezone === null}
        >
          {store.t('meetings.addSubmit')}
        </button>
      </form>
    </details>
  );
});

/**
 * When an occurrence is, on the member's own clock.
 *
 * `timeZone` is passed explicitly and comes from the profile. Leaving it out
 * would render every meeting in the browser's zone — right in the member's own
 * city and wrong everywhere else they open a browser, which is the one failure
 * this whole path exists to avoid.
 */
function when(instant: string, store: PanelStore): string {
  return new Intl.DateTimeFormat(store.locale, {
    timeZone: store.timezone ?? 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant));
}
