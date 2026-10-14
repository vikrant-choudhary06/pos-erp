'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Hotel, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Select, Field } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { hotelToday } from '@pos/shared';
import type { HotelProperty } from './types';
import { BranchSetup } from './branch-setup';

const Context = createContext<{ property: HotelProperty; today: string } | null>(null);
export function useHotel() {
  const value = useContext(Context);
  if (!value) throw new Error('Hotel context is missing');
  return value;
}

export function HotelLayout({ children }: { children: React.ReactNode }) {
  const { me, outletId, setOutletId, can } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const allowed = can('hotel.view') || can('hotel.housekeeping') || can('hotel.manage');
  const properties = useQuery({
    queryKey: ['hotel-properties', me.business.id],
    queryFn: () => api<HotelProperty[]>('/pms/properties'),
    enabled: allowed,
  });
  const property = properties.data?.find((item) => item.outletId === outletId);
  async function branchSaved(id: string) {
    await properties.refetch();
    setOutletId(id);
    router.push('/dashboard/hotel/settings');
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
  const branchHeader = (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-line bg-card p-4">
      <div className="flex w-full items-center gap-3 sm:w-auto">
        <Hotel className="hidden size-5 shrink-0 text-ink-soft sm:block" />
        <Field label="Hotel branch" className="w-full sm:min-w-64">
          {(id) => (
            <Select
              id={id}
              value={property?.outletId ?? ''}
              onChange={(event) => setOutletId(event.target.value)}
            >
              {!property && <option value="">Select a hotel branch</option>}
              {properties.data?.map((hotel) => {
                const city = me.outlets.find((outlet) => outlet.id === hotel.outletId)?.city;
                return (
                  <option key={hotel.id} value={hotel.outletId}>
                    {hotel.name}
                    {city ? ` · ${city}` : ''}
                  </option>
                );
              })}
            </Select>
          )}
        </Field>
      </div>
      {can('hotel.manage') && (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add hotel branch
        </Button>
      )}
    </div>
  );
  const setup = adding && (
    <BranchSetup
      properties={properties.data ?? []}
      onClose={() => setAdding(false)}
      onSaved={branchSaved}
    />
  );
  if (!property)
    return (
      <>
        <PageHeader
          title="Hotel workspace"
          description="Choose a hotel branch or set up your first one."
        />
        {branchHeader}
        <div className="rounded-xl border border-dashed border-line p-6 sm:p-10">
          <h2 className="text-lg font-semibold">
            {properties.data?.length
              ? 'Choose a branch to get started'
              : 'Welcome to your hotel workspace'}
          </h2>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            {properties.data?.length
              ? 'Each hotel has its own reception, room calendar and guest accounts. Use the selector above to open one.'
              : 'Start with a branch, add its rooms and rates, then invite your reception and housekeeping staff.'}
          </p>
          {can('hotel.manage') && (
            <Button className="mt-5" onClick={() => setAdding(true)}>
              Set up hotel branch
            </Button>
          )}
        </div>
        {setup}
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
      ? [{ href: '/dashboard/hotel/reports', label: 'Reports' }]
      : []),
    ...(can('hotel.manage')
      ? [{ href: '/dashboard/hotel/settings', label: 'Hotel settings' }]
      : []),
  ];
  return (
    <Context.Provider
      key={property.id}
      value={{ property, today: hotelToday(property.outlet.timezone) }}
    >
      {branchHeader}
      <h1 className="sr-only">{property.name} hotel workspace</h1>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
        <span>Hotel workspace</span>
        <span>Business day · {property.businessDate.slice(0, 10)}</span>
      </div>
      <nav aria-label="Hotel navigation" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm ${pathname === tab.href ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
      {setup}
    </Context.Provider>
  );
}
