const KEY = 'pos.pendingLogout';
let pending = false;
let running: Promise<boolean> | undefined;

export function deferLogout() {
  pending = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
}

/** Clear the old HttpOnly cookie on reconnection, before any fresh login. */
export function retryLogout(): Promise<boolean> {
  let needed = pending;
  try {
    needed ||= localStorage.getItem(KEY) === '1';
  } catch {}
  if (!needed) return Promise.resolve(true);
  if (running) return running;
  running = (async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok && response.status !== 401) return false;
      pending = false;
      try {
        localStorage.removeItem(KEY);
      } catch {}
      return true;
    } catch {
      return false;
    } finally {
      running = undefined;
    }
  })();
  return running;
}
