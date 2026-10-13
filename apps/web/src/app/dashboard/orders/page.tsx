'use client';

import {
  formatMoney,
  ORDER_TYPES,
  PAYMENT_METHODS,
  type OrderType,
  type PaymentMethod,
} from '@pos/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Printer, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { DateRange, presetRange, type Range } from '@/components/date-range';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge, EmptyState, FoodMark, Skeleton } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import type { Order } from '@/lib/pos-types';
import { billHtml, printHtml } from '@/lib/print';
import { useSession } from '@/lib/session';
import { useBillHeader } from '@/lib/use-bill-header';

type Row = {
  id: string;
  orderNo: string;
  type: OrderType;
  status: Order['status'];
  openedAt: string;
  businessDate: string;
  grandTotal: string;
  customerName: string | null;
  customerPhone: string | null;
  voidReason: string | null;
  table: { name: string } | null;
  invoices: { invoiceNo: string; status: string }[];
  payments: { method: PaymentMethod; amount: string }[];
  _count: { items: number };
};

const STATUS_LABEL: Record<Order['status'], string> = {
  OPEN: 'Open',
  BILLED: 'Billed',
  PAID: 'Paid',
  CHARGED: 'Charged to room',
  VOID: 'Void',
};

export default function OrdersPage() {
  const { outletId } = useSession();
  const [range, setRange] = useState<Range>(() => presetRange('today'));
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useDeferredValue(search.trim());

  const params = new URLSearchParams({
    outletId,
    from: range.from,
    to: range.to,
    page: String(page),
    ...(status && { status }),
    ...(query && { search: query }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['orders', params.toString()],
    queryFn: () => api<{ rows: Row[]; total: number; pageSize: number }>(`/orders?${params}`),
    placeholderData: keepPreviousData,
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };

  return (
    <>
      <PageHeader title="Orders" description="Every bill, including voids, with who did what." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRange value={range} onChange={reset(setRange)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            placeholder="Order no, bill no, phone or name"
            className="pl-9"
          />
        </div>
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => reset(setStatus)(e.target.value)}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data?.rows.length ? (
        <EmptyState title="No orders" body="Try a different date range or search." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {data.rows.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => setOpenId(o.id)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-paper/60 sm:grid-cols-[90px_1fr_1fr_auto]"
                >
                  <span className="text-sm font-medium">#{o.orderNo}</span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block truncate text-[13px]">
                      {o.table ? `Table ${o.table.name}` : ORDER_TYPES[o.type]}
                      {o.customerName || o.customerPhone
                        ? ` · ${o.customerName ?? o.customerPhone}`
                        : ''}
                    </span>
                    <span className="block text-xs text-ink-faint">
                      {new Date(o.openedAt).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </span>
                  <span className="hidden truncate font-mono text-xs text-ink-faint sm:block">
                    {o.invoices.find((i) => i.status === 'ISSUED')?.invoiceNo ?? ''}
                  </span>
                  <span className="flex items-center justify-end gap-3">
                    <StatusBadge status={o.status} />
                    <span
                      className={`tabular w-20 text-right text-sm ${o.status === 'VOID' ? 'text-ink-faint line-through' : ''}`}
                    >
                      {formatMoney(o.grandTotal)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-soft">
              <span className="tabular">
                {data.total} orders · page {page} of {pages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <OrderSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function StatusBadge({ status }: { status: Order['status'] }) {
  if (status === 'VOID') return <Badge tone="danger">Void</Badge>;
  if (status === 'PAID') return <Badge tone="muted">Paid</Badge>;
  return <Badge>{STATUS_LABEL[status]}</Badge>;
}

function OrderSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const header = useBillHeader();
  const { data: order } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api<Order>(`/orders/${id}`),
    enabled: Boolean(id),
  });
  const ready = order && order.id === id;

  return (
    <Sheet
      open={id !== null}
      onClose={onClose}
      title={ready ? `Order #${order.orderNo}` : 'Order'}
      description={ready ? (order.invoice?.invoiceNo ?? STATUS_LABEL[order.status]) : undefined}
      width="lg"
      footer={
        ready && (
          <Button variant="secondary" onClick={() => printHtml(billHtml(order, header))}>
            <Printer className="size-4" /> {order.invoice ? 'Reprint bill' : 'Print'}
          </Button>
        )
      }
    >
      {!ready ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6 text-[13px]">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Detail
              label="Type"
              value={
                order.table
                  ? `${ORDER_TYPES[order.type]} · ${order.table.name}`
                  : ORDER_TYPES[order.type]
              }
            />
            <Detail label="Status" value={STATUS_LABEL[order.status]} />
            <Detail
              label="Opened"
              value={new Date(order.openedAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            />
            <Detail
              label="Closed"
              value={
                order.closedAt
                  ? new Date(order.closedAt).toLocaleString('en-IN', { timeStyle: 'short' })
                  : '—'
              }
            />
            <Detail
              label="Guest"
              value={[order.customerName, order.customerPhone].filter(Boolean).join(' · ') || '—'}
            />
            <Detail label="Guests" value={order.covers ? String(order.covers) : '—'} />
          </dl>

          {order.status === 'VOID' && (
            <p className="rounded-xl bg-danger/[0.06] px-4 py-3 text-danger">
              Voided: {order.voidReason}
            </p>
          )}

          <ul className="divide-y divide-line rounded-xl border border-line">
            {order.items.map((i) => (
              <li
                key={i.id}
                className={`flex gap-3 px-4 py-2.5 ${i.status === 'CANCELLED' ? 'text-ink-faint' : ''}`}
              >
                <FoodMark type={i.foodType} className="mt-0.5 size-3" />
                <div className="min-w-0 flex-1">
                  <p className={i.status === 'CANCELLED' ? 'line-through' : ''}>
                    {Number(i.quantity)} × {i.itemName}
                    {i.variantName && <span className="text-ink-faint"> · {i.variantName}</span>}
                  </p>
                  {i.modifiers.length > 0 && (
                    <p className="text-xs text-ink-faint">
                      + {i.modifiers.map((x) => x.name).join(', ')}
                    </p>
                  )}
                  {i.status === 'CANCELLED' && (
                    <p className="text-xs text-danger">Cancelled: {i.cancelReason}</p>
                  )}
                </div>
                <span className="tabular">{formatMoney(i.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="tabular space-y-1.5">
            <Total label="Subtotal" value={order.subtotal} />
            {Number(order.discountTotal) > 0 && (
              <Total
                label={`Discount${order.discount?.reason ? ` (${order.discount.reason})` : ''}`}
                value={`-${order.discountTotal}`}
              />
            )}
            {Number(order.serviceCharge) > 0 && (
              <Total label="Service charge" value={order.serviceCharge} />
            )}
            <Total label="GST" value={order.taxTotal} />
            {Number(order.roundOff) !== 0 && <Total label="Round off" value={order.roundOff} />}
            <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold">
              <dt>Total</dt>
              <dd>{formatMoney(order.grandTotal)}</dd>
            </div>
          </dl>

          {order.payments.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
                Payments
              </p>
              <ul className="space-y-1">
                {order.payments.map((p) => (
                  <li key={p.id} className="tabular flex justify-between">
                    <span>
                      {PAYMENT_METHODS[p.method]}
                      {p.reference && <span className="text-ink-faint"> · {p.reference}</span>}
                    </span>
                    <span>{formatMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  const n = Number(value);
  return (
    <div className="flex justify-between text-ink-soft">
      <dt>{label}</dt>
      <dd>{n < 0 ? `−${formatMoney(-n)}` : formatMoney(n)}</dd>
    </div>
  );
}
