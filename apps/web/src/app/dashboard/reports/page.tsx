'use client';

import {
  formatMoney,
  ORDER_TYPES,
  PAYMENT_METHODS,
  type OrderType,
  type PaymentMethod,
} from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Bars, Shares } from '@/components/bars';
import { DateRange, presetRange, type Range } from '@/components/date-range';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Skeleton } from '@/components/ui/misc';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import type { Shift } from '@/lib/pos-types';
import { useSession } from '@/lib/session';

type Sales = {
  summary: {
    orders: number;
    total: number;
    subtotal: number;
    discounts: number;
    tax: number;
    serviceCharge: number;
    covers: number;
    averageBill: number;
    voids: number;
    voidAmount: number;
  };
  byDay: { date: string; orders: number; total: number }[];
  byHour: { hour: number; orders: number; total: number }[];
  byType: { type: OrderType; orders: number; total: number }[];
  byPayment: { method: PaymentMethod; count: number; amount: number; tips: number }[];
  byStaff: { id: string; name: string; orders: number; total: number }[];
};

type Items = {
  items: {
    menuItemId: string;
    name: string;
    variant: string | null;
    category: string | null;
    quantity: number;
    total: number;
    net: number;
  }[];
  categories: { category: string; quantity: number; total: number }[];
  cancelled: {
    name: string;
    reason: string;
    quantity: number;
    at: string;
    by: string | null;
    orderNo: string;
  }[];
};

type Tax = {
  rates: { name: string; rate: number; taxable: number; amount: number }[];
  invoices: {
    id: string;
    invoiceNo: string;
    issuedAt: string;
    status: 'ISSUED' | 'CANCELLED';
    customerName: string | null;
    customerGstin: string | null;
    subtotal: string;
    discountTotal: string;
    taxTotal: string;
    grandTotal: string;
    cancelReason: string | null;
  }[];
};

type View = 'sales' | 'items' | 'tax' | 'shifts';

export default function ReportsPage() {
  const { outletId } = useSession();
  const [range, setRange] = useState<Range>(() => presetRange('7d'));
  const [view, setView] = useState<View>('sales');
  const qs = `from=${range.from}&to=${range.to}&outletId=${outletId}`;

  return (
    <>
      <PageHeader title="Reports" description="Paid orders only. Voids are listed separately." />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'sales', label: 'Sales' },
            { value: 'items', label: 'Items' },
            { value: 'tax', label: 'GST' },
            { value: 'shifts', label: 'Shifts' },
          ]}
        />
        {view !== 'shifts' && <DateRange value={range} onChange={setRange} />}
      </div>

      {view === 'sales' && <SalesView qs={qs} range={range} />}
      {view === 'items' && <ItemsView qs={qs} range={range} />}
      {view === 'tax' && <TaxView qs={qs} range={range} />}
      {view === 'shifts' && <ShiftsView />}
    </>
  );
}

