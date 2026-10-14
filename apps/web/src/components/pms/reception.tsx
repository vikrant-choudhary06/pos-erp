'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { addHotelDays, hotelDate, hotelDateKey } from '@pos/shared';
import { ArrowDownLeft, ArrowUpRight, BedDouble, Plus, Search } from 'lucide-react';
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
  const [tab, setTab] = useState('arrivals');
  const [search, setSearch] = useState('');
  const [arrival, setArrival] = useState(today);
  const [departure, setDeparture] = useState(hotelDateKey(addHotelDays(hotelDate(today), 1)));
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
  const stays = reservations.data ?? [];
  const views = [
    {
      id: 'arrivals',
      label: 'Arrivals',
      stays: stays.filter(
        (stay) => stay.status === 'RESERVED' && stay.arrival.slice(0, 10) === from,
      ),
    },
    {
      id: 'staying',
      label: 'Staying',
      stays: stays.filter((stay) => stay.status === 'CHECKED_IN'),
    },
    {
      id: 'departures',
      label: 'Departures',
      stays: stays.filter(
        (stay) => stay.status === 'CHECKED_IN' && stay.departure.slice(0, 10) <= from,
      ),
    },
    { id: 'all', label: 'All bookings', stays },
  ];
  const visible = (views.find((view) => view.id === tab)?.stays ?? []).filter((stay) =>
    `${stay.guest.name} ${stay.guest.phone} ${stay.room.number}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  function newBooking() {
    const start =
      from < property.businessDate.slice(0, 10) ? property.businessDate.slice(0, 10) : from;
    setArrival(start);
    setDeparture(hotelDateKey(addHotelDays(hotelDate(start), 1)));
    setCreating(true);
  }
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {calendar ? 'Room calendar' : 'Reception'}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {calendar
              ? 'Plan the next two weeks, room by room.'
              : 'Arrivals, guests in house and departures in one place.'}
          </p>
        </div>
        {can('hotel.frontdesk') && (
          <Button onClick={newBooking} disabled={!rooms.data?.length}>
            <Plus className="size-4" />
            New booking
          </Button>
        )}
      </div>
      {!calendar && (
        <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
          {[
            {
              label: 'Arrivals',
              count: views[0].stays.length,
              icon: ArrowDownLeft,
              target: 'arrivals',
            },
            {
              label: 'Staying',
              count: views[1].stays.length,
              icon: BedDouble,
              target: 'staying',
            },
            {
              label: 'Due / overdue',
              count: views[2].stays.length,
              icon: ArrowUpRight,
              target: 'departures',
            },
          ].map(({ label, count, icon: Icon, target }) => (
            <button
              key={target}
              onClick={() => setTab(target)}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-3 text-left hover:border-line-strong sm:p-4"
            >
              <span>
                <span className="block text-xs text-ink-soft">{label}</span>
                <strong className="mt-1 block text-2xl tabular-nums">
                  {reservations.isLoading || reservations.isError ? '—' : count}
                </strong>
              </span>
              <Icon className="hidden size-5 text-ink-faint sm:block" />
            </button>
          ))}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-2">
          <Field label={calendar ? 'Calendar starts' : 'Reception date'}>
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
          <Button variant="secondary" onClick={() => setFrom(today)}>
            Today
          </Button>
        </div>
        {!calendar && (
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-3 left-3 size-4 text-ink-faint" />
            <Input
              aria-label="Search guests or rooms"
              placeholder="Guest name, phone or room"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </div>
      {(reservations.isError || rooms.isError) && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {errorMessage(reservations.error || rooms.error)}{' '}
          <Button
            variant="ghost"
            onClick={() => {
              void reservations.refetch();
              void rooms.refetch();
            }}
          >
            Try again
          </Button>
        </p>
      )}
      {rooms.data?.length === 0 && (
        <div className="mb-5 rounded-xl border border-dashed border-line p-6 text-sm">
          <h3 className="font-semibold">Set up your first room</h3>
          <p className="mt-1 text-ink-soft">
            Add room types, rates and room numbers before taking bookings.
          </p>
          {can('hotel.manage') && (
            <Link
              href="/dashboard/hotel/settings"
              className="mt-3 inline-block font-medium underline underline-offset-4"
            >
              Open hotel settings
            </Link>
          )}
        </div>
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
        <>
          <div
            role="tablist"
            aria-label="Reception views"
            className="mb-4 grid grid-cols-2 gap-1 border-b border-line sm:flex"
          >
            {views.map((view) => (
              <button
                key={view.id}
                id={`reception-${view.id}`}
                role="tab"
                aria-selected={tab === view.id}
                aria-controls="reception-list"
                tabIndex={tab === view.id ? 0 : -1}
                onKeyDown={(event) => {
                  const index = views.findIndex((item) => item.id === view.id);
                  const next =
                    event.key === 'ArrowRight'
                      ? (index + 1) % views.length
                      : event.key === 'ArrowLeft'
                        ? (index + views.length - 1) % views.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? views.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  setTab(views[next].id);
                  document.getElementById(`reception-${views[next].id}`)?.focus();
                }}
                onClick={() => setTab(view.id)}
                className={`shrink-0 border-b-2 px-4 py-3 text-sm ${tab === view.id ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
              >
                {view.label} <span className="ml-1 text-xs tabular-nums">{view.stays.length}</span>
              </button>
            ))}
          </div>
          <p className="mb-3 text-xs text-ink-soft">
            {tab === 'all'
              ? `Stays and checkouts from ${from} to ${to}, plus all checked-in guests.`
              : tab === 'staying'
                ? 'All checked-in guests, including overdue stays.'
                : tab === 'departures'
                  ? 'Checked-in guests due to leave by the selected date.'
                  : 'Reserved guests arriving on the selected date. Future bookings are under All bookings.'}
          </p>
          <div id="reception-list" role="tabpanel" aria-labelledby={`reception-${tab}`}>
            <div className="divide-y divide-line rounded-xl border border-line bg-card">
              {visible.map((stay) => (
                <button
                  key={stay.id}
                  onClick={() => setOpen(stay.id)}
                  className="flex min-h-20 w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-paper"
                >
                  <span className="min-w-0">
                    <strong className="break-words">{stay.guest.name}</strong>
                    <span className="block text-sm text-ink-soft">
                      Room {stay.room.number} · {stay.arrival.slice(0, 10)} →{' '}
                      {stay.departure.slice(0, 10)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${stay.status === 'CHECKED_IN' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-ink/5 text-ink-soft'}`}
                    >
                      {reservationLabels[stay.status]}
                    </span>
                    <span className="hidden text-ink-faint sm:inline">Open account →</span>
                  </span>
                </button>
              ))}
              {visible.length === 0 && !reservations.isError && (
                <div className="p-8 text-center text-sm">
                  <p className="font-medium">
                    {search.trim()
                      ? 'No matching guests or rooms'
                      : `No ${views.find((view) => view.id === tab)?.label.toLowerCase()} to show`}
                  </p>
                  <p className="mt-1 text-ink-soft">
                    {search.trim()
                      ? 'Try a different search or another tab.'
                      : 'Choose another date or open All bookings.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {creating && (
        <Sheet
          open
          onClose={() => {
            if (!busy) setCreating(false);
          }}
          title="New booking"
          description="Reserve a specific room. Walk-ins can check in after saving."
        >
          <form onSubmit={create} className="space-y-4">
            <Field label="Guest name">
              {(id) => <Input id={id} name="guestName" required minLength={2} maxLength={100} />}
            </Field>
            <Field label="Phone">
              {(id) => <Input id={id} name="phone" type="tel" required maxLength={20} />}
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
                  value={arrival}
                  onChange={(event) => {
                    const date = event.target.value;
                    setArrival(date);
                    if (date && departure <= date)
                      setDeparture(hotelDateKey(addHotelDays(hotelDate(date), 1)));
                  }}
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
                  value={departure}
                  min={arrival ? hotelDateKey(addHotelDays(hotelDate(arrival), 1)) : undefined}
                  onChange={(event) => setDeparture(event.target.value)}
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
            <details className="rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Additional guest details (optional)
              </summary>
              <div className="mt-4 space-y-4">
                <Field label="Email" optional>
                  {(id) => <Input id={id} name="email" type="email" maxLength={254} />}
                </Field>
                <Field label="Notes" optional>
                  {(id) => <Input id={id} name="notes" maxLength={500} />}
                </Field>
              </div>
            </details>
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
