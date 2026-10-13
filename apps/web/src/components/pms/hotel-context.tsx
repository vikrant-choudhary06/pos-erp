'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { hotelToday } from '@pos/shared';
import type { HotelProperty } from './types';

const Context = createContext<{ property: HotelProperty; today: string } | null>(null);
export function useHotel() {
  const value = useContext(Context);
  if (!value) throw new Error('Hotel context is missing');
  return value;
}

export function HotelLayout({ children }: { children: React.ReactNode }) {
  const { me, outletId, can } = useSession();
  const pathname = usePathname();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = can('hotel.view') || can('hotel.housekeeping') || can('hotel.manage');
  const properties = useQuery({
    queryKey: ['hotel-properties', me.business.id],
    queryFn: () => api<HotelProperty[]>('/pms/properties'),
    enabled: allowed,
  });
  const property = properties.data?.find((item) => item.outletId === outletId);
  async function enable(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/pms/properties', { method: 'POST', body: { name, outletId } });
      await properties.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return <p>You do not have hotel access. Ask the owner to update your role.</p>;
  if (properties.isLoading) return <p>Loading hotel…</p>;
  if (properties.isError)
    return (
      <div role="alert">
        <p>{errorMessage(properties.error)}</p>
        <Button onClick={() => properties.refetch()}>Try again</Button>
      </div>
    );
  if (!property)
    return (
      <>
        <PageHeader
          title="Hotel"
          description="Enable rooms and reception for the selected outlet."
        />
        {can('hotel.manage') && outletId ? (
          <form
            onSubmit={enable}
            className="max-w-lg space-y-5 rounded-2xl border border-line bg-card p-6"
          >
            <p className="text-sm">
              Hotel access follows this outlet’s staff assignments. Restaurant billing remains
              available.
            </p>
            <Field label="Hotel name">
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                />
              )}
            </Field>
            <Button type="submit" loading={busy}>
              Enable hotel
            </Button>
          </form>
        ) : (
          <p>No hotel is configured for this outlet.</p>
        )}
      </>
    );
  const tabs = [
    ...(can('hotel.view')
      ? [
          { href: '/dashboard/hotel', label: 'Reception' },
          { href: '/dashboard/hotel/calendar', label: 'Room calendar' },
        ]
      : []),
    ...(can('hotel.housekeeping')
      ? [{ href: '/dashboard/hotel/housekeeping', label: 'Housekeeping' }]
      : []),
    ...(can('hotel.view') && can('reports.view')
      ? [{ href: '/dashboard/hotel/reports', label: 'Reports & daily closing' }]
      : []),
    ...(can('hotel.manage') ? [{ href: '/dashboard/hotel/settings', label: 'Rooms & rates' }] : []),
  ];
  return (
    <Context.Provider
      key={property.id}
      value={{ property, today: hotelToday(property.outlet.timezone) }}
    >
      <PageHeader
        title={property.name}
        description={`Hotel business day: ${property.businessDate.slice(0, 10)}`}
      />
      <nav aria-label="Hotel navigation" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? 'page' : undefined}
            className={`rounded-lg border px-4 py-3 text-sm ${pathname === tab.href ? 'bg-ink text-on-ink' : 'border-line bg-card'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </Context.Provider>
  );
}
