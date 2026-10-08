'use client';

import { formatMoney } from '@pos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { api, errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import { useSession } from '@/lib/session';

export type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { id: string; name: string; price: string }[];
  _count: { items: number };
};

export function useModifierGroups() {
  return useQuery({
    queryKey: ['modifier-groups'],
    queryFn: () => api<ModifierGroup[]>('/menu/modifier-groups'),
  });
}

/** Add-on groups like "Extra toppings" or "Spice level", shared by many items. */
export function AddOns() {
  const { can } = useSession();
  const groups = useModifierGroups();
  const [editing, setEditing] = useState<ModifierGroup | 'new' | null>(null);
  const editable = can('menu.manage');

  if (groups.isLoading) return <Skeleton className="h-48 rounded-2xl" />;

  return (
    <>
      {!groups.data?.length ? (
        <EmptyState
          title="No add-ons yet"
          body="Create a group like “Extra toppings” once and attach it to every pizza."
          action={
            editable && (
              <Button onClick={() => setEditing('new')}>
                <Plus className="size-4" /> New add-on group
              </Button>
            )
          }
        />
      ) : (
        <>
          {editable && (
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" onClick={() => setEditing('new')}>
                <Plus className="size-4" /> New add-on group
              </Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.data.map((g) => (
              <button
                key={g.id}
                onClick={() => editable && setEditing(g)}
                disabled={!editable}
                className="rounded-2xl border border-line bg-card p-5 text-left transition-colors enabled:hover:border-line-strong"
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold">{g.name}</p>
                  <span className="text-xs text-ink-faint">
                    {g._count.items} {g._count.items === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-faint">{rule(g)}</p>
                <p className="mt-3 line-clamp-2 text-[13px] text-ink-soft">
                  {g.options
                    .map((o) => `${o.name}${Number(o.price) ? ` ${formatMoney(o.price)}` : ''}`)
                    .join(' · ')}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
      <GroupSheet group={editing} onClose={() => setEditing(null)} />
    </>
  );
}

const rule = (g: { minSelect: number; maxSelect: number }) =>
  g.minSelect === 0
    ? g.maxSelect === 1
      ? 'Optional, pick one'
      : `Optional, up to ${g.maxSelect}`
    : g.minSelect === g.maxSelect
      ? `Must pick ${g.minSelect}`
      : `Pick ${g.minSelect} to ${g.maxSelect}`;

type Row = { key: string; id?: string; name: string; price: string };

function GroupSheet({
  group,
  onClose,
}: {
  group: ModifierGroup | 'new' | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const existing = group && group !== 'new' ? group : null;
  const [name, setName] = useState('');
  const [required, setRequired] = useState(false);
  const [max, setMax] = useState('1');
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!group) return;
    setName(existing?.name ?? '');
    setRequired(Boolean(existing?.minSelect));
    setMax(String(existing?.maxSelect ?? 1));
    setRows(
      existing
        ? existing.options.map((o) => ({
            key: o.id,
            id: o.id,
            name: o.name,
            price: String(Number(o.price)),
          }))
        : [{ key: newId(), name: '', price: '' }],
    );
  }, [group]);

  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['modifier-groups'] });
    queryClient.invalidateQueries({ queryKey: ['menu-items'] });
    queryClient.invalidateQueries({ queryKey: ['pos-menu'] });
    toast.success(message);
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const maxSelect = Math.max(1, Number(max) || 1);
      const body = {
        name,
        minSelect: required ? 1 : 0,
        maxSelect,
        options: rows
          .filter((r) => r.name.trim())
          .map((r) => ({ id: r.id, name: r.name, price: Number(r.price) || 0 })),
      };
      return existing
        ? api(`/menu/modifier-groups/${existing.id}`, { method: 'PUT', body })
        : api('/menu/modifier-groups', { method: 'POST', body });
    },
    onSuccess: () => done(existing ? 'Saved' : 'Add-on group created'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/menu/modifier-groups/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => done('Deleted'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <Sheet
      open={group !== null}
      onClose={onClose}
      title={existing ? existing.name : 'New add-on group'}
      footer={
        <>
          {existing && (
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
          <Button form="group-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="group-form"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Group name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Extra toppings"
              required
              autoFocus={!existing}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2.5 rounded-xl border border-line px-4 py-3 text-[13px]">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="size-4 accent-ink"
            />
            Guest must choose
          </label>
          <Field label="Most they can pick">
            {(id) => (
              <Input
                id={id}
                value={max}
                onChange={(e) => setMax(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                className="tabular"
              />
            )}
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-medium">Options</p>
          {rows.map((r) => (
            <div key={r.key} className="flex gap-2">
              <Input
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                placeholder="Extra cheese"
                aria-label="Option name"
                maxLength={40}
              />
              <div className="relative w-32 shrink-0">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-faint">
                  ₹
                </span>
                <Input
                  value={r.price}
                  onChange={(e) =>
                    /^\d*\.?\d{0,2}$/.test(e.target.value) &&
                    update(r.key, { price: e.target.value })
                  }
                  inputMode="decimal"
                  placeholder="0"
                  className="tabular pl-7"
                  aria-label="Option price"
                />
              </div>
              <button
                type="button"
                onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                disabled={rows.length === 1}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-faint hover:text-ink disabled:opacity-30"
                aria-label="Remove option"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => setRows([...rows, { key: newId(), name: '', price: '' }])}
          >
            <Plus className="size-3.5" /> Add option
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
