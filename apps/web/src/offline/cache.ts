import { api, isOffline } from '@/lib/api';
import { db } from './db';
import { getOfflineState } from './state';

/**
 * GET that remembers its last answer, so screens still have something to
 * show when the till loses its connection.
 */
export async function cachedApi<T>(key: string, path: string): Promise<T> {
  try {
    const value = await api<T>(path);
    db()
      .cache.put({ key, value, savedAt: Date.now() })
      .catch(() => {});
    return value;
  } catch (err) {
    if (isOffline(err)) {
      const hit = await db().cache.get(key);
      if (hit) return hit.value as T;
    }
    throw err;
  }
}

/**
 * On sign out: drop cached screens, but never the queue of unsynced work.
 * Skipped while offline, the till would have nothing left to open with.
 */
export async function forgetSession() {
  if (!getOfflineState().online) return;
  await db()
    .cache.clear()
    .catch(() => {});
}

export async function readCache<T>(key: string) {
  return (await db().cache.get(key))?.value as T | undefined;
}
