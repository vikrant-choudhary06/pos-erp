'use client';

import { formatMoney } from '@pos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog, Sheet } from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { type BaseUnit, formatQty, UNIT_LABEL } from '@/lib/units';

type StockItem = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  baseUnit: BaseUnit;
  purchaseUnit: string | null;
  purchaseUnitFactor: string;
  reorderLevel: number;
  quantity: number;
  avgCost: number;
  value: number;
  low: boolean;
};

type Movement = {
  id: string;
  type: string;
  quantity: string;
  balanceAfter: string | null;
  reason: string | null;
  referenceType: string | null;
  createdAt: string;
  inventoryItem: { name: string; baseUnit: BaseUnit };
};

const MOVE_LABEL: Record<string, string> = {
  OPENING: 'Opening stock',
  PURCHASE: 'Purchase',
  PURCHASE_RETURN: 'Return to vendor',
  SALE: 'Sold',
  SALE_REVERSAL: 'Void, put back',
  WASTAGE: 'Wastage',
  ADJUSTMENT: 'Count correction',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
};

export default function InventoryPage() {
  const { outletId } = useSession();
  const [view, setView] = useState<'stock' | 'history'>('stock');
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<StockItem | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState<StockItem | null>(null);
  const query = useDeferredValue(search.trim().toLowerCase());

  const stock = useQuery({
    queryKey: ['stock', outletId],
    queryFn: () => api<StockItem[]>(`/inventory/stock?outletId=${outletId}`),
  });

  const rows = (stock.data ?? []).filter(
    (i) =>
      (!onlyLow || i.low) &&
      (!query || i.name.toLowerCase().includes(query) || i.category?.toLowerCase().includes(query)),
  );
  const totalValue = (stock.data ?? []).reduce((s, i) => s + Math.max(i.value, 0), 0);
  const lowCount = (stock.data ?? []).filter((i) => i.low).length;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock goes down automatically when a dish with a recipe is sold."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add stock item
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Items tracked" value={String(stock.data?.length ?? '—')} />
        <Stat label="Stock value" value={formatMoney(totalValue)} />
        <Stat label="Running low" value={String(lowCount)} danger={lowCount > 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: 'stock', label: 'Stock' },
            { value: 'history', label: 'History' },
          ]}
        />
        {view === 'stock' && (
          <>
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="pl-9"
              />
            </div>
            <Button
              variant={onlyLow ? 'primary' : 'secondary'}
              onClick={() => setOnlyLow(!onlyLow)}
            >
              Low stock
            </Button>
          </>
        )}
      </div>

      {view === 'history' ? (
        <History />
      ) : stock.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !stock.data?.length ? (
        <EmptyState
          title="Nothing tracked yet"
          body="Add raw materials like paneer, oil or milk, then link them to dishes as recipes from the Menu page."
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Add stock item
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <table className="tabular w-full text-[13px]">
            <thead className="border-b border-line text-left text-xs text-ink-faint">
              <tr>
                <th className="px-5 py-2.5 font-normal">Item</th>
                <th className="px-3 py-2.5 text-right font-normal">On hand</th>
                <th className="hidden px-3 py-2.5 text-right font-normal sm:table-cell">
                  Avg cost
                </th>
                <th className="hidden px-3 py-2.5 text-right font-normal sm:table-cell">Value</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((item) => (
                <tr key={item.id} className="hover:bg-paper/60">
                  <td className="px-5 py-3">
                    <button onClick={() => setEditing(item)} className="text-left hover:underline">
                      {item.name}
                    </button>
                    <span className="block text-xs text-ink-faint">
                      {item.category ?? 'Uncategorised'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={cn(item.quantity < 0 && 'text-danger')}>
                      {formatQty(item.quantity, item.baseUnit)}
                    </span>
                    {item.low && (
                      <span className="ml-2">
                        <Badge tone="danger">Low</Badge>
                      </span>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 text-right text-ink-soft sm:table-cell">
                    {item.avgCost
                      ? `${formatMoney(perDisplayUnit(item))}/${displayUnit(item)}`
                      : '—'}
                  </td>
                  <td className="hidden px-3 py-3 text-right sm:table-cell">
                    {formatMoney(item.value)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="secondary" size="sm" onClick={() => setAdjusting(item)}>
                      Update
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-8 text-center text-[13px] text-ink-faint">Nothing matches</p>
          )}
        </div>
      )}

      <ItemSheet item={editing} onClose={() => setEditing(null)} />
      <AdjustSheet item={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}

// costs are stored per gram / ml, people think per kg / litre
const displayUnit = (i: StockItem) =>
  i.baseUnit === 'G' ? 'kg' : i.baseUnit === 'ML' ? 'L' : 'pc';
const perDisplayUnit = (i: StockItem) => (i.baseUnit === 'PCS' ? i.avgCost : i.avgCost * 1000);

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs text-ink-faint">{label}</p>
      <p
        className={cn('tabular mt-1 text-xl font-semibold tracking-tight', danger && 'text-danger')}
      >
        {value}
      </p>
    </div>
  );
}

function History() {
  const { outletId } = useSession();
  const { data } = useQuery({
    queryKey: ['movements', outletId],
    queryFn: () => api<Movement[]>(`/inventory/movements?outletId=${outletId}`),
  });
  if (!data) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data.length) return <EmptyState title="No stock changes yet" />;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <ul className="divide-y divide-line text-[13px]">
        {data.map((m) => {
          const qty = Number(m.quantity);
          return (
            <li
              key={m.id}
              className="tabular grid grid-cols-[1fr_auto] gap-3 px-5 py-2.5 sm:grid-cols-[1fr_140px_120px_120px]"
            >
              <span>
                {m.inventoryItem.name}
                <span className="block text-xs text-ink-faint">
                  {new Date(m.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {m.reason ? ` · ${m.reason}` : ''}
                </span>
              </span>
              <span className="hidden text-ink-soft sm:block">{MOVE_LABEL[m.type] ?? m.type}</span>
              <span className={cn('text-right', qty < 0 ? 'text-danger' : 'text-veg')}>
                {qty > 0 ? '+' : ''}
                {formatQty(qty, m.inventoryItem.baseUnit)}
              </span>
              <span className="hidden text-right text-ink-faint sm:block">
                {m.balanceAfter !== null ? formatQty(m.balanceAfter, m.inventoryItem.baseUnit) : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// most things in a kitchen are counted in grams and bought by the kg
const blankItem = {
  name: '',
  category: '',
  sku: '',
  baseUnit: 'G' as BaseUnit,
  purchaseUnit: 'kg',
  purchaseUnitFactor: '1000',
  reorderLevel: '',
};

function ItemSheet({ item, onClose }: { item: StockItem | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const existing = item && item !== 'new' ? item : null;
  const [form, setForm] = useState(blankItem);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!item) return;
    setForm(
      existing
        ? {
            name: existing.name,
            category: existing.category ?? '',
            sku: existing.sku ?? '',
            baseUnit: existing.baseUnit,
            purchaseUnit: existing.purchaseUnit ?? '',
            purchaseUnitFactor: String(Number(existing.purchaseUnitFactor)),
            reorderLevel: existing.reorderLevel ? String(existing.reorderLevel) : '',
          }
        : blankItem,
    );
  }, [item]);

  // the usual purchase unit for each base unit
  const suggest = (unit: BaseUnit) =>
    unit === 'G'
      ? { purchaseUnit: 'kg', purchaseUnitFactor: '1000' }
      : unit === 'ML'
        ? { purchaseUnit: 'L', purchaseUnitFactor: '1000' }
        : { purchaseUnit: '', purchaseUnitFactor: '' };

  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    toast.success(message);
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        category: form.category || undefined,
        sku: form.sku || undefined,
        baseUnit: form.baseUnit,
        purchaseUnit: form.purchaseUnit || undefined,
        purchaseUnitFactor: Number(form.purchaseUnitFactor) || 1,
        reorderLevel: Number(form.reorderLevel) || 0,
      };
      return existing
        ? api(`/inventory/items/${existing.id}`, { method: 'PATCH', body })
        : api('/inventory/items', { method: 'POST', body });
    },
    onSuccess: () => done(existing ? 'Saved' : 'Stock item added'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/inventory/items/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirming(false);
      done('Removed');
    },
    onError: (err) => {
      setConfirming(false);
      toast.error(errorMessage(err));
    },
  });

  const unit = UNIT_LABEL[form.baseUnit];

  return (
    <>
      <Sheet
        open={item !== null}
        onClose={onClose}
        title={existing ? existing.name : 'New stock item'}
        footer={
          <>
            {existing && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirming(true)}>
                Remove
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button form="stock-item-form" type="submit" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form
          id="stock-item-form"
          className="space-y-5"
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
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Paneer"
                required
                autoFocus={!existing}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" optional>
              {(id) => (
                <Input
                  id={id}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Dairy"
                />
              )}
            </Field>
            <Field label="Counted in" hint="Recipes use this unit">
              {(id) => (
                <Select
                  id={id}
                  value={form.baseUnit}
                  onChange={(e) => {
                    const baseUnit = e.target.value as BaseUnit;
                    setForm({ ...form, baseUnit, ...suggest(baseUnit) });
                  }}
                >
                  <option value="G">Grams (g)</option>
                  <option value="ML">Millilitres (ml)</option>
                  <option value="PCS">Pieces</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bought in" optional hint="kg, litre, box, tray…">
              {(id) => (
                <Input
                  id={id}
                  value={form.purchaseUnit}
                  onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value })}
                />
              )}
            </Field>
            <Field label={`1 ${form.purchaseUnit || 'unit'} =`} optional>
              {(id) => (
                <div className="relative">
                  <Input
                    id={id}
                    value={form.purchaseUnitFactor}
                    onChange={(e) =>
                      /^\d*\.?\d{0,3}$/.test(e.target.value) &&
                      setForm({ ...form, purchaseUnitFactor: e.target.value })
                    }
                    inputMode="decimal"
                    className="tabular pr-10"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-faint">
                    {unit}
                  </span>
                </div>
              )}
            </Field>
          </div>
          <Field label="Warn me below" optional>
            {(id) => (
              <div className="relative w-44">
                <Input
                  id={id}
                  value={form.reorderLevel}
                  onChange={(e) =>
                    /^\d*\.?\d{0,3}$/.test(e.target.value) &&
                    setForm({ ...form, reorderLevel: e.target.value })
                  }
                  inputMode="decimal"
                  className="tabular pr-10"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-faint">
                  {unit}
                </span>
              </div>
            )}
          </Field>
        </form>
      </Sheet>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${existing?.name ?? ''}?`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Remove
            </Button>
          </>
        }
      >
        Items still used in a recipe can't be removed.
      </Dialog>
    </>
  );
}

type Kind = 'COUNT' | 'WASTAGE' | 'OPENING';

function AdjustSheet({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { outletId } = useSession();
  const [kind, setKind] = useState<Kind>('COUNT');
  const [inPurchaseUnit, setInPurchaseUnit] = useState(false);
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!item) return;
    setKind('COUNT');
    setInPurchaseUnit(Boolean(item.purchaseUnit));
    setQty('');
    setCost('');
    setReason('');
  }, [item]);

  const factor = item && inPurchaseUnit ? Number(item.purchaseUnitFactor) || 1 : 1;
  const base = (Number(qty) || 0) * factor;

  const save = useMutation({
    mutationFn: () =>
      api('/inventory/adjustments', {
        method: 'POST',
        body: {
          outletId,
          inventoryItemId: item!.id,
          kind,
          quantity: Math.round(base * 1000) / 1000,
          unitCost: kind === 'OPENING' && cost ? Number(cost) / factor : undefined,
          reason: reason.trim() || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      toast.success('Stock updated');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!item) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        {null}
      </Sheet>
    );
  }

  const unitName = inPurchaseUnit ? item.purchaseUnit! : UNIT_LABEL[item.baseUnit];

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      description={`On hand: ${formatQty(item.quantity, item.baseUnit)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={qty === '' || (kind !== 'COUNT' && !base)}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Tabs
          value={kind}
          onChange={setKind}
          options={[
            { value: 'COUNT', label: 'Physical count' },
            { value: 'WASTAGE', label: 'Wastage' },
            { value: 'OPENING', label: 'Add stock' },
          ]}
        />
        <p className="text-[13px] text-ink-soft">
          {kind === 'COUNT'
            ? 'Enter what is actually there. The difference is recorded as a correction.'
            : kind === 'WASTAGE'
              ? 'Spoiled, spilled or burnt. This comes off the stock.'
              : 'Stock you already had, or got without a purchase entry.'}
        </p>
        <div className="flex items-end gap-3">
          <Field label={kind === 'COUNT' ? 'Counted' : 'Quantity'} className="flex-1">
            {(id) => (
              <div className="relative">
                <Input
                  id={id}
                  value={qty}
                  onChange={(e) => /^\d*\.?\d{0,3}$/.test(e.target.value) && setQty(e.target.value)}
                  inputMode="decimal"
                  className="tabular pr-14"
                  autoFocus
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-faint">
                  {unitName}
                </span>
              </div>
            )}
          </Field>
          {item.purchaseUnit && (
            <Tabs
              value={inPurchaseUnit ? 'p' : 'b'}
              onChange={(v) => setInPurchaseUnit(v === 'p')}
              options={[
                { value: 'p', label: item.purchaseUnit },
                { value: 'b', label: UNIT_LABEL[item.baseUnit] },
              ]}
            />
          )}
        </div>
        {kind === 'COUNT' && qty !== '' && (
          <p className="tabular text-[13px] text-ink-soft">
            Difference: {base - item.quantity >= 0 ? '+' : ''}
            {formatQty(base - item.quantity, item.baseUnit)}
          </p>
        )}
        {kind === 'OPENING' && (
          <Field label={`Cost per ${unitName}`} optional>
            {(id) => (
              <Input
                id={id}
                value={cost}
                onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setCost(e.target.value)}
                inputMode="decimal"
                className="tabular w-40"
              />
            )}
          </Field>
        )}
        <Field label="Note" optional>
          {(id) => (
            <Input
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}
