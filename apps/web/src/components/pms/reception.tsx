'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { addHotelDays, hotelDate, hotelDateKey } from '@pos/shared';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { api, errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { useSession } from '@/lib/session';
import { useHotel } from './hotel-context';
import { HotelRoom, Reservation, reservationLabels } from './types';
import { FolioSheet } from './folio-sheet';

export function Reception({ calendar = false }: { calendar?: boolean }) {
  const { property, today } = useHotel();
  const { can } = useSession();
  const client = useQueryClient();
  const [from, setFrom] = useState(today);
  const to = hotelDateKey(addHotelDays(hotelDate(from), calendar ? 14 : 31));
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bookingId, setBookingId] = useState(newId);
  const reservations = useQuery({
    queryKey: ['hotel-reservations', property.id, from, to],
    queryFn: () => api<Reservation[]>(`/pms/${property.id}/reservations?from=${from}&to=${to}`),
    enabled: can('hotel.view'),
    refetchInterval: 30_000,
  });
  const rooms = useQuery({
    queryKey: ['hotel-rooms', property.id],
    queryFn: () => api<HotelRoom[]>(`/pms/${property.id}/rooms`),
    enabled: can('hotel.view'),
  });
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const stay = await api<Reservation>(`/pms/${property.id}/reservations`, {
        method: 'POST',
        body: {
          id: bookingId,
          roomId: fields.get('roomId'),
          arrival: fields.get('arrival'),
          departure: fields.get('departure'),
          guests: Number(fields.get('guests')),
          guestName: fields.get('guestName'),
          phone: fields.get('phone'),
          email: fields.get('email') || undefined,
          notes: fields.get('notes') || undefined,
        },
      });
      setCreating(false);
      setBookingId(newId());
      setOpen(stay.id);
      await client.invalidateQueries({ queryKey: ['hotel-reservations'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (!can('hotel.view'))
    return <Link href="/dashboard/hotel/housekeeping">Open housekeeping</Link>;
  const days = Array.from({ length: 14 }, (_, index) =>
    hotelDateKey(addHotelDays(hotelDate(from), index)),
  );
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <Field label={calendar ? 'Calendar starts' : 'Show stays from'}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={from}
              onChange={(event) => {
                if (event.target.value) setFrom(event.target.value);
              }}
            />
          )}
        </Field>
        {can('hotel.frontdesk') && (
          <Button onClick={() => setCreating(true)} disabled={!rooms.data?.length}>
            New reservation / walk-in
          </Button>
        )}
      </div>
      {reservations.isError && <p role="alert">{errorMessage(reservations.error)}</p>}
      {rooms.data?.length === 0 && (
        <p>Add your room types and rooms under Rooms & rates before taking reservations.</p>
      )}
      {reservations.isLoading ? (
        <p>Loading reservations…</p>
      ) : calendar ? (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left">Room</th>
                {days.map((day) => (
                  <th key={day} className="p-3">
                    {day.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.data?.map((room) => (
                <tr key={room.id} className="border-t border-line">
                  <th className="p-3 text-left">{room.number}</th>
                  {days.map((day) => {
                    const stay = reservations.data?.find(
                      (item) =>
                        item.room.id === room.id &&
                        ['RESERVED', 'CHECKED_IN'].includes(item.status) &&
                        item.arrival.slice(0, 10) <= day &&
                        item.departure.slice(0, 10) > day,
                    );
                    return (
                      <td key={day} className="border-l border-line p-1">
                        {stay ? (
                          <button
                            onClick={() => setOpen(stay.id)}
                            className={`min-h-12 w-full rounded px-2 text-left ${stay.status === 'CHECKED_IN' ? 'bg-ink text-on-ink' : 'bg-ink/10'}`}
                          >
                            <span className="block truncate">{stay.guest.name}</span>
                            <small>{reservationLabels[stay.status]}</small>
                          </button>
                        ) : (
                          <span className="block p-2 text-ink-soft">
                            {room.status === 'MAINTENANCE' ? 'Blocked' : 'Available'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line bg-card">
          {reservations.data?.map((stay) => (
            <button
              key={stay.id}
              onClick={() => setOpen(stay.id)}
              className="flex min-h-20 w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-paper"
            >
              <span>
                <strong>{stay.guest.name}</strong>
                <span className="block text-sm text-ink-soft">
                  Room {stay.room.number} · {stay.arrival.slice(0, 10)} →{' '}
                  {stay.departure.slice(0, 10)}
                </span>
              </span>
              <span className="text-sm">{reservationLabels[stay.status]}</span>
            </button>
          ))}
          {reservations.data?.length === 0 && (
            <p className="p-5 text-sm">No stays in this date range.</p>
          )}
        </div>
      )}
      {creating && (
        <Sheet
          open
          onClose={() => setCreating(false)}
          title="New reservation"
          description="Reserve a specific room. Walk-ins can check in after saving."
        >
          <form onSubmit={create} className="space-y-4">
            <Field label="Guest name">
              {(id) => <Input id={id} name="guestName" required minLength={2} maxLength={100} />}
            </Field>
            <Field label="Phone">
              {(id) => <Input id={id} name="phone" type="tel" required maxLength={20} />}
            </Field>
            <Field label="Email" optional>
              {(id) => <Input id={id} name="email" type="email" maxLength={254} />}
            </Field>
            <Field label="Room">
              {(id) => (
                <Select id={id} name="roomId" required>
                  <option value="">Select a room</option>
                  {rooms.data
                    ?.filter((room) => room.status !== 'MAINTENANCE')
                    .map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.number} · {room.roomType.name} · max {room.roomType.capacity} guests
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Field label="Arrival">
              {(id) => (
                <Input
                  id={id}
                  name="arrival"
                  type="date"
                  defaultValue={today}
                  min={property.businessDate.slice(0, 10)}
                  required
                />
              )}
            </Field>
            <Field label="Departure">
              {(id) => (
                <Input
                  id={id}
                  name="departure"
                  type="date"
                  defaultValue={hotelDateKey(addHotelDays(hotelDate(today), 1))}
                  required
                />
              )}
            </Field>
            <Field label="Guests">
              {(id) => (
                <Input
                  id={id}
                  name="guests"
                  type="number"
                  defaultValue={1}
                  min={1}
                  max={20}
                  required
                />
              )}
            </Field>
            <Field label="Notes" optional>
              {(id) => <Input id={id} name="notes" maxLength={500} />}
            </Field>
            <Button type="submit" loading={busy}>
              Reserve room
            </Button>
          </form>
        </Sheet>
      )}
      {open && <FolioSheet key={open} id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
