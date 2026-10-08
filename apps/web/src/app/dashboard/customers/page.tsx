'use client';

import { formatMoney, PAYMENT_METHODS, type PaymentMethod } from '@pos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

type Customer = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  birthday: string | null;
  anniversary: string | null;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  creditBalance: string;
  visits: number;
  totalSpent: string;
  lastVisitAt: string | null;
};

type Detail = Customer & {
  orders: { id: string; orderNo: string; status: string; grandTotal: string; openedAt: string }[];
};

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'dues'>('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const query = useDeferredValue(search.trim());

  const params = new URLSearchParams({
    page: String(page),
    ...(query && { search: query }),
    ...(filter === 'dues' && { dues: 'true' }),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['customers', params.toString()],
    queryFn: () =>
      api<{ rows: Customer[]; total: number; pageSize: number }>(`/customers?${params}`),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Saved automatically when a phone number is added to an order."
        actions={
          <Button onClick={() => setOpen('new')}>
            <Plus className="size-4" /> Add customer
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Name or phone"
            className="pl-9"
          />
        </div>
        <Tabs
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'dues', label: 'With dues' },
          ]}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data?.rows.length ? (
        <EmptyState title={query || filter === 'dues' ? 'Nobody matches' : 'No customers yet'} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {data.rows.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setOpen(c.id)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 text-left hover:bg-paper/60 sm:grid-cols-[1fr_120px_120px_100px]"
                >
                  <span>
                    <span className="block text-sm">{c.name ?? 'No name'}</span>
                    <span className="tabular block text-xs text-ink-faint">{c.phone}</span>
                  </span>
                  <span className="tabular hidden text-[13px] text-ink-soft sm:block">
                    {c.visits} {c.visits === 1 ? 'visit' : 'visits'}
                  </span>
                  <span className="tabular hidden text-[13px] sm:block">
                    {formatMoney(c.totalSpent)}
                  </span>
                  <span className="text-right">
                    {Number(c.creditBalance) > 0 && (
                      <Badge tone="danger">Owes {formatMoney(c.creditBalance)}</Badge>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-soft">
              <span className="tabular">
                Page {page} of {pages}
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

      <CustomerSheet id={open} onClose={() => setOpen(null)} />
    </>
  );
}

const blank = {
  phone: '',
  name: '',
  email: '',
  birthday: '',
  anniversary: '',
  gstin: '',
  address: '',
  notes: '',
};

function CustomerSheet({ id, onClose }: { id: string | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const isNew = id === 'new';
  const [form, setForm] = useState(blank);
  const [settle, setSettle] = useState({ amount: '', method: 'CASH' as PaymentMethod });

  const detail = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<Detail>(`/customers/${id}`),
    enabled: Boolean(id) && !isNew,
  });
  const customer = detail.data?.id === id ? detail.data : null;

  useEffect(() => {
    if (isNew) return setForm(blank);
    if (!customer) return;
    setForm({
      phone: customer.phone,
      name: customer.name ?? '',
      email: customer.email ?? '',
      birthday: customer.birthday?.slice(0, 10) ?? '',
      anniversary: customer.anniversary?.slice(0, 10) ?? '',
      gstin: customer.gstin ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    });
    setSettle({ amount: String(Number(customer.creditBalance) || ''), method: 'CASH' });
  }, [id, customer, isNew]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['customer', id] });
  };

  const save = useMutation({
    mutationFn: () => {
      // send only what's filled, empty optional fields are skipped
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''));
      return isNew
        ? api('/customers', { method: 'POST', body })
        : api(`/customers/${id}`, { method: 'PATCH', body });
    },
    onSuccess: () => {
      refresh();
      toast.success(isNew ? 'Customer added' : 'Saved');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const collect = useMutation({
    mutationFn: () =>
      api(`/customers/${id}/settle`, {
        method: 'POST',
        body: { amount: Number(settle.amount), method: settle.method },
      }),
    onSuccess: () => {
      refresh();
      toast.success('Dues collected');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const set =
    (key: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Sheet
      open={id !== null}
      onClose={onClose}
      title={isNew ? 'New customer' : (customer?.name ?? customer?.phone ?? 'Customer')}
      description={
        customer
          ? `${customer.visits} visits · ${formatMoney(customer.totalSpent)} spent`
          : undefined
      }
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="customer-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      {!isNew && !customer ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-8">
          {customer && Number(customer.creditBalance) > 0 && can('bill.settle') && (
            <div className="rounded-xl border border-line p-4">
              <p className="text-[13px]">
                Owes <span className="font-semibold">{formatMoney(customer.creditBalance)}</span>
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={settle.amount}
                  inputMode="decimal"
                  onChange={(e) =>
                    /^\d*\.?\d{0,2}$/.test(e.target.value) &&
                    setSettle({ ...settle, amount: e.target.value })
                  }
                  className="tabular w-32"
                  aria-label="Amount"
                />
                <div className="w-32">
                  <Select
                    value={settle.method}
                    onChange={(e) =>
                      setSettle({ ...settle, method: e.target.value as PaymentMethod })
                    }
                    aria-label="Method"
                  >
                    {(['CASH', 'UPI', 'CARD', 'OTHER'] as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHODS[m]}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  loading={collect.isPending}
                  disabled={!Number(settle.amount)}
                  onClick={() => collect.mutate()}
                >
                  Collect
                </Button>
              </div>
            </div>
          )}

          <form
            id="customer-form"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Mobile">
              {(fid) => (
                <Input
                  id={fid}
                  value={form.phone}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                  }
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  required
                  className="tabular"
                />
              )}
            </Field>
            <Field label="Name" optional>
              {(fid) => <Input id={fid} value={form.name} onChange={set('name')} maxLength={80} />}
            </Field>
            <Field label="Email" optional>
              {(fid) => <Input id={fid} type="email" value={form.email} onChange={set('email')} />}
            </Field>
            <Field label="GSTIN" optional hint="Printed on their bills">
              {(fid) => (
                <Input
                  id={fid}
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  maxLength={15}
                />
              )}
            </Field>
            <Field label="Birthday" optional>
              {(fid) => (
                <Input id={fid} type="date" value={form.birthday} onChange={set('birthday')} />
              )}
            </Field>
            <Field label="Anniversary" optional>
              {(fid) => (
                <Input
                  id={fid}
                  type="date"
                  value={form.anniversary}
                  onChange={set('anniversary')}
                />
              )}
            </Field>
            <Field label="Address" optional className="sm:col-span-2">
              {(fid) => (
                <Input id={fid} value={form.address} onChange={set('address')} maxLength={200} />
              )}
            </Field>
            <Field label="Notes" optional className="sm:col-span-2">
              {(fid) => (
                <Textarea
                  id={fid}
                  value={form.notes}
                  onChange={set('notes')}
                  maxLength={300}
                  rows={2}
                />
              )}
            </Field>
          </form>

          {customer && customer.orders.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
                Recent orders
              </p>
              <ul className="divide-y divide-line rounded-xl border border-line text-[13px]">
                {customer.orders.map((o) => (
                  <li key={o.id} className="tabular flex justify-between px-4 py-2.5">
                    <span>
                      #{o.orderNo}{' '}
                      <span className="text-ink-faint">
                        · {new Date(o.openedAt).toLocaleDateString('en-IN')}
                      </span>
                    </span>
                    <span className={o.status === 'VOID' ? 'text-ink-faint line-through' : ''}>
                      {formatMoney(o.grandTotal)}
                    </span>
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
