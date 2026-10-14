'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
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
  const { data: me, error, refetch, isFetching } = useMeQuery();
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
          <div role="alert" className="max-w-md space-y-4 px-6 text-center text-sm">
            <p>
              {error instanceof Error
                ? error.message
                : 'Could not load your account. Check your connection.'}
            </p>
            <Button loading={isFetching} onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  return <SessionProvider me={me}>{children}</SessionProvider>;
}