function SalesView({ qs, range }: { qs: string; range: Range }) {
  const { data } = useQuery({
    queryKey: ['report-sales', qs],
    queryFn: () => api<Sales>(`/reports/sales?${qs}`),
  });
  if (!data) return <Loading />;
  const s = data.summary;

  const single = range.from === range.to;
  const chart = single
    ? Array.from({ length: 24 }, (_, h) => {
        const row = data.byHour.find((r) => r.hour === h);
        return {
          key: String(h),
          label: hourLabel(h),
          value: row?.total ?? 0,
          hint: row ? `${row.orders} orders` : undefined,
        };
      }).filter((_, h) => h >= firstHour(data.byHour) && h <= lastHour(data.byHour))
    : data.byDay.map((d) => ({
        key: d.date,
        label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        value: d.total,
        hint: `${d.orders} orders`,
      }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Net sales" value={formatMoney(s.total)} strong />
        <Tile
          label="Orders"
          value={String(s.orders)}
          hint={s.covers ? `${s.covers} guests` : undefined}
        />
        <Tile label="Average bill" value={formatMoney(s.averageBill)} />
        <Tile label="GST collected" value={formatMoney(s.tax)} />
        <Tile label="Discounts" value={formatMoney(s.discounts)} />
        <Tile label="Service charge" value={formatMoney(s.serviceCharge)} />
        <Tile
          label="Voided"
          value={String(s.voids)}
          hint={s.voids ? formatMoney(s.voidAmount) : undefined}
        />
        <Tile label="Gross before discount" value={formatMoney(s.subtotal)} />
      </div>

      <Card title={single ? 'By hour' : 'By day'}>
        <Bars data={chart} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Payments">
          <Shares
            data={data.byPayment.map((p) => ({
              label: PAYMENT_METHODS[p.method],
              value: p.amount,
              hint: `${p.count}${p.tips ? ` · tips ${formatMoney(p.tips)}` : ''}`,
            }))}
          />
          {!data.byPayment.length && <Empty />}
        </Card>
        <Card title="Order types">
          <Shares
            data={data.byType.map((t) => ({
              label: ORDER_TYPES[t.type],
              value: t.total,
              hint: String(t.orders),
            }))}
          />
          {!data.byType.length && <Empty />}
        </Card>
        <Card title="Staff">
          <Shares
            data={data.byStaff.map((t) => ({
              label: t.name,
              value: t.total,
              hint: String(t.orders),
            }))}
          />
          {!data.byStaff.length && <Empty />}
        </Card>
      </div>
    </div>
  );
}

function ItemsView({ qs, range }: { qs: string; range: Range }) {
  const { data } = useQuery({
    queryKey: ['report-items', qs],
    queryFn: () => api<Items>(`/reports/items?${qs}`),
  });
  if (!data) return <Loading />;

  const exportItems = () =>
    downloadCsv(`items-${range.from}-${range.to}.csv`, [
      ['Item', 'Portion', 'Category', 'Quantity', 'Net', 'Total'],
      ...data.items.map((i) => [i.name, i.variant, i.category, i.quantity, i.net, i.total]),
    ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card
          title="Items sold"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={exportItems}
              disabled={!data.items.length}
            >
              <Download className="size-3.5" /> CSV
            </Button>
          }
        >
          {data.items.length === 0 ? (
            <Empty />
          ) : (
            <table className="tabular w-full text-[13px]">
              <thead className="text-left text-xs text-ink-faint">
                <tr>
                  <th className="pb-2 font-normal">Item</th>
                  <th className="pb-2 text-right font-normal">Qty</th>
                  <th className="pb-2 text-right font-normal">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((i) => (
                  <tr key={`${i.menuItemId}-${i.variant}`}>
                    <td className="py-2">
                      {i.name}
                      {i.variant && <span className="text-ink-faint"> · {i.variant}</span>}
                    </td>
                    <td className="py-2 text-right">{i.quantity}</td>
                    <td className="py-2 text-right">{formatMoney(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Categories">
          <Shares
            data={data.categories.map((c) => ({
              label: c.category,
              value: c.total,
              hint: String(c.quantity),
            }))}
          />
          {!data.categories.length && <Empty />}
        </Card>
      </div>

      <Card title="Cancelled after KOT">
        {data.cancelled.length === 0 ? (
          <Empty text="Nothing was cancelled" />
        ) : (
          <ul className="divide-y divide-line text-[13px]">
            {data.cancelled.map((c, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {c.quantity} × {c.name}{' '}
                  <span className="text-ink-faint">· order #{c.orderNo}</span>
                </span>
                <span className="text-ink-soft">
                  {c.reason} {c.by && <span className="text-ink-faint">· {c.by}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TaxView({ qs, range }: { qs: string; range: Range }) {
  const { data } = useQuery({
    queryKey: ['report-tax', qs],
    queryFn: () => api<Tax>(`/reports/tax?${qs}`),
  });
  if (!data) return <Loading />;

  const totalTax = data.rates.reduce((s, r) => s + r.amount, 0);
  const exportRegister = () =>
    downloadCsv(`invoices-${range.from}-${range.to}.csv`, [
      [
        'Invoice',
        'Date',
        'Status',
        'Customer',
        'GSTIN',
        'Taxable',
        'Discount',
        'Tax',
        'Total',
        'Cancel reason',
      ],
      ...data.invoices.map((i) => [
        i.invoiceNo,
        new Date(i.issuedAt).toLocaleDateString('en-IN'),
        i.status,
        i.customerName,
        i.customerGstin,
        Number(i.subtotal) - Number(i.discountTotal),
        i.discountTotal,
        i.taxTotal,
        i.grandTotal,
        i.cancelReason,
      ]),
    ]);

  return (
    <div className="space-y-4">
      <Card title="Tax summary">
        {data.rates.length === 0 ? (
          <Empty />
        ) : (
          <table className="tabular w-full text-[13px]">
            <thead className="text-left text-xs text-ink-faint">
              <tr>
                <th className="pb-2 font-normal">Tax</th>
                <th className="pb-2 text-right font-normal">Taxable value</th>
                <th className="pb-2 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rates.map((r) => (
                <tr key={`${r.name}-${r.rate}`}>
                  <td className="py-2">
                    {r.name} {r.rate}%
                  </td>
                  <td className="py-2 text-right">{formatMoney(r.taxable)}</td>
                  <td className="py-2 text-right">{formatMoney(r.amount)}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="pt-3">Total</td>
                <td />
                <td className="pt-3 text-right">{formatMoney(totalTax)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title={`Invoice register · ${data.invoices.length}`}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={exportRegister}
            disabled={!data.invoices.length}
          >
            <Download className="size-3.5" /> CSV
          </Button>
        }
      >
        {data.invoices.length === 0 ? (
          <Empty />
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            <table className="tabular w-full text-[13px]">
              <tbody className="divide-y divide-line">
                {data.invoices.map((i) => (
                  <tr key={i.id} className={i.status === 'CANCELLED' ? 'text-ink-faint' : ''}>
                    <td className="py-2 font-mono text-xs">{i.invoiceNo}</td>
                    <td className="py-2">
                      {new Date(i.issuedAt).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2">
                      {i.status === 'CANCELLED' ? (
                        <Badge tone="danger">Cancelled</Badge>
                      ) : (
                        i.customerName
                      )}
                    </td>
                    <td className="py-2 text-right">{formatMoney(i.taxTotal)}</td>
                    <td className="py-2 text-right">{formatMoney(i.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ShiftsView() {
  const { outletId, can } = useSession();
  const { data } = useQuery({
    queryKey: ['shifts', outletId],
    queryFn: () => api<(Shift & { closingCash: string | null })[]>(`/shifts?outletId=${outletId}`),
    enabled: can('shift.manage'),
  });
  if (!can('shift.manage')) return <Empty text="Your role can't see cash shifts" />;
  if (!data) return <Loading />;

  return (
    <Card title="Cash shifts">
      {data.length === 0 ? (
        <Empty text="No shifts yet" />
      ) : (
        <table className="tabular w-full text-[13px]">
          <thead className="text-left text-xs text-ink-faint">
            <tr>
              <th className="pb-2 font-normal">Opened</th>
              <th className="pb-2 font-normal">By</th>
              <th className="pb-2 text-right font-normal">Opening</th>
              <th className="pb-2 text-right font-normal">Expected</th>
              <th className="pb-2 text-right font-normal">Counted</th>
              <th className="pb-2 text-right font-normal">Difference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((s) => {
              const diff = Number(s.difference ?? 0);
              return (
                <tr key={s.id}>
                  <td className="py-2">
                    {new Date(s.openedAt).toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="py-2">{s.closedBy ?? s.openedBy}</td>
                  <td className="py-2 text-right">{formatMoney(s.openingCash)}</td>
                  <td className="py-2 text-right">
                    {s.status === 'OPEN' ? <Badge>Open</Badge> : formatMoney(s.expectedCash)}
                  </td>
                  <td className="py-2 text-right">
                    {s.closingCash ? formatMoney(s.closingCash) : '—'}
                  </td>
                  <td className={diff < 0 ? 'py-2 text-right text-danger' : 'py-2 text-right'}>
                    {s.status === 'OPEN' ? '—' : formatMoney(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Tile({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong ? 'rounded-2xl bg-ink p-4 text-on-ink' : 'rounded-2xl border border-line bg-card p-4'
      }
    >
      <p className={strong ? 'text-xs text-on-ink/60' : 'text-xs text-ink-faint'}>{label}</p>
      <p className="tabular mt-1.5 text-xl font-semibold tracking-tight">{value}</p>
      {hint && (
        <p className={strong ? 'text-xs text-on-ink/60' : 'text-xs text-ink-faint'}>{hint}</p>
      )}
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}

function Empty({ text = 'Nothing in this period' }: { text?: string }) {
  return <p className="py-6 text-center text-[13px] text-ink-faint">{text}</p>;
}

const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const firstHour = (rows: { hour: number }[]) =>
  rows.length ? Math.min(...rows.map((r) => r.hour)) : 0;
const lastHour = (rows: { hour: number }[]) =>
  rows.length ? Math.max(...rows.map((r) => r.hour)) : 23;
