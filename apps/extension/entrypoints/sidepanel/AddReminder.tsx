import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import type { PanelStore } from '../../lib/store';

/**
 * A reminder, from the panel (T932, FR-002).
 *
 * ## It does not appear in the panel afterwards, and says so
 *
 * `reminders` is not one of the four entities this surface syncs, so there is
 * no local table to draw it from — it goes to the member's Botvy and shows up
 * on their phone. A form that silently added nothing visible would read as
 * broken, so the confirmation says where it went. The alternative, widening the
 * sync contract to carry a fifth entity for a form with two fields, is a bigger
 * promise than the feature is worth.
 *
 * ## The moment is the member's wall clock
 *
 * `datetime-local` hands over `YYYY-MM-DDTHH:mm` with no zone, which is exactly
 * right: the store resolves it against the **profile's** zone, never the
 * browser's. A member in Cairo typing 18:00 on a laptop still set to Berlin
 * means six in the evening where they are.
 */
export const AddReminder = observer(function AddReminder({
  store,
}: {
  store: PanelStore;
}) {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [queued, setQueued] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void store.addReminder(title, when).then((ok) => {
      if (!ok) return;
      setTitle('');
      setWhen('');
      setQueued(true);
      setTimeout(() => setQueued(false), 4_000);
    });
  }

  return (
    <form className="mb-3" onSubmit={onSubmit}>
      <label className="form-label small" htmlFor="reminder-title">
        {store.t('reminders.title')}
      </label>
      <input
        id="reminder-title"
        className="form-control form-control-sm mb-2"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />

      <label className="form-label small" htmlFor="reminder-when">
        {store.t('reminders.when')}
      </label>
      <input
        id="reminder-when"
        type="datetime-local"
        className="form-control form-control-sm mb-2"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        required
      />

      <button
        className="btn btn-primary btn-sm"
        type="submit"
        // No zone, no moment: the store refuses rather than resolving against
        // the browser's, and a disabled button says that before the member has
        // typed anything.
        disabled={!title.trim() || !when || store.timezone === null}
      >
        {store.t('reminders.addSubmit')}
      </button>

      {queued && (
        <div className="alert alert-success py-2 small mt-2 mb-0">
          {store.t('reminders.queued')}
        </div>
      )}
    </form>
  );
});
