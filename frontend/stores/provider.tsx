'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { enableStaticRendering } from 'mobx-react-lite';
import { PrimeReactProvider } from 'primereact/api';
import { RootStore } from './root';

// Server components render once and are never re-rendered, so MobX must not try
// to track them; without this the server leaks observers between requests.
enableStaticRendering(typeof window === 'undefined');

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // A fresh root store per request (server) / per mount (client) — never a module singleton.
  const [store] = useState(() => new RootStore());
  return (
    <StoreContext.Provider value={store}>
      <PrimeReactProvider value={{ ripple: true }}>
        {children}
      </PrimeReactProvider>
    </StoreContext.Provider>
  );
}

export function useStores(): RootStore {
  const store = useContext(StoreContext);
  if (!store)
    throw new Error('useStores() must be called inside <StoreProvider>');
  return store;
}
