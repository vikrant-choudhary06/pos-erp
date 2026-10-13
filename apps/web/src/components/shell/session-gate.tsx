'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { isUnauthorized, SessionProvider, useMeQuery } from '@/lib/session';
import { sessionLocked } from '@/offline/session-lock';

/** Loads the signed-in user, or sends them to `signInPath`. */
export function SessionGate({
  children,
  signInPath = '/login',
}: {
  children: React.ReactNode;
  signInPath?: string;
}) {
  const router = useRouter();
  const { data: me, error } = useMeQuery();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const check = () =>
      setBlocked(sessionLocked() || (!!me && !(Date.parse(me.offlineExpiresAt) > Date.now())));
    check();
    const timer = setInterval(check, 1000);
    window.addEventListener('storage', check);
    window.addEventListener('pos-session-change', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', check);
      window.removeEventListener('pos-session-change', check);
    };
  }, [me]);

  useEffect(() => {
    if (blocked || isUnauthorized(error)) router.replace(signInPath);
  }, [blocked, error, router, signInPath]);

  if (!me || blocked || isUnauthorized(error)) {
    return (
      <div className="grid min-h-dvh place-items-center text-ink-faint">
        {error && !isUnauthorized(error) ? (
          <p className="text-sm">Could not load your account. Check your connection and refresh.</p>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  return <SessionProvider me={me}>{children}</SessionProvider>;
}
