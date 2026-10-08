'use client';

import { useSyncExternalStore } from 'react';

// Connection + sync status shared by the whole till. Kept outside React so the
// API client and the sync loop can update it too.

export type OfflineState = {
  online: boolean;
  /** requests waiting in the outbox */
  pending: number;
  /** requests the server refused; need a person to look at them */
  failed: number;
  syncing: boolean;
};

let state: OfflineState = { online: true, pending: 0, failed: 0, syncing: false };
const listeners = new Set<() => void>();

export function getOfflineState() {
  return state;
}

export function setOfflineState(patch: Partial<OfflineState>) {
  const next = { ...state, ...patch };
  if (
    Object.keys(patch).every(
      (k) => next[k as keyof OfflineState] === state[k as keyof OfflineState],
    )
  )
    return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverState: OfflineState = { online: true, pending: 0, failed: 0, syncing: false };

export function useOfflineState() {
  return useSyncExternalStore(subscribe, getOfflineState, () => serverState);
}

/**
 * Local mode: the till works from its own copy of orders. On while there is
 * no connection, and until everything done offline has reached the server.
 */
export const isLocalMode = (s: OfflineState = state) => !s.online || s.pending > 0;
