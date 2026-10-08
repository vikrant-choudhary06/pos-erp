'use client';

import { formatMoney, PAYMENT_METHODS, type PaymentMethod } from '@pos/shared';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { newId } from '@/lib/id';
import type { Order } from '@/lib/pos-types';

type Row = { id: string; method: PaymentMethod; amount: string; reference: string };

const METHODS: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'WALLET', 'CREDIT', 'OTHER'];

export function PayDialog({
  order,
  total,
  open,
  onClose,
  onPay,
  onPaid,
}: {
  order: Order;
  /** what the bill comes to, including unsaved lines */
  total: number;
  open: boolean;
  onClose: () => void;
  onPay: (
    payments: { id: string; method: PaymentMethod; amount: number; reference?: string }[],
  ) => Promise<{ order: Order; change: number }>;
  onPaid: (order: Order, change: number, print: boolean) => void;
}) {
  const due = Math.round((total - Number(order.paidTotal)) * 100) / 100;
  const [rows, setRows] = useState<Row[]>([]);
  const [print, setPrint] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRows([{ id: newId(), method: 'CASH', amount: String(due), reference: '' }]);
      setPrint(!order.invoice);
    }
  }, [open]);

  const paying = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const cash = rows
    .filter((r) => r.method === 'CASH')
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const left = Math.round((due - paying) * 100) / 100;
  const change = left < 0 && cash > 0 ? Math.min(-left, cash) : 0;
  const tooMuch = left < 0 && change < -left;

  const update = (id: string, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function submit() {
    setBusy(true);
    try {
      const res = await onPay(
        rows
          .filter((r) => Number(r.amount) > 0)
          .map((r) => ({
            id: r.id,
            method: r.method,
            amount: Number(r.amount),
            reference: r.reference || undefined,
          })),
      );
      onPaid(res.order, res.change, print);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Take payment"
      description={`Order #${order.orderNo}`}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <Switch checked={print} onChange={setPrint} label="Print bill" /> Print bill
          </label>
          <Button size="lg" loading={busy} disabled={left > 0 || tooMuch} onClick={submit}>
            {left > 0 ? `${formatMoney(left)} left` : 'Complete'}
          </Button>
        </div>
      }
    >
      <div className="rounded-2xl bg-paper p-5 text-center">
        <p className="text-[13px] text-ink-soft">Amount due</p>
        <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{formatMoney(due)}</p>
        {Number(order.paidTotal) > 0 && (
          <p className="mt-1 text-xs text-ink-faint">{formatMoney(order.paidTotal)} already paid</p>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => update(row.id, { method: m })}
                  className={cn(
                    'h-8 rounded-lg px-3 text-[13px] transition-colors',
                    row.method === m
                      ? 'bg-ink text-white'
                      : 'bg-black/[0.04] text-ink-soft hover:text-ink',
                  )}
                >
                  {PAYMENT_METHODS[m]}
                </button>
              ))}
              {rows.length > 1 && (
                <button
                  onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                  className="ml-auto grid size-8 place-items-center rounded-lg text-ink-faint hover:text-ink"
                  aria-label="Remove payment"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-faint">
                  ₹
                </span>
                <Input
                  value={row.amount}
                  inputMode="decimal"
                  onChange={(e) =>
                    /^\d*\.?\d{0,2}$/.test(e.target.value) &&
                    update(row.id, { amount: e.target.value })
                  }
                  onFocus={(e) => e.target.select()}
                  autoFocus={index === 0}
                  className="tabular h-11 pl-7 text-base"
                  aria-label="Amount"
                />
              </div>
              {row.method !== 'CASH' && row.method !== 'CREDIT' && (
                <Input
                  value={row.reference}
                  onChange={(e) => update(row.id, { reference: e.target.value })}
                  placeholder="Ref / last 4"
                  className="h-11 w-32"
                  maxLength={80}
                />
              )}
            </div>
            {row.method === 'CASH' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {quickCash(Math.max(left + Number(row.amount || 0), 0)).map((v) => (
                  <button
                    key={v}
                    onClick={() => update(row.id, { amount: String(v) })}
                    className="tabular rounded-lg border border-line px-2.5 py-1 text-xs hover:border-line-strong"
                  >
                    {formatMoney(v)}
                  </button>
                ))}
              </div>
            )}
            {row.method === 'CREDIT' && !order.customerId && (
              <p className="mt-2 text-xs text-danger">
                Add the customer’s number first to put this on credit.
              </p>
            )}
          </div>
        ))}

        {left > 0 && rows.length < 5 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setRows([
                ...rows,
                { id: newId(), method: 'UPI', amount: String(left), reference: '' },
              ])
            }
          >
            <Plus className="size-3.5" /> Split payment
          </Button>
        )}

        {change > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-white">
            <span className="text-sm">Return change</span>
            <span className="tabular text-xl font-semibold">{formatMoney(change)}</span>
          </div>
        )}
        {tooMuch && (
          <p className="text-[13px] text-danger">Only cash can be more than the amount due.</p>
        )}
      </div>
    </Sheet>
  );
}

/** Exact amount plus the notes a customer is likely to hand over. */
function quickCash(due: number) {
  const values = new Set<number>([Math.round(due * 100) / 100]);
  for (const note of [50, 100, 200, 500, 2000]) {
    const v = Math.ceil(due / note) * note;
    if (v > due) values.add(v);
  }
  return [...values].sort((a, b) => a - b).slice(0, 5);
}
