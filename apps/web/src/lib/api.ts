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
  let data: any;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 60_000);
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await res.text();
    try {
      data = raw ? JSON.parse(raw) : undefined;
    } catch {
      if (res.ok)
        throw new ApiError('The server returned an invalid response. Please try again.', 502);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    setOfflineState({ online: false });
    throw new ApiError(
      controller.signal.aborted
        ? 'The server is taking too long. It may be starting up; please try again.'
        : 'No internet connection',
      0,
    );
  } finally {
    clearTimeout(deadline);
  }

  if (UNREACHABLE.has(res.status)) {
    setOfflineState({ online: false });
    throw new ApiError('The server is not reachable', 0);
  }
  setOfflineState({ online: true });
  if (version !== sessionVersion()) throw new ApiError('Session changed; please try again', 401);

  if (!res.ok) {
    if (res.status === 401 && !authenticating) lockSession();
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
  return data as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong';
