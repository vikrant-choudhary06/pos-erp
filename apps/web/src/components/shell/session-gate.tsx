'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { isUnauthorized, SessionProvider, useMeQuery } from '@/lib/session';

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

  useEffect(() => {
    if (isUnauthorized(error)) router.replace(signInPath);
  }, [error, router, signInPath]);

  if (!me) {
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
