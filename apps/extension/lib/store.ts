import { makeAutoObservable, runInAction } from 'mobx';
import {
  AuthStore as SdkAuthStore,
  BotvyClient,
  MeetingsStore,
  ProfileStore,
  SyncStore,
  TokenStore,
  expandOccurrences,
  localDay,
  meetingAsRepeating,
  newId,
  wallClockToUtc,
  type CalendarEventRow,
  type CompleteTaskAck,
  type LabelRow,
  type MeetingRow,
  type Occurrence,
  type SignedInMember,
  type TaskAck,
  type TokenPair,
} from '@botvy/sdk';
import { GATEWAY_URL, readTokens, writeTokens } from './config';
import { db, getMeta, setMeta, type PanelTaskRow } from './db';
import {
  DexieSyncTable,
  SYNC_CURSOR_KEY,
  SYNC_LAST_AT_KEY,
  dexieCursorStorage,
} from './sync-table';
import {
  applyDirection,
  loadLocale,
  saveLocale,
  translate,
  type Locale,
} from './i18n';

/**
 * The panel's session, on the SDK.
 *
 * Two constraints shape this file and neither is negotiable.
 *
 * `chrome.storage` is asynchronous and the SDK's token storage is not, so the
 * store keeps a synchronous in-memory mirror that `hydrate()` fills and every
 * write flushes back. And the side panel is *destroyed* every time it closes,
 * so that mirror is rebuilt from `chrome.storage` on each mount — which is why
 * nothing durable may live in React state alone.
 *
 * The refresh function used to be a `fetch` written here. It is the SDK's now:
 * a second single-flight refresh is a second chance to spend the same refresh
 * token twice, and the API reads that as a stolen token and revokes the whole
 * family. The panel and the service worker share one `chrome.storage` key, so
 * that was a real risk rather than a tidy-up.
 *
 * ## Why the sync round trip lives here and not in the service worker
 *
 * It would be tidier in the worker: the worker survives the panel closing, so a
 * queued edit would flush without the member reopening anything. It is here
 * anyway, and the paragraph above is the reason. A `SyncStore` needs a client,
 * a client needs a `TokenStore`, and a `TokenStore` refreshes — so a worker-side
 * engine is a *second* refresher racing the panel's over one `chrome.storage`
 * key, and the API answers a replayed refresh token by revoking the family and
 * signing the member out. One refresher is worth more than a background flush.
 *
 * What the worker does instead is wake this side: it owns the socket, and a
 * `sync.nudge` becomes a `runtime.sendMessage` the panel answers by syncing.
 * With the panel closed the queue simply waits — every mount syncs, so it
 * flushes on the next open. The upgrade, when a background flush is worth
 * having, is to move the one refresher into the worker and have the panel ask
 * it for tokens; it is not to add a second `SyncStore`.
 */

export type AuthStatus = 'idle' | 'pending' | 'authenticated' | 'error';
export type AuthFailure = 'invalid_credentials' | 'session_replay' | 'unknown';

const LAST_EMAIL_KEY = 'auth.lastEmail';
const INSTALL_ID_KEY = 'auth.installId';

/**
 * Dexie `meta` key holding the member's own time zone.
 *
 * Cached because **times belong to the member, not to the machine**. "Today" in
 * the list below is the member's calendar day, and reading the browser's zone
 * for it is the mistake that once shifted every extracted reminder by three
 * hours — a laptop in a hotel is no more authoritative than a server in
 * Frankfurt. The zone comes from the profile, and it is cached here so that a
 * panel opened with no connection still draws the right day rather than
 * silently falling back to the host's.
 */
const TIMEZONE_KEY = 'profile.timezone';

/** Priority 4 — the server's own default for a task nobody prioritised. */
const DEFAULT_PRIORITY = 4;

/** How far ahead the meetings list looks. Seven days, per T550. */
const AGENDA_DAYS = 7;

/**
 * One occurrence the panel draws, with the id of the row it came from.
 *
 * The occurrence is derived on every read and the meeting is what the member
 * can act on, so both travel together — and the pair is also the only stable
 * identity a list key can use, because an occurrence has no id of its own.
 */
