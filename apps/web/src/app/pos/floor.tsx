'use client';

import { formatMoney, ORDER_TYPES, type OrderType } from '@pos/shared';
import { useMutation } from '@tanstack/react-query';
import * as m from 'motion/react-m';
import { Bike, Plus, ShoppingBag, Store, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Tabs } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Order, PosMenu } from '@/lib/pos-types';
import { usePosActions } from './actions';
import { elapsed, useActiveOrders } from './use-pos';

const ALL = 'all';

const QUICK: { type: OrderType; icon: typeof Store }[] = [
  { type: 'TAKEAWAY', icon: ShoppingBag },
  { type: 'COUNTER', icon: Store },
  { type: 'DELIVERY', icon: Bike },
];

export function Floor({ menu, onOpen }: { menu: PosMenu; onOpen: (id: string) => void }) {
  const orders = useActiveOrders();
  const actions = usePosActions(menu);
  const [area, setArea] = useState(ALL);
  const now = useNow();

  const byTable = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of orders.data ?? []) if (o.tableId) map.set(o.tableId, o);
    return map;
  }, [orders.data]);

  const others = (orders.data ?? []).filter((o) => !o.tableId);
  const tables = menu.tables.filter((t) => area === ALL || t.areaId === area);

  const create = useMutation({
    mutationFn: (body: { type: OrderType; tableId?: string }) => actions.createOrder(body),
    onSuccess: (order) => onOpen(order.id),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Tables</h1>
          {menu.areas.length > 0 && (
            <Tabs
              value={area}
              onChange={setArea}
              options={[
                { value: ALL, label: 'All' },
                ...menu.areas.map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          )}
        </div>

        {menu.tables.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-sm text-ink-soft">
            No tables set up. Use takeaway or counter orders, or add tables from the dashboard.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
            {tables.map((table, i) => {
              const order = byTable.get(table.id);
              const billed = order?.status === 'BILLED';
              return (
                <m.button
                  key={table.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.012, 0.18), duration: 0.2 }}
                  disabled={create.isPending}
                  aria-label={`Table ${table.name}${order ? `, order ${order.orderNo}` : ', free'}`}
                  onClick={() =>
                    order ? onOpen(order.id) : create.mutate({ type: 'DINE_IN', tableId: table.id })
                  }
                  className={cn(
                    'flex aspect-[5/4] flex-col justify-between rounded-2xl border p-3 text-left',
                    'transition-[transform,background-color,border-color] duration-150 active:scale-[0.97]',
                    order
                      ? billed
                        ? 'border-ink bg-card ring-2 ring-ink ring-inset'
                        : 'border-ink bg-ink text-white'
                      : 'border-line bg-card hover:border-line-strong',
                  )}
                >
                  <span className="flex items-start justify-between">
                    <span className="text-base font-semibold">{table.name}</span>
                    {billed && (
                      <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium text-white">
                        BILL
                      </span>
                    )}
                  </span>
                  {order ? (
                    <span className="tabular text-xs">
                      <span className="block font-medium">{formatMoney(order.grandTotal)}</span>
                      <span className={billed ? 'text-ink-faint' : 'text-white/60'}>
                        #{order.orderNo} · {elapsed(order.openedAt, now)}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-ink-faint">
                      <Users className="size-3" /> {table.capacity}
                    </span>
                  )}
                </m.button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="flex shrink-0 flex-col border-t border-line bg-card lg:w-80 lg:border-t-0 lg:border-l">
        <div className="grid grid-cols-3 gap-2 p-4">
          {QUICK.map(({ type, icon: Icon }) => (
            <button
              key={type}
              disabled={create.isPending}
              onClick={() => create.mutate({ type })}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line px-2 py-3 text-xs transition-[border-color,transform] hover:border-line-strong active:scale-[0.97]"
            >
              <Icon className="size-4" strokeWidth={1.8} />
              {ORDER_TYPES[type]}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">Open orders</p>
          <span className="tabular text-xs text-ink-faint">{orders.data?.length ?? 0}</span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto pb-4">
          {others.length === 0 && (
            <li className="px-4 py-6 text-center text-[13px] text-ink-faint">
              Takeaway and counter orders show up here
            </li>
          )}
          {others.map((order) => (
            <li key={order.id}>
              <button
                onClick={() => onOpen(order.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-paper"
              >
                <span>
                  <span className="block text-sm">
                    #{order.orderNo} · {ORDER_TYPES[order.type]}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {order.customerName ??
                      order.customerPhone ??
                      `${elapsed(order.openedAt, now)} ago`}
                  </span>
                </span>
                <span className="tabular text-right text-sm">
                  {formatMoney(order.grandTotal)}
                  {order.status === 'BILLED' && (
                    <span className="block text-[10px] font-medium tracking-wide text-ink-faint">
                      BILLED
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          disabled={create.isPending}
          onClick={() => create.mutate({ type: 'COUNTER' })}
          className="m-4 mt-0 hidden h-11 items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-white hover:bg-ink/85 lg:flex"
        >
          <Plus className="size-4" /> Quick bill
        </button>
      </aside>
    </div>
  );
}

/** Re-render every half minute so the timers on tables move. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
