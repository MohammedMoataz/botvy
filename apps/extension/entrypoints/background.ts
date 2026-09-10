import { io, type Socket } from 'socket.io-client';
import { GATEWAY_URL, SYNC_NUDGE_MESSAGE, readTokens } from '../lib/config';

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
 * The socket, established from whatever token is in chrome.storage.
 *
 * Signed out there is no token and this returns without touching the network.
 * The gateway authenticates in the handshake (`auth.token`); a service token is
 * refused on /ws.
 *
 * This worker deliberately does **not** refresh a token. The panel's
 * `TokenStore` is the one refresher on this installation, and a second one
 * racing it over the same `chrome.storage` key is a second chance to spend the
 * same refresh token twice — which the API reads as a stolen token and answers
 * by revoking the whole family. So an expired token drops the socket and the
 * minute alarm re-reads storage; whenever the panel next refreshes, the
 * following tick reconnects with the fresh value.
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

    // Something changed on another device. Registered on the socket instance
    // rather than per connect, so it survives Socket.IO's own reconnects.
    //
    // The worker does not sync — the panel does, because it holds the one token
    // refresher — so all this does is wake it. `sendMessage` rejects when
    // nothing is listening, which is the ordinary case: the panel is closed
    // most of the time. That is not a failure and nothing is lost by it, since
    // every mount syncs and a nudge only ever costs a delay. Swallowed, then,
    // rather than logged on every tick.
    socket.on('sync.nudge', () => {
      void chrome.runtime.sendMessage({ type: SYNC_NUDGE_MESSAGE }).catch(() => undefined);
    });
  } else {
    socket.auth = { token: tokens.accessToken };
  }

  socket.connect();
}
