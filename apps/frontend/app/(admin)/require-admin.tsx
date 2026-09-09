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
  const { auth } = useStores();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isAuthenticated) router.replace('/login');
  }, [auth.isAuthenticated, router]);

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
