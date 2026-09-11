import { io } from 'socket.io-client';
import {
  BotvyClient,
  SocketClient,
  TokenStore,
  newId,
  type PendingAlert,
  type SocketLike,
  type TokenPair,
} from '@botvy/sdk';
import { MESSAGES, SYNC_ENTITIES } from '../lib/config';
import {
  captureTitle,
  flushCaptures,
  queueCapture,
  type CaptureKind,
} from '../lib/capture';
import {
  readGateway,
  readTokens,
  refreshUnderLock,
  writeTokens,
} from '../lib/session';

const HEARTBEAT_ALARM = 'botvy-heartbeat';

/**
 * Half a minute of slack on the access token's fifteen-minute life.
 *
 * A worker that wakes, checks a token that expires in ten seconds, finds it
 * valid and then spends four seconds connecting has connected with a dead
 * credential. Treating the last half-minute as already gone costs one refresh
 * an hour and removes a whole class of "it works except sometimes".
 */
const EXPIRY_SLACK_MS = 30_000;

/**
 * The background half of the desk companion (T920, T940, T941).
 *
 * ## Three paths to being up to date, because the worker is not permanent
 *
 * MV3 evicts an idle service worker, so anything that depends on this file
 * staying alive is a feature that silently stops. There are three ways the
 * panel catches up and none of them is load-bearing on its own:
 *
 * - the **socket**, while the worker happens to be awake, which is what makes a
 *   change on the phone show up in seconds;
 * - the **alarm**, once a minute, which is what wakes the worker at all;
 * - **opening the panel**, which syncs on mount.
 *
 * The redundancy is the design and is recorded as such in `plan.md`'s
 * complexity table: relying on the socket alone means a panel quietly hours out
 * of date, and a browser that notices a worker spinning throttles the whole
 * extension.
 *
 * ## What this file does *not* do
 *
 * It does not draw anything and it does not own the member's session. What it
 * owns is the socket, the alarm, the context menus, the keyboard command and
 * the notifications — and one `SyncStore` of its own, which is safe now that
 * `refreshUnderLock` puts both contexts behind one lock.
 */
export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel. Older Chrome rejects here.
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);

  chrome.runtime.onInstalled.addListener(() => {
    installMenus();
  });
  // `onInstalled` fires once per install or update; a worker woken later has
  // menus already and this is a no-op. Called on startup too, because an
  // extension enabled after a browser restart gets neither event reliably.
  installMenus();

  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) void onAlarm();
  });

  chrome.contextMenus?.onClicked.addListener((info, tab) => {
    void onCapture(info, tab);
  });

  chrome.commands?.onCommand.addListener((command) => {
    if (command === 'quick-capture') void onQuickCapture();
  });

  chrome.runtime.onMessage.addListener((message: { type?: string }) => {
    // The panel opened, or asked for a pass. Answering with `false` — no
    // response — is deliberate: the panel runs its own sync and does not wait
    // on this one.
    if (message?.type === MESSAGES.syncNow) void syncNow();
    return false;
  });

  void onAlarm();
});

// ---------------------------------------------------------------- the session

let cachedClient: { gateway: string; client: BotvyClient; tokens: TokenStore } | null =
  null;

/**
 * A client for this worker, rebuilt when the member points at another Botvy.
 *
 * The token store is a synchronous mirror over `chrome.storage`, the same shape
 * the panel keeps and for the same reason: the SDK reads tokens synchronously
 * and `chrome.storage` is asynchronous.
 */
async function clientFor(): Promise<{
  client: BotvyClient;
  tokens: TokenStore;
} | null> {
  const stored = await readTokens();
  if (!stored) return null;

  const gateway = await readGateway();
  if (cachedClient?.gateway === gateway) {
    cachedClient.tokens.set(stored);
    return cachedClient;
  }

  let held: TokenPair | null = stored;
  const tokens: TokenStore = new TokenStore(
    {
      read: () => held,
      write: (pair) => {
        held = pair;
        void writeTokens(pair);
      },
    },
    (refreshToken) =>
      refreshUnderLock(
        (current) => refreshThrough(client, current),
        { accessToken: held?.accessToken ?? '', refreshToken },
      ),
  );
  const client = new BotvyClient({ baseUrl: gateway, tokens });

  cachedClient = { gateway, client, tokens };
  return cachedClient;
}

