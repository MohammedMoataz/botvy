'use client';

import { useEffect, type ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Message } from 'primereact/message';
import { useStores } from '../../stores/provider';

/**
 * Keeps a page for signed-in administrators.
 *
 * A client-side gate, and honest about what that means: it hides a page, it
 * does not protect data. Every admin endpoint carries `@Roles('admin')`, so a
 * member who reaches this markup by hand still gets a 403 from the API — which
 * is where the actual authorisation lives, and has to be, because the browser
 * is not a place you can enforce anything.
 *
 * The redirect runs in an effect rather than during render: navigating while
 * rendering is what produces React's "cannot update during render" warning, and
 * in a Next app router it can leave the route half-committed.
 */
export const RequireAdmin = observer(function RequireAdmin({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations('admin');
  const { auth, socket } = useStores();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isAuthenticated) router.replace('/login');
  }, [auth.isAuthenticated, router]);

  /*
   * One socket for the portal, opened here because this is the one component
   * every administrative page goes through — the layout above is a server
   * component and cannot hold a connection.
   *
   * What it is for is `ops.heartbeat`: the backend emits one to the `ops` room
   * every time a scheduled job stamps, and an administrator's socket joins that
   * room on connect. Without this the emit had no listener anywhere, which is
   * the same dead half of a contract as a handler with no producer.
   *
   * Tied to the *session* and not to this component. Every admin page mounts
   * this, so a cleanup that disconnected would open and close a socket on every
   * navigation; and `SocketClient.connect()` builds a new socket each call
   * rather than no-opping on a live one, so the state is checked first — the
   * same guard the extension's `ensureSocket` makes. Signing out drops
   * `isAuthenticated`, which is what closes it: a socket outliving its token
   * would be a live connection on a credential the member revoked.
   */
  useEffect(() => {
    if (!auth.isAuthenticated) {
      socket.disconnect();
      return;
    }
    if (socket.state === 'connected' || socket.state === 'connecting') return;
    socket.connect();
  }, [auth.isAuthenticated, socket]);

  if (!auth.isAuthenticated) {
    // Not the children, and not a spinner either: a flash of admin chrome
    // before the redirect looks like the page loaded and then took it away.
    return null;
  }

  // Signed in but not an administrator. Told plainly rather than redirected —
  // bouncing someone back to a login form they just used correctly is how a
  // portal appears to be broken.
  if (auth.member && !auth.isAdmin) {
    return (
      <main className="shell">
        <Message severity="warn" text={t('notAdmin')} />
      </main>
    );
  }

  return <>{children}</>;
});
