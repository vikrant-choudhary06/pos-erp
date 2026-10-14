'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session';
import StaffPage from '@/app/dashboard/staff/page';
import { HotelLayout } from './hotel-context';
import { Reception } from './reception';
import { RoomsManager } from './rooms-manager';
import { HotelReport } from './hotel-report';

/** The complete hotel workspace stays inside the POS, without route changes. */
export function HotelWorkspace() {
  const { can } = useSession();
  const [path, setPath] = useState(
    can('hotel.view')
      ? '/dashboard/hotel'
      : can('hotel.manage')
        ? '/dashboard/hotel/settings'
        : '/dashboard/hotel/housekeeping',
  );
  return (
    <HotelLayout activePath={path} onNavigate={setPath}>
      {path === '/dashboard/hotel' && <Reception />}
      {path === '/dashboard/hotel/calendar' && <Reception calendar />}
      {path === '/dashboard/hotel/housekeeping' && <RoomsManager housekeeping />}
      {path === '/dashboard/hotel/settings' && <RoomsManager />}
      {path === '/dashboard/hotel/reports' && <HotelReport />}
      {path === '/dashboard/staff' && can('staff.manage') && <StaffPage />}
    </HotelLayout>
  );
}
