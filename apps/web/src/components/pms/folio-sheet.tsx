'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatMoney, PAYMENT_METHODS } from '@pos/shared';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { useSession } from '@/lib/session';
import { useHotel } from './hotel-context';
import { Folio, HotelRoom, reservationLabels } from './types';
import { hotelStatementHtml } from './statement';
import { printHtml } from '@/lib/print';

export function FolioSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { property } = useHotel();
  const { can } = useSession();
  const client = useQueryClient();
  const root = `/pms/${property.id}/reservations/${id}`;
  const folio = useQuery({ queryKey: ['hotel-folio', id], queryFn: () => api<Folio>(root) });
  const rooms = useQuery({
    queryKey: ['hotel-rooms', property.id],
    queryFn: () => api<HotelRoom[]>(`/pms/${property.id}/rooms`),
  });
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('PAYMENT');
  const [entryId, setEntryId] = useState(newId);
  async function mutate(path: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST') {
    setBusy(true);
    try {
      await api(root + path, { method, body });
      await client.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith('hotel-'),
      });
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function entry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const monetary = kind === 'PAYMENT' || kind === 'REFUND';
    if (
      await mutate('/entries', {
        id: entryId,
        kind,
        amount: Number(fields.get('amount')),
        description: fields.get('description'),
        ...(monetary && {
          method: fields.get('method'),
          reference: fields.get('reference') || undefined,
        }),
      })
    ) {
      setEntryId(newId());
      form.reset();
    }
  }
  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    await mutate(
      '',
      {
        roomId: fields.get('roomId'),
        departure: fields.get('departure'),
        allowRoomCharges: fields.get('allowRoomCharges') === 'on',
      },
      'PATCH',
    );
  }
  const stay = folio.data;
  const active = stay && ['RESERVED', 'CHECKED_IN'].includes(stay.status);
  return (
    <Sheet
      open
      onClose={onClose}
      title={stay ? `${stay.guest.name} · Room ${stay.room.number}` : 'Guest account'}
      description={stay ? reservationLabels[stay.status] : 'Loading…'}
    >
      {folio.isError && <p role="alert">{errorMessage(folio.error)}</p>}
      {stay && (
        <div className="space-y-6">
          <Button variant="secondary" onClick={() => printHtml(hotelStatementHtml(property, stay))}>
            Print guest statement
          </Button>
          <p className="text-sm">
            {stay.arrival.slice(0, 10)} → {stay.departure.slice(0, 10)} · {stay.guests} guests ·{' '}
            {stay.guest.phone}
          </p>
          <div className="rounded-xl bg-paper p-5 text-sm">
            <p className="text-xs text-ink-soft">
              {stay.status === 'CHECKED_IN'
                ? 'Balance if checking out today'
                : 'Posted account balance'}
            </p>
            <strong className="mt-1 block text-3xl tracking-tight tabular-nums">
              {formatMoney(stay.status === 'CHECKED_IN' ? stay.checkoutBalance : stay.balance)}
            </strong>
            {stay.status === 'CHECKED_IN' && (
              <p className="mt-1 text-xs text-ink-soft">
                Includes room nights used, with a minimum of one night.
              </p>
            )}
            <details className="mt-3 border-t border-line pt-3">
              <summary className="cursor-pointer text-xs text-ink-soft">
                View balance breakdown
              </summary>
              <div className="mt-2 space-y-1 text-xs">
                <p>Posted balance: {formatMoney(stay.balance)}</p>
                <p>Estimated balance for the booked stay: {formatMoney(stay.estimatedBalance)}</p>
              </div>
            </details>
          </div>
          {can('hotel.frontdesk') && (
            <div className="flex flex-wrap gap-2">
              {stay.status === 'RESERVED' && (
                <>
                  <Button loading={busy} onClick={() => mutate('/check-in')}>
                    Check in
                  </Button>
                  <details className="self-center text-sm">
                    <summary className="cursor-pointer rounded-lg px-3 py-2 text-ink-soft">
                      More booking actions
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt('Cancellation reason');
                          if (reason?.trim())
                            void mutate('/cancel', { status: 'CANCELLED', reason: reason.trim() });
                        }}
                      >
                        Cancel booking
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt('No-show reason');
                          if (reason?.trim())
                            void mutate('/cancel', { status: 'NO_SHOW', reason: reason.trim() });
                        }}
                      >
                        Mark no-show
                      </Button>
                    </div>
                  </details>
                </>
              )}
              {stay.status === 'CHECKED_IN' && can('hotel.billing') && (
                <Button
                  loading={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Check out this guest? Early checkout charges nights used, with a minimum of one night.',
                      )
                    )
                      void mutate('/check-out');
                  }}
                >
                  Check out
                </Button>
              )}
            </div>
          )}
          <section>
            <h2 className="mb-2 font-semibold">Guest account entries</h2>
            <ul className="divide-y divide-line">
              {stay.entries.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-3 py-3 text-sm">
                  <div>
                    <p>{entry.description}</p>
                    <p className="text-xs text-ink-soft">
                      {entry.kind}
                      {entry.method && ` · ${entry.method}`}
                      {Number(entry.taxAmount) > 0 &&
                        ` · tax ${formatMoney(Number(entry.taxAmount))}`}
                    </p>
                  </div>
                  <strong>{formatMoney(Number(entry.amount))}</strong>
                </li>
              ))}
            </ul>
            {!stay.entries.length && (
              <p className="text-sm text-ink-soft">
                No posted entries yet. Room nights post at daily closing or checkout.
              </p>
            )}
          </section>
          {can('hotel.billing') && (
            <form onSubmit={entry} className="space-y-4 rounded-xl border border-line p-4">
              <h2 className="font-semibold">Record a transaction</h2>
              <Field label="Entry type">
                {(fieldId) => (
                  <Select
                    id={fieldId}
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                  >
                    <option value="PAYMENT" disabled={!active}>
                      Payment / deposit
                    </option>
                    <option value="EXTRA" disabled={!active}>
                      Extra charge
                    </option>
                    {can('hotel.manage') && (
                      <>
                        <option value="REFUND">Refund paid to guest</option>
                        <option value="CREDIT">Reduce guest charges</option>
                      </>
                    )}
                  </Select>
                )}
              </Field>
              <Field label="Amount">
                {(fieldId) => (
                  <Input
                    id={fieldId}
                    name="amount"
                    type="number"
                    min="0.01"
                    max="10000000"
                    step="0.01"
                    required
                  />
                )}
              </Field>
              <Field label="Description / reason">
                {(fieldId) => (
                  <Input id={fieldId} name="description" required minLength={3} maxLength={200} />
                )}
              </Field>
              {(kind === 'PAYMENT' || kind === 'REFUND') && (
                <>
                  <Field label="Payment method">
                    {(fieldId) => (
                      <Select id={fieldId} name="method">
                        {Object.entries(PAYMENT_METHODS)
                          .filter(([key]) => key !== 'CREDIT')
                          .map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Reference" optional>
                    {(fieldId) => <Input id={fieldId} name="reference" maxLength={80} />}
                  </Field>
                  <p className="text-xs text-ink-soft">
                    This records money already collected or refunded. It does not initiate or verify
                    a bank transaction.
                  </p>
                </>
              )}
              <Button
                type="submit"
                loading={busy}
                disabled={!active && !['REFUND', 'CREDIT'].includes(kind)}
              >
                Save entry
              </Button>
            </form>
          )}
          {active && can('hotel.frontdesk') && (
            <details className="rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Change room or extend stay
              </summary>
              <form onSubmit={change} className="space-y-4 rounded-xl border border-line p-4">
                <h2 className="font-semibold">Move room / extend stay</h2>
                <Field label="Room">
                  {(fieldId) => (
                    <Select id={fieldId} name="roomId" defaultValue={stay.room.id}>
                      {rooms.data?.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.number} · {room.roomType.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Departure">
                  {(fieldId) => (
                    <Input
                      id={fieldId}
                      name="departure"
                      type="date"
                      min={stay.departure.slice(0, 10)}
                      defaultValue={stay.departure.slice(0, 10)}
                      required
                    />
                  )}
                </Field>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="allowRoomCharges"
                    defaultChecked={stay.allowRoomCharges}
                  />{' '}
                  Allow restaurant charges
                </label>
                <p className="text-xs text-ink-soft">
                  The agreed nightly rate is retained when moving rooms or extending the stay.
                </p>
                <Button type="submit" loading={busy}>
                  Update stay
                </Button>
              </form>
            </details>
          )}
        </div>
      )}
    </Sheet>
  );
}