export interface AgendaEntry {
  meetingId: string;
  occurrence: Occurrence;
}

/** What the quick-add form collects. The wall clock is the member's, not the host's. */
export interface MeetingDraft {
  title: string;
  /** `YYYY-MM-DDTHH:mm` as `<input type="datetime-local">` hands it over. */
  startWallClock: string;
  durationMin: number;
  onlineLink: string;
  address: string;
}

export class PanelStore {
  locale: Locale = 'en';
  hydrated = false;
  email = '';
  status: AuthStatus = 'idle';
  failure: AuthFailure | null = null;
  member: SignedInMember | null = null;

  /** The rows the panel draws, read out of Dexie — never held only in React. */
  tasks: PanelTaskRow[] = [];
  labels: LabelRow[] = [];
  meetings: MeetingRow[] = [];

  /** The member's zone, from the profile and cached in Dexie. Never the host's. */
  timezone: string | null = null;

  syncing = false;
  /** The server's `now` from the last completed pass, kept across re-mounts. */
  lastSyncedAt: string | null = null;
  /** Pushes the server has refused five times. Non-empty owes a retry. */
  blockedCount = 0;
  /** A translation key for the one notice line, or null when there is nothing to say. */
  noticeKey: string | null = null;

  /** The synchronous mirror the SDK reads; chrome.storage stays the durable copy. */
  readonly mirror: TokenStore;
  readonly client: BotvyClient;
  readonly auth: SdkAuthStore;
  readonly profile: ProfileStore;
  readonly meetingsApi: MeetingsStore;

  /**
   * The local tables, and the engine that fills them.
   *
   * Labels are registered before tasks, and the order is the one thing this
   * declaration has to get right: `SyncStore` sends `entities` and builds
   * `push` by iterating these keys, and a task carries a snapshot of its
   * label's name and colour — so applying tasks first would let one name a
   * label the same request is about to create. The server sorts its adapters by
   * `applyOrder` and would survive the wrong order; the wire should not have to
   * be rescued.
   *
   * Meetings and calendar events come after, in the order `contracts/sync.md`
   * writes them and the server's `applyOrder` applies them (32 then 34).
   * Neither references anything and nothing references either, so the order is
   * not buying correctness there — it is buying a request that reads the same
   * as the contract, so that nobody later "fixes" it in the wrong direction.
   *
   * Both are registered even though the panel only draws meetings. Registering
   * is what makes the entity real to the engine: it is the key `entities` is
   * built from, the table a `purge` push writes through, and — the part that is
   * easy to miss — the branch a rejection takes. `SyncStore` looks a rejection's
   * `entity` up in this map *before* it touches a row, and skips an entity it
   * finds no table for. So an unregistered `calendar_events` rejection would be
   * silently dropped rather than applied through some other table, and a
   * registered one is branched correctly with no code here at all.
   */
  readonly labelsTable = new DexieSyncTable<LabelRow>('labels', db.labels);
  readonly tasksTable = new DexieSyncTable<PanelTaskRow>('tasks', db.tasks);
  readonly meetingsTable = new DexieSyncTable<MeetingRow>(
    'meetings',
    db.meetings,
  );
  readonly eventsTable = new DexieSyncTable<CalendarEventRow>(
    'calendar_events',
    db.calendar_events,
  );

  /** Built in `hydrate`, because the install id and the cursor are in Dexie. */
  sync: SyncStore | null = null;

  /**
   * Whether `hydrate` has already been entered, so a second call is a no-op.
   *
   * React's StrictMode invokes an effect twice in development, and the panel's
   * mount effect is what calls `hydrate` — so without this there would be two
   * `SyncStore`s over one Dexie queue, each with its own single-flight latch
   * and neither aware of the other. Two engines pushing the same queue is not a
   * cosmetic double request: it is two passes that both read the queue, both
   * send it, and both write a cursor. A `#` field rather than a public one so
   * `makeAutoObservable` cannot see it — this is not state anything renders.
   */
  #hydrating = false;

