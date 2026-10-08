'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Pencil, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import type { Area, DiningTable } from '@/lib/types';
import { AreaSheet, BulkTablesSheet, TableSheet } from './sheets';

export type Floor = { areas: Area[]; tables: DiningTable[] };

const ALL = 'all';
const NO_AREA = 'none';

export default function TablesPage() {
  const { me, outletId, can } = useSession();
  const editable = can('tables.manage');
  const outlet = me.outlets.find((o) => o.id === outletId);

  const [areaFilter, setAreaFilter] = useState(ALL);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [editingArea, setEditingArea] = useState<Area | 'new' | null>(null);
  const [adding, setAdding] = useState(false);

  const floor = useQuery({
    queryKey: ['floor', outletId],
    queryFn: () => api<Floor>(`/outlets/${outletId}/floor`),
    enabled: Boolean(outletId),
  });

  const areas = floor.data?.areas ?? [];
  const tables = floor.data?.tables ?? [];
  const hasUnassigned = areas.length > 0 && tables.some((t) => !t.areaId);

  const visible = useMemo(() => {
    if (areaFilter === ALL) return tables;
    if (areaFilter === NO_AREA) return tables.filter((t) => !t.areaId);
    return tables.filter((t) => t.areaId === areaFilter);
  }, [tables, areaFilter]);

  const seats = tables.filter((t) => t.isActive).reduce((sum, t) => sum + t.capacity, 0);
  const currentArea = areas.find((a) => a.id === areaFilter);

  return (
    <>
      <PageHeader
        title="Tables"
        description={
          floor.isSuccess && tables.length
            ? `${outlet?.name} · ${tables.length} tables, ${seats} seats`
            : outlet?.name
        }
        actions={
          editable && (
            <>
              <Button variant="secondary" onClick={() => setEditingArea('new')}>
                Add area
              </Button>
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add tables
              </Button>
            </>
          )
        }
      />

      {areas.length > 0 && (
        <div className="mb-6 flex items-center gap-2 overflow-x-auto">
          <Tabs
            value={areaFilter}
            onChange={setAreaFilter}
            options={[
              { value: ALL, label: 'All' },
              ...areas.map((a) => ({ value: a.id, label: a.name })),
              ...(hasUnassigned ? [{ value: NO_AREA, label: 'No area' }] : []),
            ]}
          />
          {editable && currentArea && (
            <button
              onClick={() => setEditingArea(currentArea)}
              className="rounded-lg p-2 text-ink-faint hover:bg-ink/[0.04] hover:text-ink"
              aria-label="Edit area"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {floor.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <EmptyState
          title="No tables yet"
          body="Add your tables so waiters can take orders by table. Takeaway-only places can skip this."
          action={
            editable && (
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add tables
              </Button>
            )
          }
        />
      ) : (
        <m.ul layout className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((table, i) => (
              <m.li
                key={table.id}
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1, transition: { delay: Math.min(i * 0.015, 0.2) } }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              >
                <button
                  onClick={() => editable && setEditingTable(table)}
                  disabled={!editable}
                  className={cn(
                    'flex aspect-square w-full flex-col justify-between rounded-2xl border border-line bg-card p-4 text-left',
                    'transition-[border-color,transform,box-shadow] duration-200',
                    'enabled:hover:-translate-y-0.5 enabled:hover:border-line-strong enabled:hover:shadow-md enabled:hover:shadow-black/[0.04]',
                    !table.isActive && 'border-dashed bg-transparent opacity-60',
                  )}
                >
                  <span className="text-lg font-semibold tracking-tight">{table.name}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-faint">
                    <Users className="size-3" />
                    {table.capacity}
                    {!table.isActive && ' · off'}
                  </span>
                </button>
              </m.li>
            ))}
          </AnimatePresence>
        </m.ul>
      )}

      <BulkTablesSheet
        open={adding}
        onClose={() => setAdding(false)}
        outletId={outletId}
        areas={areas}
        tables={tables}
        defaultAreaId={currentArea?.id}
      />
      <TableSheet table={editingTable} areas={areas} onClose={() => setEditingTable(null)} />
      <AreaSheet
        area={editingArea}
        outletId={outletId}
        onClose={() => setEditingArea(null)}
        onDeleted={() => setAreaFilter(ALL)}
      />
    </>
  );
}
