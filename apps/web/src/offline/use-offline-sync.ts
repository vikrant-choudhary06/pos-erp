'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { PosMenu } from '@/lib/pos-types';
import { isLocalMode, setOfflineState, useOfflineState } from './state';
import { flush, refreshCounts } from './sync';
import { refreshTill } from './till';

/**
 * Keeps the till's offline machinery running while the POS is open: watches
 * the connection, sends queued work when it comes back, and refreshes the
 * screens when the till switches between its own copy and the server's.
 */
export function useOfflineSync(menu: PosMenu | undefined) {
  const queryClient = useQueryClient();
  const state = useOfflineState();
  const local = isLocalMode(state);
  const wasLocal = useRef(local);

  useEffect(() => {
    void refreshCounts();
  }, []);

  // remember which till this is and its last numbers, while we can still ask
  useEffect(() => {
    if (menu && state.online) {
      refreshTill(menu.outlet).catch(() => {});
    }
  }, [menu, state.online]);

  useEffect(() => {
    const goOnline = () => {
      setOfflineState({ online: true });
      void flush(queryClient);
    };
    const goOffline = () => setOfflineState({ online: false });
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (!navigator.onLine) goOffline();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [queryClient]);

  // while offline, check every few seconds whether the server is back
  useEffect(() => {
    if (state.online) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          setOfflineState({ online: true });
          void flush(queryClient);
        }
      } catch {
        // still offline
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [state.online, queryClient]);

  // retry anything still queued, e.g. after a server error
  useEffect(() => {
    if (!state.online || !state.pending) return;
    void flush(queryClient);
    const timer = setInterval(() => void flush(queryClient), 15_000);
    return () => clearInterval(timer);
  }, [state.online, state.pending, queryClient]);

  // switching between local and server copies: everything on screen is stale
  useEffect(() => {
    if (wasLocal.current === local) return;
    wasLocal.current = local;
    queryClient.invalidateQueries({ queryKey: ['orders-active'] });
    queryClient.invalidateQueries({ queryKey: ['order'] });
  }, [local, queryClient]);
}