  constructor() {
    let held: TokenPair | null = null;

    this.mirror = new TokenStore(
      {
        read: () => held,
        write: (tokens) => {
          held = tokens;
          // Durable copy, best effort: a panel that closed mid-write rehydrates
          // from whichever value did land.
          void writeTokens(tokens);
        },
      },
      // Deferred through a closure: the auth store needs the client, the client
      // needs this token store, and a refresh can only happen after all three
      // exist.
      (refreshToken) => this.auth.refreshFn(refreshToken),
    );

    this.client = new BotvyClient({
      baseUrl: GATEWAY_URL,
      tokens: this.mirror,
    });
    this.auth = new SdkAuthStore(this.client, this.mirror);
    this.profile = new ProfileStore(this.client);
    this.meetingsApi = new MeetingsStore(this.client);

    makeAutoObservable(this, {
      mirror: false,
      client: false,
      auth: false,
      profile: false,
      meetingsApi: false,
      labelsTable: false,
      tasksTable: false,
      meetingsTable: false,
      eventsTable: false,
      sync: false,
    });

    this.auth.subscribe((member) => {
      runInAction(() => {
        this.member = member;
        if (!member && this.status === 'authenticated') {
          this.status = 'idle';
          this.failure =
            this.auth.lastSignOutReason === 'session_replay'
              ? 'session_replay'
              : null;
        }
      });
    });
  }

  get isAuthenticated(): boolean {
    return this.mirror.signedIn;
  }

  /** What to greet the member with once signed in. */
  get displayName(): string {
    return this.member?.email ?? this.email;
  }

  /**
   * Today's list — open tasks due on or before the member's today.
   *
   * A mirror of `TasksStore.view('today', …)` in the SDK, which is the shared
   * definition and would be called here if it could be. It cannot: its rows
   * live in a `MemorySyncTable` it constructs itself and does not accept, so
   * there is no way to point it at Dexie, and the rows the pull actually sends
   * are `PanelTaskRow` rather than the `TaskRow` it is typed for. Both are
   * recorded as defects rather than worked around silently.
   *
   * The two rules that must not drift from the server's `taskPredicateFor` are
   * therefore restated: **today includes the overdue ones** (`dueAt` before the
   * *end* of today, not inside today) because a task the member has not dealt
   * with is still theirs to deal with today; and the order is due date, then
   * priority. Nothing here compares instants across a day boundary — `localDay`
   * turns both sides into `YYYY-MM-DD` first, so a 23-hour spring-forward day
   * needs no arithmetic and cannot be got wrong.
   */
  get today(): PanelTaskRow[] {
    const zone = this.timezone;
    if (!zone) return [];
    const today = localDay(new Date(), zone);

    return this.tasks
      .filter(
        (row) =>
          row.deletedAt === null &&
          row.status === 'open' &&
          row.dueAt !== null &&
          localDay(row.dueAt, zone) <= today,
      )
      .sort(
        (left, right) =>
          new Date(left.dueAt ?? 0).getTime() -
            new Date(right.dueAt ?? 0).getTime() ||
          left.priority - right.priority,
      );
  }

  /**
   * The next seven days of meetings, expanded from the rules the panel holds.
   *
   * **The rows are rules, not occurrences** — a repeating meeting is one
   * document with `dtstart`, an RRULE, its skipped dates and its moved ones —
   * so there is nothing to list until they are expanded, and the expansion has
   * to happen here rather than on the server (FR-010: this list is readable
   * with no connection). `expandOccurrences` in the SDK is that, and it is
   * written to agree with the server's expander case for case: a panel showing
   * an occurrence the phone does not is worse than a panel showing none.
   *
   * Cancelled, completed and deleted meetings are left out. That mirrors the
   * aggregate, which produces no occurrences unless it is `scheduled` and
   * live — and it is the same filter the alert saga gets its silence from, so a
   * meeting the member cancelled is neither drawn here nor notified about.
   *
   * Drawn only once the member's own zone is known: without it there is no
   * "next seven days", and guessing at one from the browser is the mistake that
   * shifted every extracted reminder by three hours in v1.
   */
  get nextSevenDays(): AgendaEntry[] {
    const zone = this.timezone;
    if (!zone) return [];

    const from = new Date();
    const to = new Date(from.getTime() + AGENDA_DAYS * 86_400_000);

    return this.meetings
      .filter((row) => row.deletedAt === null && row.status === 'scheduled')
      .flatMap((row) =>
        expandOccurrences(meetingAsRepeating(row), from, to, zone).map(
          (occurrence) => ({ meetingId: row.id, occurrence }),
        ),
      )
      .sort(
        (left, right) =>
          new Date(left.occurrence.startAt).getTime() -
          new Date(right.occurrence.startAt).getTime(),
      );
  }

