import { api, ApiError, isOffline } from '@/lib/api';
import { db } from './db';
import { lockSession, sessionLocked, sessionVersion } from './session-lock';
import type { Me } from '@/lib/types';

/**
 * GET that remembers its last answer, so screens still have something to
 * show when the till loses its connection.
 */
export async function cachedApi<T>(key: string, path: string): Promise<T> {
  if (sessionLocked()) throw new ApiError('Please sign in again', 401);
  const version = sessionVersion();
  try {
    const value = await api<T>(path);
    if (sessionLocked() || version !== sessionVersion())
      throw new ApiError('Please sign in again', 401);
    if (key === 'me') {
      const old = (await db().cache.get('me'))?.value as Me | undefined;
      const me = value as Me;
      if (old && (old.user.id !== me.user.id || old.business.id !== me.business.id))
        await db().cache.clear();
    }
    await db().cache.put({ key, value, savedAt: Date.now() });
    if (sessionLocked() || version !== sessionVersion()) {
      await db().cache.clear();
      throw new ApiError('Please sign in again', 401);
    }
    return value;
  } catch (err) {
    if (isOffline(err)) {
      await offlineIdentity();
      const hit = await db().cache.get(key);
      if (hit) return hit.value as T;
    }
    throw err;
  }
}

/**
 * On sign out: drop cached screens, but never the queue of unsynced work.
 * Local access ends immediately, even when the server cannot be reached.
 */
export async function forgetSession() {
  lockSession();
  await db()
    .cache.clear()
    .catch(() => {});
}

export async function offlineIdentity(): Promise<Me> {
  const me = (await db().cache.get('me'))?.value as Me | undefined;
  if (sessionLocked() || !me || !(Date.parse(me.offlineExpiresAt) > Date.now())) {
    lockSession();
    await db().cache.clear();
    throw new ApiError('Please sign in again', 401);
  }
  return me;
}

export async function authorizeOfflineOutlet(outletId: string) {
  const me = await offlineIdentity();
  if (!me.outlets.some((outlet) => outlet.id === outletId))
    throw new ApiError('Outlet not found', 404);
  return me;
}

export async function readCache<T>(key: string) {
  return (await db().cache.get(key))?.value as T | undefined;
}
