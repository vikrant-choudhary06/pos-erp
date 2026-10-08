'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FoodMark, Skeleton } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { MenuItem } from '@/lib/types';

type Station = { id: string; name: string; isActive: boolean; _count: { menuItems: number } };

/** Kitchen sections (tandoor, bar...) for the current outlet. Each KOT is split by station. */
export function Stations() {
  const { outletId, me } = useSession();
  const [editing, setEditing] = useState<Station | 'new' | null>(null);
  const stations = useQuery({
    queryKey: ['stations', outletId],
    queryFn: () => api<Station[]>(`/outlets/${outletId}/stations`),
    enabled: Boolean(outletId),
  });
  const outletName = me.outlets.find((o) => o.id === outletId)?.name;

  return (
    <>
      {stations.isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : (
        <div className="rounded-2xl border border-line bg-card">
          {stations.data?.length ? (
            <ul className="divide-y divide-line">
              {stations.data.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setEditing(s)}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-paper/60"
                  >
                    <ChefHat className="size-4 text-ink-faint" strokeWidth={1.8} />
                    <span className="flex-1 text-sm">{s.name}</span>
                    <span className="tabular text-xs text-ink-faint">
                      {s._count.menuItems} items
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-[13px] text-ink-soft">
              No stations at {outletName}. Every KOT goes to one kitchen.
            </p>
          )}
          <div className="border-t border-line px-5 py-3">
            <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
              Add station
            </Button>
          </div>
        </div>
      )}
      <StationSheet station={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function StationSheet({
  station,
  onClose,
}: {
  station: Station | 'new' | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { outletId } = useSession();
  const existing = station && station !== 'new' ? station : null;
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const items = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => api<MenuItem[]>('/menu/items'),
    enabled: Boolean(existing),
  });
  const assigned = useQuery({
    queryKey: ['station-items', existing?.id],
    queryFn: () => api<string[]>(`/stations/${existing!.id}/items`),
    enabled: Boolean(existing),
  });

  useEffect(() => {
    if (station) setName(existing?.name ?? '');
  }, [station]);
  useEffect(() => {
    if (assigned.data) setPicked(assigned.data);
  }, [assigned.data]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of items.data ?? []) {
      groups.set(item.category.name, [...(groups.get(item.category.name) ?? []), item]);
    }
    return [...groups.entries()];
  }, [items.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stations'] });
    queryClient.invalidateQueries({ queryKey: ['station-items'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!existing)
        return api(`/outlets/${outletId}/stations`, { method: 'POST', body: { name } });
      await api(`/stations/${existing.id}`, { method: 'PATCH', body: { name } });
      await api(`/stations/${existing.id}/items`, { method: 'PUT', body: { menuItemIds: picked } });
    },
    onSuccess: () => {
      refresh();
      toast.success(existing ? 'Station saved' : 'Station added. Open it to pick its items.');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/stations/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Station removed');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleAll = (ids: string[], on: boolean) =>
    setPicked((list) =>
      on ? [...new Set([...list, ...ids])] : list.filter((id) => !ids.includes(id)),
    );

  return (
    <Sheet
      open={station !== null}
      onClose={onClose}
      title={existing ? existing.name : 'New station'}
      description={
        existing
          ? 'Pick the dishes made here. Everything else goes to the main kitchen.'
          : undefined
      }
      width="lg"
      footer={
        <>
          {existing && (
            <Button
              variant="danger"
              className="mr-auto"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tandoor, Bar, Chinese…"
              maxLength={40}
              autoFocus={!existing}
            />
          )}
        </Field>

        {existing &&
          (items.isLoading || assigned.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="space-y-5">
              {byCategory.map(([category, list]) => {
                const ids = list.map((i) => i.id);
                const all = ids.every((id) => picked.includes(id));
                return (
                  <div key={category}>
                    <label className="mb-2 flex cursor-pointer items-center gap-2.5 text-xs font-medium tracking-wide text-ink-faint uppercase">
                      <Checkbox checked={all} onChange={(on) => toggleAll(ids, on)} />
                      {category}
                    </label>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {list.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-[13px] hover:bg-paper"
                        >
                          <Checkbox
                            checked={picked.includes(item.id)}
                            onChange={(on) => toggleAll([item.id], on)}
                          />
                          <FoodMark type={item.foodType} className="size-3" />
                          {item.name}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </Sheet>
  );
}