  t = (key: string, params?: Record<string, string | number>): string =>
    translate(this.locale, key, params);

  /**
   * The side panel is destroyed on close, so every mount starts from the
   * durable copies: locale and tokens from chrome.storage, everything else from
   * Dexie — the last address, the install id, the sync cursor, the last pass's
   * time and the member's zone.
   */
  async hydrate(): Promise<void> {
    if (this.#hydrating) return;
    this.#hydrating = true;

    const [
      locale,
      tokens,
      lastEmail,
      installId,
      cursor,
      lastSyncedAt,
      timezone,
    ] = await Promise.all([
      loadLocale(),
      readTokens(),
      getMeta<string>(LAST_EMAIL_KEY),
      this.installId(),
      getMeta<string>(SYNC_CURSOR_KEY),
      getMeta<string>(SYNC_LAST_AT_KEY),
      getMeta<string>(TIMEZONE_KEY),
    ]);
    applyDirection(locale);
    if (tokens) this.mirror.set(tokens);

    this.sync = new SyncStore(this.client, {
      installId,
      tables: {
        labels: this.labelsTable,
        tasks: this.tasksTable,
        meetings: this.meetingsTable,
        calendar_events: this.eventsTable,
      },
      cursorStorage: dexieCursorStorage(cursor ?? null),
    });
    // The engine writes rows through the tables rather than through this store,
    // so its own progress has to reach the indicator somehow. This is that.
    this.sync.subscribe(() => this.readSyncStatus());

    await this.refresh();

    runInAction(() => {
      this.locale = locale;
      this.email = lastEmail ?? '';
      this.lastSyncedAt = lastSyncedAt ?? null;
      this.timezone = timezone ?? null;
      this.status = tokens ? 'authenticated' : 'idle';
      this.hydrated = true;
    });

    if (tokens) {
      // The zone first, because the list cannot be drawn without it, then the
      // round trip. Both fire and forget: the panel renders from Dexie meanwhile.
      await this.loadTimezone();
      void this.syncNow();
    }
  }

  async setLocale(locale: Locale): Promise<void> {
    applyDirection(locale);
    await saveLocale(locale);
    runInAction(() => {
      this.locale = locale;
    });
  }

  setEmail(email: string): void {
    this.email = email;
  }

  async login(password: string): Promise<void> {
    const email = this.email;
    runInAction(() => {
      this.status = 'pending';
      this.failure = null;
    });

    try {
      const member = await this.auth.login(
        email,
        password,
        await this.deviceDescriptor(),
      );
      // Remembered so a reopened panel does not ask for the address again. The
      // address is not a credential; the password is never stored.
      await setMeta(LAST_EMAIL_KEY, email);
      runInAction(() => {
        this.member = member;
        this.status = 'authenticated';
      });
      await this.loadTimezone();
      void this.syncNow();
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.failure =
          (error as { status?: number }).status === 401
            ? 'invalid_credentials'
            : 'unknown';
      });
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await writeTokens(null);

    // The cursor is forgotten and both tables are dropped, so the next member to
    // sign in on this browser gets a full snapshot of their own rows rather than
    // a delta against somebody else's cursor.
    this.sync?.reset();
    this.profile.clear();
    await Promise.all([
      this.tasksTable.clear(),
      this.labelsTable.clear(),
      this.meetingsTable.clear(),
      this.eventsTable.clear(),
      setMeta(SYNC_LAST_AT_KEY, null),
      setMeta(TIMEZONE_KEY, null),
    ]);
    await this.refresh();

    runInAction(() => {
      this.status = 'idle';
      this.failure = null;
      this.member = null;
      this.meetings = [];
      this.timezone = null;
      this.lastSyncedAt = null;
      this.noticeKey = null;
      this.blockedCount = 0;
    });
  }

