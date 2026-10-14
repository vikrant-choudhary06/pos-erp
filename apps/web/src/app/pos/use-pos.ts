'use client';

import { calculateBill, orderEngine, type OrderType } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { api, isOffline } from '@/lib/api';
import type { Order, PosItem, PosMenu, Shift } from '@/lib/pos-types';
import { useSession } from '@/lib/session';
import { cachedApi, authorizeOfflineOutlet } from '@/offline/cache';
import { db } from '@/offline/db';
import { isLocalMode } from '@/offline/state';

export { useBillHeader } from '@/lib/use-bill-header';

export function usePosMenu(enabled = true) {
  const { outletId } = useSession();
  return useQuery({
    queryKey: ['pos-menu', outletId],
    queryFn: () => cachedApi<PosMenu>(`pos-menu:${outletId}`, `/pos/menu?outletId=${outletId}`),
    enabled: Boolean(outletId) && enabled,
    staleTime: 5 * 60_000,
  });
}

const ACTIVE = ['OPEN', 'BILLED'];

export function useActiveOrders() {
  const { outletId } = useSession();
  return useQuery({
    queryKey: ['orders-active', outletId],
    queryFn: async () => {
      const local = async () => {
        await authorizeOfflineOutlet(outletId);
        return db()
          .orders.where('outletId')
          .equals(outletId)
          .filter((o) => ACTIVE.includes(o.status))
          .sortBy('openedAt');
      };
      if (isLocalMode()) return local();

      try {
        const orders = await api<Order[]>(`/orders/active?outletId=${outletId}`);
        // the server is up to date, so its list replaces whatever the till kept
        await db().transaction('rw', db().orders, async () => {
          await db().orders.where('outletId').equals(outletId).delete();
          await db().orders.bulkPut(orders);
        });
        return orders;
      } catch (err) {
        if (isOffline(err)) return local();
        throw err;
      }
    },
    enabled: Boolean(outletId),
    // events keep this fresh, polling is only a safety net
    refetchInterval: 60_000,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      if (isLocalMode()) {
        const local = await db().orders.get(id!);
        if (local) {
          await authorizeOfflineOutlet(local.outletId);
          return local;
        }
      }
      try {
        const order = await api<Order>(`/orders/${id}`);
        await db().orders.put(order);
        return order;
      } catch (err) {
        const local = isOffline(err) ? await db().orders.get(id!) : undefined;
        if (local) {
          await authorizeOfflineOutlet(local.outletId);
          return local;
        }
        throw err;
      }
    },
    enabled: Boolean(id),
  });
}

export function useShift() {
  const { outletId, can } = useSession();
  return useQuery({
    queryKey: ['shift', outletId],
    queryFn: () =>
      cachedApi<Shift | null>(`shift:${outletId}`, `/shifts/current?outletId=${outletId}`),
    enabled: Boolean(outletId) && can('shift.manage'),
  });
}

export const priceOf = orderEngine.priceOf;

export type Draft = {
  key: string;
  item: PosItem;
  variantId?: string;
  optionIds: string[];
  quantity: number;
  notes?: string;
};

export function draftUnit(draft: Draft, type: OrderType) {
  const options = draft.item.modifierGroups
    .flatMap((g) => g.options)
    .filter((o) => draft.optionIds.includes(o.id));
  return (
    priceOf(draft.item, draft.variantId, type) + options.reduce((s, o) => s + Number(o.price), 0)
  );
}

/** The bill as it will look once the unsent lines are saved. */
export function previewBill(order: Order, drafts: Draft[], menu: PosMenu) {
  return calculateBill({
    lines: [
      ...order.items
        .filter((i) => i.status !== 'CANCELLED')
        .map((i) => ({
          key: i.id,
          unitPrice: Number(i.unitPrice),
          modifiersTotal: Number(i.modifiersTotal),
          quantity: Number(i.quantity),
          taxes: i.taxBreakup.map((t) => ({ name: t.name, rate: Number(t.rate) })),
        })),
      ...drafts.map((d) => ({
        key: d.key,
        unitPrice: draftUnit(d, order.type),
        quantity: d.quantity,
        taxes: d.item.taxes.map((t) => ({ name: t.name, rate: Number(t.rate) })),
      })),
    ],
    discount: order.discount
      ? { type: order.discount.type, value: Number(order.discount.value) }
      : null,
    serviceChargePercent: order.type === 'DINE_IN' ? menu.outlet.settings.serviceChargePercent : 0,
    priceIncludesTax: menu.outlet.priceIncludesTax,
  });
}

export function elapsed(from: string, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
