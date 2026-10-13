'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { addHotelDays, hotelDate, hotelDateKey, hotelToday } from '@pos/shared';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { HotelProperty, Reservation } from './types';

export function ChargeRoomSheet({
  outletId,
  onClose,
  onCharge,
}: {
  outletId: string;
  onClose: () => void;
  onCharge: (id: string) => Promise<void>;
}) {
  const properties = useQuery({
    queryKey: ['hotel-charge-properties'],
    queryFn: () => api<HotelProperty[]>('/pms/properties'),
  });
  const property = properties.data?.find((item) => item.outletId === outletId);
  const today = hotelToday(property?.outlet.timezone ?? 'Asia/Kolkata');
  const from = hotelDateKey(addHotelDays(hotelDate(today), -365));
  const to = hotelDateKey(addHotelDays(hotelDate(today), 1));
  const stays = useQuery({
    queryKey: ['hotel-charge-stays', property?.id],
    queryFn: () => api<Reservation[]>(`/pms/${property!.id}/reservations?from=${from}&to=${to}`),
    enabled: Boolean(property),
    staleTime: 0,
  });
  const [busy, setBusy] = useState(false);
  async function charge(id: string) {
    setBusy(true);
    try {
      await onCharge(id);
    } finally {
      setBusy(false);
    }
  }
  const guests = stays.data?.filter(
    (stay) => stay.status === 'CHECKED_IN' && stay.allowRoomCharges,
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title="Charge restaurant bill to room"
      description="Transfers the unpaid bill to a checked-in guest. No money is collected here."
    >
      {(properties.isLoading || stays.isLoading) && <p>Loading guest stays…</p>}
      {(properties.isError || stays.isError) && (
        <p role="alert">{errorMessage(properties.error ?? stays.error)}</p>
      )}
      {properties.isSuccess && !property && <p>No hotel is enabled for this restaurant outlet.</p>}
      {stays.isSuccess && !guests?.length && (
        <p>No checked-in guests currently allow room charges.</p>
      )}
      <ul className="space-y-3">
        {guests?.map((stay) => (
          <li key={stay.id}>
            <Button
              variant="secondary"
              className="h-auto min-h-12 w-full justify-start py-3"
              disabled={busy}
              onClick={() => charge(stay.id)}
            >
              Room {stay.room.number} · {stay.guest.name}
            </Button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
