import { setOfflineState } from '@/offline/state';
import { lockSession, sessionLocked, unlockSession, sessionVersion } from '@/offline/session-lock';
import { db } from '@/offline/db';
import { deferLogout, retryLogout } from '@/offline/logout';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Couldn't reach the server at all. status 0 so callers can tell it apart. */
export const isOffline = (err: unknown) => err instanceof ApiError && err.status === 0;

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
};

// a proxy answering for a server that is down
const UNREACHABLE = new Set([502, 503, 504]);

export async function api<T = unknown>(path: string, { method = 'GET', body }: Options = {}) {
  const authenticating =
    method === 'POST' &&
    ['/auth/pin', '/auth/staff-login', '/auth/code/verify', '/onboarding'].includes(path);
  if (path === '/auth/logout') {
    deferLogout();
    lockSession();
    if (!(await retryLogout()))
      throw new ApiError('Signed out locally; server sign-out is pending', 0);
    return undefined as T;
  }
  if (authenticating && !(await retryLogout())) throw new ApiError('No internet connection', 0);
  if (
    sessionLocked() &&
    !path.startsWith('/auth/') &&
    !['/onboarding', '/devices/current', '/health'].includes(path)
  ) {
    throw new ApiError('Please sign in again', 401);
  }
  if (path === '/auth/me' && sessionLocked()) throw new ApiError('Please sign in again', 401);
  const version = sessionVersion();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    setOfflineState({ online: false });
    throw new ApiError('No internet connection', 0);
  }

  if (UNREACHABLE.has(res.status)) {
    setOfflineState({ online: false });
    throw new ApiError('The server is not reachable', 0);
  }
  setOfflineState({ online: true });
  if (version !== sessionVersion()) throw new ApiError('Session changed; please try again', 401);

  if (!res.ok) {
    if (res.status === 401 && !authenticating) lockSession();
    const data = await res.json().catch(() => null);
    // class-validator sends an array of messages, show the first one
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new ApiError(message ?? 'Something went wrong', res.status);
  }

  if (authenticating) {
    await db().cache.clear();
    if (version !== sessionVersion()) throw new ApiError('Session changed; please try again', 401);
    unlockSession();
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong';
