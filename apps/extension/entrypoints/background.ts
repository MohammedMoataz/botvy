import { io, type Socket } from 'socket.io-client';
import { GATEWAY_URL, readTokens } from '../lib/config';

const HEARTBEAT_ALARM = 'botvy-heartbeat';

// The service worker is evicted when idle; the alarm is what wakes it, and the
// socket is re-established from the token in chrome.storage rather than kept.
let socket: Socket | null = null;

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel. Older Chrome rejects here.
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);

  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) void ensureSocket();
  });

  void ensureSocket();
});

/**
 * Socket connect stub. P0 has no sign-in, so there is no token and this returns
 * without touching the network — the handshake shape is here so P1 only has to
 * add the events. The gateway authenticates in the handshake (`auth.token`);
 * a service token is refused on /ws.
 */
async function ensureSocket(): Promise<void> {
  if (socket?.connected) return;

  const tokens = await readTokens();
  if (!tokens) return;

  if (!socket) {
    socket = io(GATEWAY_URL, {
      path: '/ws',
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: tokens.accessToken },
    });
    // An access token expires mid-connection: reconnect with a fresh one, never
    // hold a dead socket.
    socket.on('token_expired', () => {
      socket?.disconnect();
      socket = null;
    });
  } else {
    socket.auth = { token: tokens.accessToken };
  }

  socket.connect();
}
