'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatMoney } from '@pos/shared';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useHotel } from './hotel-context';
import { HotelRoom, RoomType, roomLabels } from './types';

export function RoomsManager({ housekeeping = false }: { housekeeping?: boolean }) {
  const { property } = useHotel();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const rooms = useQuery({
    queryKey: ['hotel-rooms', property.id],
    queryFn: () => api<HotelRoom[]>(`/pms/${property.id}/rooms`),
  });
  const types = useQuery({
    queryKey: ['hotel-types', property.id],
    queryFn: () => api<RoomType[]>(`/pms/${property.id}/room-types`),
    enabled: !housekeeping && (can('hotel.view') || can('hotel.manage')),
  });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState('');
  async function save(event: React.FormEvent<HTMLFormElement>, kind: 'rooms' | 'room-types') {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body =
      kind === 'rooms'
        ? {
            number: fields.get('number'),
            roomTypeId: fields.get('roomTypeId'),
            floor: fields.get('floor'),
          }
        : {
            name: fields.get('name'),
            capacity: Number(fields.get('capacity')),
            nightlyRate: Number(fields.get('nightlyRate')),
            taxPercent: Number(fields.get('taxPercent')),
          };
    setBusy(true);
    try {
      await api(
        `/pms/${property.id}/${kind}${kind === 'room-types' && editing ? `/${editing}` : ''}`,
        { method: editing && kind === 'room-types' ? 'PATCH' : 'POST', body },
      );
      form.reset();
      setEditing('');
      await queryClient.invalidateQueries({ queryKey: ['hotel-types', property.id] });
      await rooms.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function status(room: HotelRoom, value: string) {
    setBusy(true);
    try {
      await api(`/pms/${property.id}/rooms/${room.id}/status`, {
        method: 'PATCH',
        body: { status: value },
      });
      await rooms.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if ((!housekeeping && !can('hotel.manage')) || (housekeeping && !can('hotel.housekeeping')))
    return <p>You do not have access to this hotel workspace.</p>;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          {housekeeping ? 'Housekeeping' : 'Rooms & rates'}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {housekeeping
            ? 'Keep room readiness up to date for reception.'
            : 'Set up room types first, then add room numbers for this branch.'}
        </p>
      </div>
      {!housekeeping && (
        <ol
          aria-label="Hotel setup progress"
          className="grid gap-3 rounded-xl border border-line bg-card p-4 text-sm sm:grid-cols-3"
        >
          <li>
            <strong className="block">1. Room types & rates</strong>
            <span className="text-xs text-ink-soft">
              {types.data?.length
                ? `${types.data.length} room types added`
                : 'Add a type with capacity and nightly rate'}
            </span>
          </li>
          <li>
            <strong className="block">2. Room numbers</strong>
            <span className="text-xs text-ink-soft">
              {rooms.data?.length
                ? `${rooms.data.length} rooms added`
                : 'Choose a type for each room'}
            </span>
          </li>
          <li>
            <strong className="block">3. Staff access</strong>
            {can('staff.manage') ? (
              <Link href="/dashboard/staff" className="text-xs underline underline-offset-4">
                Assign branch staff and roles
              </Link>
            ) : (
              <span className="text-xs text-ink-soft">Ask the owner to assign branch staff</span>
            )}
          </li>
        </ol>
      )}
      {(rooms.isError || (!housekeeping && types.isError)) && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(rooms.error || types.error)}
        </p>
      )}
      {!housekeeping && (
        <div className="grid gap-6 xl:grid-cols-2">
          <form
            key={editing}
            onSubmit={(event) => save(event, 'room-types')}
            className="space-y-4 rounded-2xl border border-line bg-card p-5"
          >
            <h2 className="font-semibold">{editing ? 'Edit room type' : 'Add room type'}</h2>
            {(() => {
              const type = types.data?.find((item) => item.id === editing);
              return (
                <>
                  <Field label="Name">
                    {(id) => (
                      <Input
                        id={id}
                        name="name"
                        required
                        maxLength={80}
                        defaultValue={type?.name}
                      />
                    )}
                  </Field>
                  <Field label="Maximum guests">
                    {(id) => (
                      <Input
                        id={id}
                        name="capacity"
                        type="number"
                        min={1}
                        max={20}
                        required
                        defaultValue={type?.capacity ?? 2}
                      />
                    )}
                  </Field>
                  <Field label="Nightly rate before tax">
                    {(id) => (
                      <Input
                        id={id}
                        name="nightlyRate"
                        type="number"
                        min={0}
                        max={1000000}
                        step="0.01"
                        required
                        defaultValue={type?.nightlyRate}
                      />
                    )}
                  </Field>
                  <Field
                    label="Tax percentage"
                    hint="Enter the applicable rate confirmed by your accountant. Existing bookings retain their agreed rate."
                  >
                    {(id) => (
                      <Input
                        id={id}
                        name="taxPercent"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        required
                        defaultValue={type?.taxPercent ?? 0}
                      />
                    )}
                  </Field>
                </>
              );
            })()}
            <Button type="submit" loading={busy}>
              Save room type
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => setEditing('')}>
                Cancel edit
              </Button>
            )}
            <ul className="space-y-2">
              {types.data?.map((type) => (
                <li key={type.id} className="flex items-center justify-between text-sm">
                  <span>
                    {type.name} · {formatMoney(Number(type.nightlyRate))} / night
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(type.id)}>
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          </form>
          <form
            onSubmit={(event) => save(event, 'rooms')}
            className="space-y-4 rounded-2xl border border-line bg-card p-5"
          >
            <h2 className="font-semibold">Add room</h2>
            <Field label="Room number">
              {(id) => <Input id={id} name="number" required maxLength={20} />}
            </Field>
            <Field label="Room type">
              {(id) => (
                <Select id={id} name="roomTypeId" required>
                  <option value="">Choose a room type</option>
                  {types.data?.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Floor" optional>
              {(id) => <Input id={id} name="floor" maxLength={30} />}
            </Field>
            <Button type="submit" loading={busy} disabled={!types.data?.length}>
              Add room
            </Button>
          </form>
        </div>
      )}
      {rooms.isError && <p role="alert">{errorMessage(rooms.error)}</p>}
      {rooms.isLoading ? (
        <p>Loading rooms…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.data?.map((room) => (
            <article key={room.id} className="space-y-3 rounded-xl border border-line bg-card p-5">
              <h2 className="text-lg font-semibold">Room {room.number}</h2>
              <p className="text-sm font-medium">{room.occupied ? 'Occupied' : 'Vacant'}</p>
              <p className="text-sm text-ink-soft">
                {room.roomType.name}
                {room.floor && ` · Floor ${room.floor}`}
              </p>
              {can('hotel.housekeeping') ? (
                <label className="block text-sm">
                  Room readiness
                  <Select
                    value={room.status}
                    disabled={busy}
                    onChange={(event) => status(room, event.target.value)}
                  >
                    {Object.entries(roomLabels)
                      .filter(
                        ([key]) =>
                          can('hotel.manage') ||
                          (key !== 'MAINTENANCE' && room.status !== 'MAINTENANCE'),
                      )
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    {!can('hotel.manage') && room.status === 'MAINTENANCE' && (
                      <option value="MAINTENANCE">Maintenance — manager access required</option>
                    )}
                  </Select>
                </label>
              ) : (
                <p>{roomLabels[room.status]}</p>
              )}
            </article>
          ))}
        </div>
      )}
      {!rooms.isLoading && rooms.data?.length === 0 && (
        <p>No rooms yet. Add room types and rooms to start taking bookings.</p>
      )}
    </div>
  );
}
