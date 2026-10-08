'use client';

import { formatMoney } from '@pos/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';

type Entry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  user: { name: string; employeeCode: string } | null;
};

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'order.', label: 'Voids, discounts, cancellations' },
  { value: 'invoice.', label: 'Reopened bills' },
  { value: 'menu.', label: 'Price changes' },
  { value: 'cash.', label: 'Cash in / out' },
  { value: 'shift.', label: 'Shift closing' },
  { value: 'stock.', label: 'Stock corrections' },
  { value: 'device.', label: 'POS devices' },
];

const PAGE = 50;

export default function ActivityPage() {
  const [action, setAction] = useState('');

  const query = useInfiniteQuery({
    queryKey: ['audit', action],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api<Entry[]>(
        `/audit?limit=${PAGE}${action ? `&action=${action}` : ''}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (last) =>
      last.length === PAGE ? last[last.length - 1].createdAt : undefined,
  });
  const entries = query.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader
        title="Activity"
        description="Sensitive actions by your team. Entries can't be edited or deleted."
        actions={
          <div className="w-64">
            <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter">
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : entries.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[150px_1fr]">
                <span className="text-xs text-ink-faint">
                  {new Date(e.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                <span className="text-[13px]">
                  <span className="font-medium">{e.user?.name ?? 'System'}</span> {describe(e)}
                </span>
              </li>
            ))}
          </ul>
          {query.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Turn an audit row into a sentence a shop owner can read. */
function describe({ action, before, after }: Entry): string {
  const a = after ?? {};
  const b = before ?? {};
  const reason = a.reason ? ` — “${a.reason}”` : '';

  switch (action) {
    case 'order.void':
      return `voided order #${b.orderNo} worth ${formatMoney(b.total as string)}${reason}`;
    case 'order.discount':
      return `gave ${a.type === 'PERCENT' ? `${a.value}%` : formatMoney(a.value as number)} off (${formatMoney(a.amount as number)})${reason}`;
    case 'order.item_cancel':
      return `cancelled ${b.quantity} × ${b.item} after it was sent to the kitchen${reason}`;
    case 'invoice.cancel':
      return `reopened bill ${(b.invoices as string[] | undefined)?.join(', ') ?? ''}${reason}`;
    case 'menu.price_change':
      return `changed the price of ${a.name ?? 'an item'} from ${formatMoney(b.basePrice as string)} to ${formatMoney(a.basePrice as string)}`;
    case 'cash.pay_in':
      return `put ${formatMoney(a.amount as number)} into the drawer${reason}`;
    case 'cash.pay_out':
      return `took ${formatMoney(a.amount as number)} out of the drawer${reason}`;
    case 'shift.close': {
      const diff = Number(a.difference);
      return `closed the shift, counted ${formatMoney(a.counted as number)}${diff ? ` (${diff > 0 ? 'extra' : 'short'} ${formatMoney(Math.abs(diff))})` : ''}`;
    }
    case 'stock.count':
    case 'stock.wastage':
    case 'stock.opening':
      return `${action === 'stock.wastage' ? 'recorded wastage' : action === 'stock.count' ? 'corrected stock after a count' : 'added opening stock'}${reason}`;
    case 'customer.dues_settled':
      return `collected ${formatMoney(a.amount as number)} dues from a customer`;
    case 'vendor.payment':
      return `paid a vendor ${formatMoney(a.amount as number)}`;
    case 'device.register':
      return `set up a POS device “${a.name}”`;
    case 'device.revoke':
      return 'removed a POS device';
    default:
      return action.replace(/[._]/g, ' ');
  }
}
