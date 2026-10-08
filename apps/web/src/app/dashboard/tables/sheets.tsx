'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Dialog, Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import type { Area, DiningTable } from '@/lib/types';

function useFloorRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['floor'] });
}

// Suggest the next free number, e.g. T1..T8 exist -> start at 9
function nextNumber(tables: DiningTable[], prefix: string) {
  const used = tables
    .map((t) => (t.name.startsWith(prefix) ? Number(t.name.slice(prefix.length)) : NaN))
    .filter(Number.isInteger);
  return used.length ? Math.max(...used) + 1 : 1;
}

export function BulkTablesSheet({
  open,
  onClose,
  outletId,
  areas,
  tables,
  defaultAreaId,
}: {
  open: boolean;
  onClose: () => void;
  outletId: string;
  areas: Area[];
  tables: DiningTable[];
  defaultAreaId?: string;
}) {
  const refresh = useFloorRefresh();
  const [form, setForm] = useState({
    prefix: 'T',
    start: '1',
    count: '6',
    capacity: '4',
    areaId: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({
      ...f,
      start: String(nextNumber(tables, f.prefix)),
      areaId: defaultAreaId ?? '',
    }));
  }, [open]);

  const start = Number(form.start) || 0;
  const count = Number(form.count) || 0;
  const preview =
    count > 0
      ? count <= 3
        ? Array.from({ length: count }, (_, i) => `${form.prefix}${start + i}`).join(', ')
        : `${form.prefix}${start}, ${form.prefix}${start + 1} … ${form.prefix}${start + count - 1}`
      : '';

  const save = useMutation({
    mutationFn: () =>
      api<{ created: number }>(`/outlets/${outletId}/tables/bulk`, {
        method: 'POST',
        body: {
          prefix: form.prefix,
          start,
          count,
          capacity: Number(form.capacity) || 4,
          areaId: form.areaId || undefined,
        },
      }),
    onSuccess: (res) => {
      refresh();
      toast.success(`${res.created} tables added`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  const digits = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, '').slice(0, 3) }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add tables"
      description="Create several numbered tables at once."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="bulk-form" type="submit" loading={save.isPending} disabled={count < 1}>
            Add {count > 0 ? count : ''} tables
          </Button>
        </>
      }
    >
      <form
        id="bulk-form"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="Prefix">
            {(id) => <Input id={id} value={form.prefix} onChange={set('prefix')} maxLength={10} />}
          </Field>
          <Field label="Start at">
            {(id) => (
              <Input
                id={id}
                value={form.start}
                onChange={digits('start')}
                inputMode="numeric"
                required
              />
            )}
          </Field>
          <Field label="How many">
            {(id) => (
              <Input
                id={id}
                value={form.count}
                onChange={digits('count')}
                inputMode="numeric"
                required
              />
            )}
          </Field>
        </div>
        {preview && <p className="-mt-2 text-xs text-ink-faint">{preview}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Seats each">
            {(id) => (
              <Input
                id={id}
                value={form.capacity}
                onChange={digits('capacity')}
                inputMode="numeric"
              />
            )}
          </Field>
          <Field label="Area" optional={areas.length > 0}>
            {(id) => (
              <Select id={id} value={form.areaId} onChange={set('areaId')} disabled={!areas.length}>
                <option value="">{areas.length ? 'No area' : 'No areas yet'}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

export function TableSheet({
  table,
  areas,
  onClose,
}: {
  table: DiningTable | null;
  areas: Area[];
  onClose: () => void;
}) {
  const refresh = useFloorRefresh();
  const [form, setForm] = useState({ name: '', capacity: '4', areaId: '', isActive: true });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (table) {
      setForm({
        name: table.name,
        capacity: String(table.capacity),
        areaId: table.areaId ?? '',
        isActive: table.isActive,
      });
    }
  }, [table]);

  const save = useMutation({
    mutationFn: () =>
      api(`/tables/${table!.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          capacity: Number(form.capacity) || 1,
          areaId: form.areaId || null,
          isActive: form.isActive,
        },
      }),
    onSuccess: () => {
      refresh();
      toast.success('Table saved');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/tables/${table!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Table removed');
      setConfirming(false);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <Sheet
        open={table !== null}
        onClose={onClose}
        title={`Table ${table?.name ?? ''}`}
        footer={
          <>
            <Button variant="danger" className="mr-auto" onClick={() => setConfirming(true)}>
              Remove
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button form="table-form" type="submit" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form
          id="table-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={20}
                  required
                />
              )}
            </Field>
            <Field label="Seats">
              {(id) => (
                <Input
                  id={id}
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({ ...form, capacity: e.target.value.replace(/\D/g, '').slice(0, 2) })
                  }
                  inputMode="numeric"
                  required
                />
              )}
            </Field>
          </div>
          {areas.length > 0 && (
            <Field label="Area">
              {(id) => (
                <Select
                  id={id}
                  value={form.areaId}
                  onChange={(e) => setForm({ ...form, areaId: e.target.value })}
                >
                  <option value="">No area</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span>
              <span className="block text-[13px] font-medium">In use</span>
              <span className="block text-xs text-ink-faint">Turn off for tables under repair</span>
            </span>
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
          </label>
        </form>
      </Sheet>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove table ${table?.name}?`}
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
        Tables with past orders are switched off instead of deleted.
      </Dialog>
    </>
  );
}

export function AreaSheet({
  area,
  outletId,
  onClose,
  onDeleted,
}: {
  area: Area | 'new' | null;
  outletId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const refresh = useFloorRefresh();
  const isNew = area === 'new';
  const [name, setName] = useState('');

  useEffect(() => {
    if (area) setName(area === 'new' ? '' : area.name);
  }, [area]);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api(`/outlets/${outletId}/areas`, { method: 'POST', body: { name } })
        : api(`/areas/${(area as Area).id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => {
      refresh();
      toast.success(isNew ? 'Area added' : 'Area saved');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/areas/${(area as Area).id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Area deleted');
      onDeleted();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Sheet
      open={area !== null}
      onClose={onClose}
      title={isNew ? 'New area' : 'Edit area'}
      description="Areas group tables, like AC hall, rooftop or garden."
      footer={
        <>
          {!isNew && (
            <Button
              variant="danger"
              className="mr-auto"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="area-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="area-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Name" hint={isNew ? undefined : 'Deleting an area keeps its tables.'}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="AC hall"
              maxLength={40}
              autoFocus
              required
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
