'use client';

import { formatMoney, PAYMENT_METHODS, type PaymentMethod } from '@pos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { today } from '@/components/date-range';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { useSession } from '@/lib/session';
import { type BaseUnit, UNIT_LABEL } from '@/lib/units';

type Vendor = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  balanceDue: string;
  _count: { receipts: number };
};

type Purchase = {
  id: string;
  grnNo: string;
  vendorInvoiceNo: string | null;
  receivedAt: string;
  total: string;
  vendor: { name: string };
  _count: { lines: number };
};

type StockItem = {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  purchaseUnit: string | null;
};

export default function PurchasesPage() {
  const { outletId } = useSession();
  const [view, setView] = useState<'purchases' | 'vendors'>('purchases');
  const [creating, setCreating] = useState(false);
  const [vendor, setVendor] = useState<Vendor | 'new' | null>(null);

  const purchases = useQuery({
    queryKey: ['purchases', outletId],
    queryFn: () => api<Purchase[]>(`/purchases?outletId=${outletId}`),
  });
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api<Vendor[]>('/vendors') });
  const owed = (vendors.data ?? []).reduce((s, v) => s + Number(v.balanceDue), 0);

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Record goods as they arrive. Stock and average cost update on their own."
        actions={
          view === 'purchases' ? (
            <Button onClick={() => setCreating(true)} disabled={!vendors.data?.length}>
              <Plus className="size-4" /> New purchase
            </Button>
          ) : (
            <Button onClick={() => setVendor('new')}>
              <Plus className="size-4" /> Add vendor
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'purchases', label: 'Purchases' },
            { value: 'vendors', label: 'Vendors' },
          ]}
        />
        {owed > 0 && (
          <p className="tabular text-[13px] text-ink-soft">You owe vendors {formatMoney(owed)}</p>
        )}
      </div>

      {view === 'purchases' ? (
        purchases.isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : !purchases.data?.length ? (
          <EmptyState
            title="No purchases yet"
            body={
              vendors.data?.length
                ? 'Add one when the next delivery comes in.'
                : 'Add a vendor first, then record what they deliver.'
            }
            action={
              vendors.data?.length ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" /> New purchase
                </Button>
              ) : (
                <Button onClick={() => setVendor('new')}>
                  <Plus className="size-4" /> Add vendor
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            <ul className="divide-y divide-line text-[13px]">
              {purchases.data.map((p) => (
                <li
                  key={p.id}
                  className="tabular grid grid-cols-[1fr_auto] gap-3 px-5 py-3 sm:grid-cols-[100px_1fr_120px_110px]"
                >
                  <span className="font-mono text-xs">{p.grnNo}</span>
                  <span className="hidden sm:block">
                    {p.vendor.name}
                    {p.vendorInvoiceNo && (
                      <span className="text-ink-faint"> · bill {p.vendorInvoiceNo}</span>
                    )}
                  </span>
                  <span className="hidden text-ink-soft sm:block">
                    {new Date(p.receivedAt).toLocaleDateString('en-IN')}
                  </span>
                  <span className="text-right">{formatMoney(p.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : vendors.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !vendors.data?.length ? (
        <EmptyState
          title="No vendors yet"
          body="The people you buy vegetables, dairy and supplies from."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {vendors.data.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => setVendor(v)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-paper/60"
                >
                  <span>
                    <span className="block text-sm">{v.name}</span>
                    <span className="block text-xs text-ink-faint">
                      {[v.contactName, v.phone].filter(Boolean).join(' · ') ||
                        `${v._count.receipts} purchases`}
                    </span>
                  </span>
                  {Number(v.balanceDue) > 0 ? (
                    <Badge tone="danger">Due {formatMoney(v.balanceDue)}</Badge>
                  ) : (
                    <Badge tone="muted">Settled</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PurchaseSheet
        open={creating}
        vendors={vendors.data ?? []}
        onClose={() => setCreating(false)}
      />
      <VendorSheet vendor={vendor} onClose={() => setVendor(null)} />
    </>
  );
}

type Line = {
  key: string;
  inventoryItemId: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};
const newLine = (): Line => ({
  key: newId(),
  inventoryItemId: '',
  quantity: '',
  unitPrice: '',
  taxRate: '0',
});

function PurchaseSheet({
  open,
  vendors,
  onClose,
}: {
  open: boolean;
  vendors: Vendor[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { outletId } = useSession();
  const [vendorId, setVendorId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const items = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api<StockItem[]>('/inventory/items'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setVendorId(vendors[0]?.id ?? '');
    setInvoiceNo('');
    setDate(today());
    setLines([newLine()]);
  }, [open]);

  const update = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const lineTotal = (l: Line) =>
    (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (1 + (Number(l.taxRate) || 0) / 100);
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);
  const valid =
    vendorId &&
    lines.every((l) => l.inventoryItemId && Number(l.quantity) > 0 && l.unitPrice !== '');

  const save = useMutation({
    mutationFn: () =>
      api('/purchases', {
        method: 'POST',
        body: {
          outletId,
          vendorId,
          vendorInvoiceNo: invoiceNo || undefined,
          vendorInvoiceDate: date || undefined,
          lines: lines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            taxRate: Number(l.taxRate) || 0,
          })),
        },
      }),
    onSuccess: () => {
      for (const key of ['purchases', 'vendors', 'stock', 'movements'])
        queryClient.invalidateQueries({ queryKey: [key] });
      toast.success('Purchase saved, stock updated');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New purchase"
      width="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="tabular text-sm">
            Total <span className="font-semibold">{formatMoney(total)}</span>
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Vendor">
            {(id) => (
              <Select id={id} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Their bill no." optional>
            {(id) => (
              <Input
                id={id}
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                maxLength={40}
              />
            )}
          </Field>
          <Field label="Bill date" optional>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        </div>

        {items.data && items.data.length === 0 ? (
          <p className="rounded-xl bg-paper px-4 py-3 text-[13px] text-ink-soft">
            Add stock items on the Inventory page first.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_80px_100px_64px_32px] gap-2 text-xs text-ink-faint">
              <span>Item</span>
              <span>Qty</span>
              <span>Rate</span>
              <span>GST %</span>
              <span />
            </div>
            {lines.map((l) => {
              const item = items.data?.find((i) => i.id === l.inventoryItemId);
              const unit = item ? (item.purchaseUnit ?? UNIT_LABEL[item.baseUnit]) : '';
              return (
                <div
                  key={l.key}
                  className="grid grid-cols-[1fr_80px_100px_64px_32px] items-center gap-2"
                >
                  <Select
                    value={l.inventoryItemId}
                    onChange={(e) => update(l.key, { inventoryItemId: e.target.value })}
                    aria-label="Item"
                  >
                    <option value="">Pick item</option>
                    {items.data?.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={l.quantity}
                    onChange={(e) =>
                      /^\d*\.?\d{0,3}$/.test(e.target.value) &&
                      update(l.key, { quantity: e.target.value })
                    }
                    inputMode="decimal"
                    placeholder={unit}
                    className="tabular"
                    aria-label="Quantity"
                  />
                  <Input
                    value={l.unitPrice}
                    onChange={(e) =>
                      /^\d*\.?\d{0,2}$/.test(e.target.value) &&
                      update(l.key, { unitPrice: e.target.value })
                    }
                    inputMode="decimal"
                    placeholder={unit ? `₹ per ${unit}` : '₹'}
                    className="tabular"
                    aria-label="Rate"
                  />
                  <Select
                    value={l.taxRate}
                    onChange={(e) => update(l.key, { taxRate: e.target.value })}
                    aria-label="GST"
                  >
                    {['0', '5', '12', '18', '28'].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                  <button
                    onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                    disabled={lines.length === 1}
                    className="grid size-8 place-items-center rounded-lg text-ink-faint hover:text-ink disabled:opacity-30"
                    aria-label="Remove line"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => setLines([...lines, newLine()])}
            >
              <Plus className="size-3.5" /> Add line
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

const blankVendor = { name: '', contactName: '', phone: '', email: '', gstin: '', address: '' };

function VendorSheet({ vendor, onClose }: { vendor: Vendor | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const existing = vendor && vendor !== 'new' ? vendor : null;
  const [form, setForm] = useState(blankVendor);
  const [pay, setPay] = useState({ amount: '', method: 'UPI' as PaymentMethod, reference: '' });

  const ledger = useQuery({
    queryKey: ['vendor-ledger', existing?.id],
    queryFn: () =>
      api<{
        receipts: { id: string; grnNo: string; receivedAt: string; total: string }[];
        payments: {
          id: string;
          amount: string;
          method: PaymentMethod;
          paidAt: string;
          reference: string | null;
        }[];
      }>(`/vendors/${existing!.id}/ledger`),
    enabled: Boolean(existing),
  });

  useEffect(() => {
    if (!vendor) return;
    setForm(
      existing
        ? {
            name: existing.name,
            contactName: existing.contactName ?? '',
            phone: existing.phone ?? '',
            email: existing.email ?? '',
            gstin: existing.gstin ?? '',
            address: existing.address ?? '',
          }
        : blankVendor,
    );
    setPay({
      amount: existing ? String(Number(existing.balanceDue) || '') : '',
      method: 'UPI',
      reference: '',
    });
  }, [vendor]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
    queryClient.invalidateQueries({ queryKey: ['vendor-ledger'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''));
      return existing
        ? api(`/vendors/${existing.id}`, { method: 'PATCH', body })
        : api('/vendors', { method: 'POST', body });
    },
    onSuccess: () => {
      refresh();
      toast.success(existing ? 'Saved' : 'Vendor added');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const payment = useMutation({
    mutationFn: () =>
      api(`/vendors/${existing!.id}/payments`, {
        method: 'POST',
        body: {
          amount: Number(pay.amount),
          method: pay.method,
          reference: pay.reference || undefined,
        },
      }),
    onSuccess: () => {
      refresh();
      toast.success('Payment recorded');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const set = (key: keyof typeof blankVendor) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <Sheet
      open={vendor !== null}
      onClose={onClose}
      title={existing ? existing.name : 'New vendor'}
      description={existing ? `Balance due ${formatMoney(existing.balanceDue)}` : undefined}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="vendor-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        {existing && (
          <div className="rounded-xl border border-line p-4">
            <p className="text-[13px] font-medium">Pay this vendor</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                value={pay.amount}
                onChange={(e) =>
                  /^\d*\.?\d{0,2}$/.test(e.target.value) &&
                  setPay({ ...pay, amount: e.target.value })
                }
                inputMode="decimal"
                placeholder="₹"
                className="tabular w-32"
                aria-label="Amount"
              />
              <div className="w-32">
                <Select
                  value={pay.method}
                  onChange={(e) => setPay({ ...pay, method: e.target.value as PaymentMethod })}
                  aria-label="Method"
                >
                  {(['CASH', 'UPI', 'CARD', 'OTHER'] as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHODS[m]}
                    </option>
                  ))}
                </Select>
              </div>
              <Input
                value={pay.reference}
                onChange={(e) => setPay({ ...pay, reference: e.target.value })}
                placeholder="Ref"
                className="w-32"
                maxLength={80}
              />
              <Button
                variant="secondary"
                loading={payment.isPending}
                disabled={!Number(pay.amount)}
                onClick={() => payment.mutate()}
              >
                Record
              </Button>
            </div>
          </div>
        )}

        <form
          id="vendor-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                value={form.name}
                onChange={set('name')}
                required
                minLength={2}
                autoFocus={!existing}
              />
            )}
          </Field>
          <Field label="Contact person" optional>
            {(id) => <Input id={id} value={form.contactName} onChange={set('contactName')} />}
          </Field>
          <Field label="Phone" optional>
            {(id) => <Input id={id} value={form.phone} onChange={set('phone')} inputMode="tel" />}
          </Field>
          <Field label="Email" optional>
            {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} />}
          </Field>
          <Field label="GSTIN" optional>
            {(id) => (
              <Input
                id={id}
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                maxLength={15}
              />
            )}
          </Field>
          <Field label="Address" optional>
            {(id) => <Input id={id} value={form.address} onChange={set('address')} />}
          </Field>
        </form>

        {existing &&
          ledger.data &&
          (ledger.data.receipts.length > 0 || ledger.data.payments.length > 0) && (
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
                Ledger
              </p>
              <ul className="divide-y divide-line rounded-xl border border-line text-[13px]">
                {[
                  ...ledger.data.receipts.map((r) => ({
                    id: r.id,
                    at: r.receivedAt,
                    label: `Purchase ${r.grnNo}`,
                    amount: Number(r.total),
                  })),
                  ...ledger.data.payments.map((p) => ({
                    id: p.id,
                    at: p.paidAt,
                    label: `Paid by ${PAYMENT_METHODS[p.method]}`,
                    amount: -Number(p.amount),
                  })),
                ]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((row) => (
                    <li key={row.id} className="tabular flex justify-between px-4 py-2.5">
                      <span>
                        {row.label}{' '}
                        <span className="text-ink-faint">
                          · {new Date(row.at).toLocaleDateString('en-IN')}
                        </span>
                      </span>
                      <span className={row.amount < 0 ? 'text-veg' : ''}>
                        {row.amount < 0 ? '−' : '+'}
                        {formatMoney(Math.abs(row.amount))}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
      </div>
    </Sheet>
  );
}
