'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Badge, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api';
import type { Business, Outlet } from '@/lib/types';
import { Devices } from './devices';
import { OutletSheet } from './outlet-sheet';
import { Stations } from './stations';

export default function SettingsPage() {
  const [editingOutlet, setEditingOutlet] = useState<Outlet | 'new' | null>(null);
  const outlets = useQuery({ queryKey: ['outlets'], queryFn: () => api<Outlet[]>('/outlets') });

  return (
    <>
      <PageHeader title="Settings" />

      <div className="space-y-10">
        <Section title="Business" description="Shown on bills and invoices.">
          <BusinessForm />
        </Section>

        <Section
          title="Outlets"
          description="Each outlet has its own tables, staff access and stock."
          action={
            <Button variant="secondary" size="sm" onClick={() => setEditingOutlet('new')}>
              <Plus className="size-3.5" /> Add outlet
            </Button>
          }
        >
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {outlets.isLoading && <Skeleton className="m-4 h-12" />}
            {outlets.data?.map((outlet) => (
              <li key={outlet.id}>
                <button
                  onClick={() => setEditingOutlet(outlet)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-paper/60"
                >
                  <MapPin className="size-4 shrink-0 text-ink-faint" strokeWidth={1.8} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm">{outlet.name}</p>
                      <Badge tone="muted">{outlet.code}</Badge>
                      {!outlet.isActive && <Badge tone="danger">Closed</Badge>}
                    </div>
                    <p className="truncate text-xs text-ink-faint">
                      {[outlet.city, outlet.state].filter(Boolean).join(', ')}
                      {outlet.gstin ? ` · ${outlet.gstin}` : ''}
                    </p>
                  </div>
                  <span className="tabular text-xs text-ink-faint">
                    {outlet._count.tables} tables
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Kitchen stations"
          description="Split KOTs by section, like tandoor or bar. Set per outlet."
        >
          <Stations />
        </Section>

        <Section
          title="POS devices"
          description="Shared counter tablets where staff sign in with a PIN."
        >
          <Devices />
        </Section>
      </div>

      <OutletSheet outlet={editingOutlet} onClose={() => setEditingOutlet(null)} />
    </>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex items-start justify-between gap-4 lg:block">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-1 text-[13px] text-ink-soft">{description}</p>}
        </div>
        {action && <div className="shrink-0 lg:mt-4">{action}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function BusinessForm() {
  const queryClient = useQueryClient();
  const business = useQuery({ queryKey: ['business'], queryFn: () => api<Business>('/business') });
  const [form, setForm] = useState({ name: '', legalName: '', phone: '', email: '', gstin: '' });

  useEffect(() => {
    if (!business.data) return;
    const b = business.data;
    setForm({
      name: b.name,
      legalName: b.legalName ?? '',
      phone: b.phone,
      email: b.email,
      gstin: b.gstin ?? '',
    });
  }, [business.data]);

  const save = useMutation({
    mutationFn: () =>
      api<Business>('/business', {
        method: 'PATCH',
        body: { ...form, legalName: form.legalName || undefined, gstin: form.gstin || null },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Business details saved');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const dirty =
    business.data &&
    (form.name !== business.data.name ||
      form.legalName !== (business.data.legalName ?? '') ||
      form.phone !== business.data.phone ||
      form.email !== business.data.email ||
      form.gstin !== (business.data.gstin ?? ''));

  if (business.isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="rounded-2xl border border-line bg-card"
    >
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Business name">
          {(id) => <Input id={id} value={form.name} onChange={set('name')} required />}
        </Field>
        <Field label="Legal name" optional>
          {(id) => <Input id={id} value={form.legalName} onChange={set('legalName')} />}
        </Field>
        <Field label="Phone">
          {(id) => (
            <Input
              id={id}
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
              }
              inputMode="numeric"
              required
            />
          )}
        </Field>
        <Field label="Email">
          {(id) => (
            <Input id={id} type="email" value={form.email} onChange={set('email')} required />
          )}
        </Field>
        <Field label="GSTIN" optional>
          {(id) => (
            <Input
              id={id}
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              maxLength={15}
              className="tabular uppercase"
            />
          )}
        </Field>
        <Field label="Business code" hint="Staff use this to sign in. It can't be changed.">
          {(id) => (
            <Input
              id={id}
              value={business.data?.businessCode ?? ''}
              disabled
              className="font-mono"
            />
          )}
        </Field>
      </div>
      <div className="flex justify-end border-t border-line px-5 py-3">
        <Button type="submit" size="sm" loading={save.isPending} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
