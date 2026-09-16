import type { ReactNode } from 'react';
import { AdminChrome } from '../../components/admin-chrome';

/**
 * The portal chrome lives in `AdminChrome`, which is a client component for one
 * reason: marking the current link needs the path. Everything else about this
 * layout is still static markup that arrives with the first paint.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