/**
 * The exchange itself, which is a plain REST call and not the SDK's auth store.
 *
 * `AuthStore` carries observable session state the worker has no use for, and
 * constructing one here would give this context a second thing that thinks it
 * knows whether the member is signed in. The rotation rule lives in
 * `refreshUnderLock`; this is only the request.
 */
async function refreshThrough(
  client: BotvyClient,
  refreshToken: string,
): Promise<TokenPair | null> {
  try {
    return await client.rest<TokenPair>('POST', '/auth/refresh', {
      refreshToken,
    });
  } catch {
    return null;
  }
}

/** Whether the access token is gone, or close enough to be treated as gone. */
function expiringSoon(accessToken: string | null): boolean {
  if (!accessToken) return true;
  const [, payload] = accessToken.split('.');
  if (!payload) return true;
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const expiresAt = Number(decoded.exp) * 1000;
    return !Number.isFinite(expiresAt) || expiresAt - Date.now() < EXPIRY_SLACK_MS;
  } catch {
    // An unreadable token is one this worker cannot reason about, so it is
    // refreshed rather than used. The cost is one request; the alternative is a
    // socket that connects with a credential the server will refuse.
    return true;
  }
}

// ----------------------------------------------------------------- the socket

let socket: SocketClient | null = null;
let lastSyncAt = 0;

/** Older than this and the worker syncs on its own, without a nudge. */
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * One minute's worth of keeping up (T920).
 *
 * The order is the point: **refresh, then connect, then sync**. A worker that
 * connects first discovers the expiry as a refused handshake, and one that
 * syncs first discovers it as a 401 halfway through a push — which is a push
 * the server has not judged being counted as an attempt against it.
 */
async function onAlarm(): Promise<void> {
  const session = await clientFor();
  if (!session) {
    socket?.disconnect();
    socket = null;
    return;
  }

  if (expiringSoon(session.tokens.accessToken)) await session.tokens.refresh();

  ensureSocket(session.tokens);
  if (Date.now() - lastSyncAt > STALE_AFTER_MS) await syncNow();
}

function ensureSocket(tokens: TokenStore): void {
  if (socket) {
    // `connect()` on a live client is a no-op inside the SDK; on a dropped one
    // it reconnects with whatever token is current. The backoff is the SDK's
    // and is read here rather than reimplemented: an alarm that reconnected
    // every minute regardless would be the spin the ceiling exists to prevent.
    if (socket.state === 'connected' || socket.state === 'connecting') return;
    socket.connect();
    return;
  }

  socket = new SocketClient({
    tokens,
    baseUrl: cachedClient?.gateway ?? '',
    entities: [...SYNC_ENTITIES],
    connect: (url, auth) =>
      io(url.replace(/\/ws$/, ''), {
        path: '/ws',
        transports: ['websocket'],
        autoConnect: false,
        auth,
      }) as unknown as SocketLike,
    onNudge: () => {
      void syncNow();
    },
  });

  // An alert the server has just sent (FR-015). The phone arms its own alarms
  // from `pendingAlerts`; this surface cannot — a browser has no scheduler that
  // survives the worker — so what it does instead is show the one that has
  // *already fired*, so a member at their desk is not told only on their phone.
  socket.on('alert.fired', (payload) => {
    void notify(payload as Partial<PendingAlert>);
  });

  socket.connect();
}

// ------------------------------------------------------------------- the sync

/**
 * A pass, from the worker.
 *
 * The panel runs its own — it is the surface that has to redraw — and both are
 * safe together because `/sync` is idempotent by design: a push the other
 * context already sent comes back in `accepted` and is cleared from the queue,
 * and the cursor only ever moves forward. What the worker buys is a queue that
 * flushes while the panel is shut, which is most of the day.
 */
async function syncNow(): Promise<void> {
  const session = await clientFor();
  if (!session) return;

  try {
    const { SyncStore } = await import('@botvy/sdk');
    const { workerTables, workerCursor, installId } = await import('../lib/worker-sync');

    const engine = new SyncStore(session.client, {
      installId: await installId(),
      tables: workerTables(),
      cursorStorage: await workerCursor(),
    });
    await engine.sync();
    // The capture outbox rides the same pass: a reminder or a saved link
    // captured on a train is sent by whichever context next gets a connection,
    // and its own id is the idempotency key, so a retry creates nothing twice.
    await flushCaptures(session.client).catch(() => 0);
    lastSyncAt = Date.now();

    // Tell the panel if it is open. `sendMessage` rejects when nothing is
    // listening, which is the ordinary case — the panel is closed most of the
    // time — and that is not a failure worth logging on every tick.
    void chrome.runtime
      .sendMessage({ type: MESSAGES.nudge })
      .catch(() => undefined);
  } catch {
    // Unreachable, refused, or a token that could not be refreshed. The queue
    // is untouched and the next alarm tries again; the panel's status strip is
    // what tells the member, from its own pass.
  }
}

