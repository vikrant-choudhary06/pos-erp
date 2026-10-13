'use client';

import type { Permission } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import { cachedApi } from '@/offline/cache';
import { ApiError } from './api';
import type { Me } from './types';

const OUTLET_KEY = 'pos.outlet';

type Session = {
  me: Me;
  outletId: string;
  setOutletId: (id: string) => void;
  can: (permission: Permission) => boolean;
};

const SessionContext = createContext<Session | null>(null);

export function useMeQuery() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => cachedApi<Me>('me', '/auth/me'),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function SessionProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  const [outletId, setOutletIdState] = useState(me.outlets[0]?.id ?? '');

  // restore the last outlet the user picked on this device
  useEffect(() => {
    try {
      const saved = localStorage.getItem(OUTLET_KEY);
      if (saved && me.outlets.some((o) => o.id === saved)) setOutletIdState(saved);
    } catch {}
  }, [me.outlets]);

  const setOutletId = (id: string) => {
    setOutletIdState(id);
    try {
      localStorage.setItem(OUTLET_KEY, id);
    } catch {}
  };

  const can = (permission: Permission) => me.user.isOwner || me.permissions.includes(permission);

  return (
    <SessionContext.Provider value={{ me, outletId, setOutletId, can }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside the dashboard');
  return ctx;
}

export const isUnauthorized = (err: unknown) => err instanceof ApiError && err.status === 401;
