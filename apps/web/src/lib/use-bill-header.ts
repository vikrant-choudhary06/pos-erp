'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSession } from './session';
import type { Business, Outlet } from './types';

/** Business + outlet details printed on the bill header. */
export function useBillHeader() {
  const { outletId, me } = useSession();
  const outlets = useQuery({
    queryKey: ['outlets'],
    queryFn: () => api<Outlet[]>('/outlets'),
    staleTime: 10 * 60_000,
  });
  const business = useQuery({
    queryKey: ['business'],
    queryFn: () => api<Business>('/business'),
    staleTime: 10 * 60_000,
  });
  const outlet = outlets.data?.find((o) => o.id === outletId);
  return {
    businessName: business.data?.name ?? me.business.name,
    outlet: outlet ?? { name: me.outlets.find((o) => o.id === outletId)?.name ?? '' },
  };
}