  /**
   * Re-reads the drawn tables out of Dexie. Called after every pass and edit.
   *
   * `calendar_events` is deliberately absent: it is registered with the engine
   * so its rows, rejections and purges are handled, and nothing in this panel
   * draws a personal event yet (that is the calendar, which is P9's). Loading
   * it into observable state would be a list to keep in step with no reader to
   * notice when it drifted.
   */
  async refresh(): Promise<void> {
    const [tasks, labels, meetings] = await Promise.all([
      this.tasksTable.all(),
      this.labelsTable.all(),
      this.meetingsTable.all(),
    ]);
    runInAction(() => {
      this.tasks = tasks;
      this.labels = labels;
      this.meetings = meetings;
    });
  }

  /**
   * One round trip: the manual button, the mount, and the worker's nudge all
   * land here.
   *
   * `SyncStore` collapses the overlap itself — a pass on the wire gets at most
   * one queued behind it — so three kicks arriving together cost two passes and
   * never three, and nothing here needs to debounce.
   */
  async syncNow(): Promise<void> {
    if (!this.sync) return;
    try {
      const outcome = await this.sync.sync();
      await setMeta(SYNC_LAST_AT_KEY, outcome.cursor);
      await this.refresh();
      runInAction(() => {
        this.lastSyncedAt = outcome.cursor;
        this.noticeKey = outcome.blocked.length ? 'sync.blocked' : null;
      });
    } catch {
      // A pass that could not reach the server is not an attempt the server
      // judged: the queue is untouched, nothing is counted against the attempt
      // cap, and the next kick tries again.
      runInAction(() => {
        this.noticeKey = 'sync.failed';
      });
    }
  }

  /**
   * Put the refused pushes back in the rotation, at the member's request.
   *
   * The contract's one hard rule about the attempt cap is that it must never
   * discard the edit — the member typed something and would never learn it did
   * not survive — so a blocked push stays queued and this is the way out of it.
   */
  async retryBlocked(): Promise<void> {
    await this.sync?.retryBlocked();
    await this.syncNow();
  }

  /**
   * Quick add: a title, due today, everything else the server's default.
   *
   * The id is minted here and the change goes on the push queue rather than
   * straight to `POST /tasks`, which is the one thing the extension does
   * differently from a page: the queue is in Dexie, so a task typed into a panel
   * that is then closed is still queued when it opens again. A replayed create
   * is answered as the create that already happened, so a retry costs nothing.
   *
   * `dueAt` is *now* rather than a computed local midnight, and that is on
   * purpose: quick add means today, and the present instant is the only one
   * guaranteed to fall inside the member's today whatever their zone. The server
   * resolves an all-day task's day in that zone anyway, so there is no day
   * arithmetic to get wrong on this side.
   */
  async addTask(title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed || !this.sync) return;

    const id = newId();
    const now = new Date().toISOString();
    const data = {
      title: trimmed,
      dueAt: now,
      allDay: true,
      priority: DEFAULT_PRIORITY,
      source: 'extension',
    };