// ---------------------------------------------------------------- the capture

const MENU = {
  selectionTask: 'botvy-selection-task',
  selectionReminder: 'botvy-selection-reminder',
  pageTask: 'botvy-page-task',
  pageLink: 'botvy-page-link',
} as const;

/**
 * Four entries, and they are the four things a member reads a page and wants
 * (FR-003).
 *
 * A selection becomes a task or a reminder; a page becomes a task or a saved
 * link. The page's address goes into the item's notes in every case — it is the
 * one field all four targets already have, and without it a captured task is a
 * sentence with no way back to what it was about.
 */
function installMenus(): void {
  chrome.contextMenus?.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.selectionTask,
      title: 'Botvy: add as task',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU.selectionReminder,
      title: 'Botvy: add as reminder',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU.pageTask,
      title: 'Botvy: add this page as a task',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: MENU.pageLink,
      title: 'Botvy: save this link to read',
      contexts: ['page'],
    });
  });
}

async function onCapture(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  const kind: CaptureKind | null =
    info.menuItemId === MENU.selectionTask || info.menuItemId === MENU.pageTask
      ? 'task'
      : info.menuItemId === MENU.selectionReminder
        ? 'reminder'
        : info.menuItemId === MENU.pageLink
          ? 'link'
          : null;
  if (!kind) return;

  const source = info.selectionText?.trim() || tab?.title?.trim() || '';
  const url = info.pageUrl ?? tab?.url ?? '';

  await queueCapture({ kind, text: source, url, id: newId() });

  /*
   * Sent immediately, and queued first so that "immediately" is best-effort
   * rather than load-bearing.
   *
   * A capture has to survive a browser with no network (FR-005), so it lands in
   * Dexie before anything is attempted — and the flush is then the same code
   * the next alarm runs. Nothing is probed for first: Knowledge shipped in P7,
   * three phases before this one, into the same single deployment the member
   * runs, so there is nothing to discover at runtime.
   */
  const session = await clientFor();
  if (session) await flushCaptures(session.client).catch(() => 0);

  void chrome.runtime
    .sendMessage({ type: MESSAGES.captured })
    .catch(() => undefined);
  void syncNow();
}

/**
 * The keyboard shortcut: open the panel with the selection already in the form.
 *
 * The panel is opened first and the message sent after, because a message to a
 * panel that is not there is dropped — and the member pressed a key expecting a
 * form, not a queued row they have to go and find.
 */
async function onQuickCapture(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  /*
   * The page's title, not its selection — and that is a permissions decision.
   *
   * Reading the selection from a keyboard shortcut needs `scripting` and a host
   * permission for every page the member might press it on, which is exactly
   * the "requests the whole web" manifest that fails store review (FR-011). The
   * context menu already carries `selectionText` with no such permission, so
   * the selection path is the menu and the shortcut is the quick way to open
   * the form with the page in it.
   */
  const title = captureTitle(tab.title ?? '');

  if (tab.windowId !== undefined) {
    await chrome.sidePanel?.open({ windowId: tab.windowId }).catch(() => undefined);
  }

  // A short delay, because the panel has to mount before it can listen. One
  // retry rather than a loop: if it is not up by then the member is looking at
  // an empty Add form, which is recoverable, and a retry loop against a panel
  // that failed to open is not.
  setTimeout(() => {
    void chrome.runtime
      .sendMessage({ type: MESSAGES.compose, title, url: tab.url })
      .catch(() => undefined);
  }, 400);
}

// --------------------------------------------------------------- the notices

async function notify(alert: Partial<PendingAlert>): Promise<void> {
  if (!chrome.notifications) return;
  await chrome.notifications
    .create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title: alert.title ?? 'Botvy',
      message: alert.body ?? '',
    })
    .catch(() => undefined);
}
