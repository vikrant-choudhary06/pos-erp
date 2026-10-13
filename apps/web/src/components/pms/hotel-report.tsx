'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { addHotelDays, formatMoney, hotelDate, hotelDateKey } from '@pos/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useHotel } from './hotel-context';

type Report = {
  rooms: number;
  occupied: number;
  occupancyPercent: number;
  roomRevenue: number;
  restaurantCharges: number;
  extraCharges: number;
  credits: number;
  collected: number;
  refunded: number;
  closings: { id: string; businessDate: string; roomCharges: string }[];
};
export function HotelReport() {
  const { property, today } = useHotel();
  const { can } = useSession();
  const client = useQueryClient();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(hotelDateKey(addHotelDays(hotelDate(today), 1)));
  const [busy, setBusy] = useState(false);
  const allowed = can('hotel.view') && can('reports.view');
  const report = useQuery({
    queryKey: ['hotel-report', property.id, from, to],
    queryFn: () => api<Report>(`/pms/${property.id}/report?from=${from}&to=${to}`),
    enabled: allowed && Boolean(from && to),
  });
  async function closeDay() {
    if (
      !window.confirm(
        `Close hotel business day ${property.businessDate.slice(0, 10)} and post room nights?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/pms/${property.id}/close-day`, {
        method: 'POST',
        body: { date: property.businessDate.slice(0, 10) },
      });
      await client.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith('hotel-'),
      });
      toast.success('Hotel business day closed');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return <p>You do not have access to hotel reports.</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <Field label="From">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          )}
        </Field>
        <Field label="Until (exclusive)">
          {(id) => (
            <Input id={id} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          )}
        </Field>
      </div>
      {report.isError && <p role="alert">{errorMessage(report.error)}</p>}
      {report.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                'Current occupancy',
                `${report.data.occupied}/${report.data.rooms} · ${report.data.occupancyPercent}%`,
              ],
              ['Posted room charges', formatMoney(report.data.roomRevenue)],
              ['Restaurant transfers', formatMoney(report.data.restaurantCharges)],
              ['Extra charges', formatMoney(report.data.extraCharges)],
              ['Credits / reductions', formatMoney(report.data.credits)],
              ['Money collected', formatMoney(report.data.collected)],
              ['Refunds recorded', formatMoney(report.data.refunded)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line bg-card p-5">
                <p className="text-sm text-ink-soft">{label}</p>
                <p className="mt-2 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-ink-soft">
            Restaurant transfers are already included in restaurant sales. Do not add them again
            when calculating combined business revenue. Collections show hotel-account payments, not
            POS payments.
          </p>
        </>
      )}
      {can('hotel.close_day') && (
        <section className="space-y-3 rounded-xl border border-line bg-card p-5">
          <h2 className="font-semibold">Daily closing</h2>
          <p className="text-sm">
            Resolve outstanding arrivals and overdue departures first. Each room night posts once.
            The current calendar day can be closed after it has finished.
          </p>
          <Button
            loading={busy}
            disabled={property.businessDate.slice(0, 10) >= today}
            onClick={closeDay}
          >
            Close {property.businessDate.slice(0, 10)}
          </Button>
          <ul className="divide-y divide-line">
            {report.data?.closings.map((closing) => (
              <li key={closing.id} className="flex justify-between py-3 text-sm">
                <span>{closing.businessDate.slice(0, 10)}</span>
                <span>{formatMoney(Number(closing.roomCharges))} room charges</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