    await this.tasksTable.applyLocal(
      { ...draftTask(id, now), ...data } as PanelTaskRow,
      'create',
    );
    await this.sync.queue('tasks', { op: 'create', id, data, updatedAt: now });
    await this.refresh();
    void this.syncNow();
  }

  /**
   * Quick add: a meeting with a time and somewhere to be.
   *
   * ## Through the route, not the push queue
   *
   * The opposite decision from `addTask`, and for the same reason `setCompleted`
   * takes the route: the server owns two values this panel must not invent.
   * A length nobody typed is the member's `defaults.meetingDurationMin`, and
   * reminders nobody chose are their own advance warnings (FR-001, FR-003) —
   * both an operator knob and a member preference, and **a hard-coded default
   * is a bug**. Pushing the row would mean filling them in here or sending a
   * zero the sync adapter refuses as `invalid`. So `POST /meetings` resolves
   * them, and the created row arrives on the pull that follows.
   *
   * Which is also why nothing is drawn optimistically. The row the member would
   * see for that second is one this panel would have had to make up — its
   * duration, its reminders, the zone it was authored in — and every one of
   * those is a field the server decides. A create that reached the server and a
   * sync that then failed shows up on the next pass; a create that invented its
   * own row would disagree with the server and look right.
   *
   * ## At least one of a link and an address
   *
   * Checked here because the server refuses a meeting with neither, so sending
   * one spends a round trip to be told what the panel already knew — and the
   * refusal would arrive as a notice about "the server", which is not what went
   * wrong. The form disables its own button on the same condition; this is the
   * guard that holds when the form is not the caller.
   *
   * ## The wall clock is the member's
   *
   * `<input type="datetime-local">` hands over digits with no zone, and
   * `new Date(digits)` resolves them against the *browser's* zone. A member
   * whose profile says Cairo, filling this in from a laptop in Berlin, would
   * place the meeting an hour out — silently, and only on the trips where it
   * matters. `wallClockToUtc` resolves it against the profile's zone instead,
   * which is also the zone the server will record as `authoredTimezone`.
   */
  async addMeeting(draft: MeetingDraft): Promise<boolean> {
    const title = draft.title.trim();
    const onlineLink = draft.onlineLink.trim();
    const address = draft.address.trim();
    const zone = this.timezone;

    if (!title || !zone || (!onlineLink && !address)) return false;

    const startAt = wallClockToUtc(draft.startWallClock, zone);
    if (!startAt) return false;

    try {
      await this.meetingsApi.create({
        id: newId(),
        title,
        startAt: startAt.toISOString(),
        // Absent means the member's own default length, resolved server-side.
        durationMin: draft.durationMin > 0 ? draft.durationMin : null,
        location: {
          onlineLink: onlineLink || null,
          address: address || null,
        },
        source: 'extension',
      });
      runInAction(() => {
        this.noticeKey = null;
      });
      await this.syncNow();
      return true;
    } catch {
      runInAction(() => {
        this.noticeKey = 'meetings.failed';
      });
      return false;
    }
  }

  /**
   * Ticked off, or put back — through the REST command, not the push queue.
   *
   * The queue would work for a one-off task: the sync adapter copies a pushed
   * status onto the aggregate without re-running the transition, precisely so a
   * phone that completed offline is not made to advance a recurrence twice. But
   * the client is then the authority on where a repeating series went, and this
   * one has no RRULE parser and should not grow one — the server renders
   * `recurrenceText` for three surfaces for exactly that reason. So both
   * directions go through the route, which answers with
   * `recurrenceAdvancedTo` and settles it.
   *
   * The cost is that complete needs a connection. That is the right trade for a
   * browser panel; the phone is the offline surface, and the failure here is a
   * visible notice rather than a row that silently disagrees with the server.
   *
   * A task whose create is still queued is skipped: the server has never heard
   * of it, so the route would answer 404 and the member would see a failure for
   * something that is merely not sent yet.
   */
  async setCompleted(id: string, completed: boolean): Promise<void> {
    const row = await db.tasks.get(id);
    if (!row || row.pendingOp === 'create') return;

    try {
      const path = `/tasks/${encodeURIComponent(id)}/${completed ? 'complete' : 'reopen'}`;
      const ack = await this.client.rest<CompleteTaskAck | TaskAck>(
        'POST',
        path,
        {},
      );
      const advanced = (ack as CompleteTaskAck).recurrenceAdvancedTo ?? null;

      // The server's `updatedAt` *is* its row version, so stamping it through
      // `applyServerRows` — the one writer of `baseUpdatedAt` — is right here
      // where it would be wrong for a local edit. A series that advanced is
      // still open, at its new moment.
      await this.tasksTable.applyServerRows([
        completed && !advanced
          ? {
              ...row,
              status: 'completed',
              completedAt: ack.updatedAt,
              updatedAt: ack.updatedAt,
            }
          : {
              ...row,
              status: 'open',
              completedAt: null,
              dueAt: advanced ?? row.dueAt,
              updatedAt: ack.updatedAt,
            },
      ]);
      runInAction(() => {
        this.noticeKey = null;
      });
    } catch {
      runInAction(() => {
        this.noticeKey = 'tasks.failed';
      });
    }

    await this.refresh();
  }

  /**
   * The member's zone, refreshed from the profile and cached.
   *
   * Failing quietly is deliberate: with no connection the cached zone stands,
   * which keeps "today" the member's day. The one thing this must never do is
   * fall back to `Intl.DateTimeFormat().resolvedOptions().timeZone` — the list
   * would then be right in the member's own city and wrong everywhere else they
   * open a browser.
   */
  private async loadTimezone(): Promise<void> {
    const loaded = await this.profile
      .load()
      .then(() => true)
      .catch(() => false);
    if (!loaded) return;

    const timezone = this.profile.profile?.timezone;
    if (!timezone) return;

    await setMeta(TIMEZONE_KEY, timezone);
    runInAction(() => {
      this.timezone = timezone;
    });
  }

  private readSyncStatus(): void {
    const sync = this.sync;
    if (!sync) return;
    runInAction(() => {
      this.syncing = sync.syncing;
      this.blockedCount = sync.blocked.length;
    });
  }

  /**
   * How this installation identifies itself.
   *
   * A per-install id minted once and kept in Dexie, beside the last address —
   * the same durable store, so one place to look. It must survive the panel
   * closing: a fresh id on every sign-in would give the member a new device row
   * each time, and then one notification per row.
   *
   * `/sync` is handed this same id, and it has to be the same one: the handler
   * stamps `devices.lastSeenAt` by install id — which is what lets the alert
   * sweep skip a device that already holds its own alarms — and logs a warning
   * for an install it does not recognise. Two ids would mean a device that
   * never appears to have synced.
   */
  private async installId(): Promise<string> {
    const existing = await getMeta<string>(INSTALL_ID_KEY);
    if (existing) return existing;

    const minted = crypto.randomUUID();
    await setMeta(INSTALL_ID_KEY, minted);
    return minted;
  }

  /**
   * `chrome_extension` is a device kind of its own precisely because FCM does
   * not work here. The server needs to know not to try — a nudge reaches this
   * surface over the socket or on open, and never as a push.
   */
  private async deviceDescriptor(): Promise<{
    installId: string;
    kind: 'chrome_extension';
    name: string;
  }> {
    return {
      installId: await this.installId(),
      kind: 'chrome_extension',
      name: 'Browser extension',
    };
  }
}

/**
 * The optimistic row a quick add renders before any server has seen it.
 *
 * The same defaults the server applies (`priority: 4`, all-day, `open`), so the
 * row the member sees for the second before the pull replaces it is the row
 * they will keep. `baseUpdatedAt` is null because the server has never sent a
 * version of this task, which is exactly what the push must claim.
 */
function draftTask(id: string, now: string): PanelTaskRow {
  return {
    id,
    title: '',
    notes: null,
    dueAt: null,
    allDay: true,
    priority: DEFAULT_PRIORITY,
    labelId: null,
    label: null,
    status: 'open',
    completedAt: null,
    // A quick add never repeats: the panel has no recurrence editor, and it
    // deliberately has no RRULE parser either — a repeating task is created on
    // the phone or in the chat.
    recurrence: null,
    estimatedMinutes: null,
    deferredFrom: null,
    deferCount: 0,
    source: 'extension',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    baseUpdatedAt: null,
  };
}
