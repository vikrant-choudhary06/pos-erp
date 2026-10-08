'use client';

import { calculateBill, type OrderType } from '@pos/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '@/lib/api';
import type { Order, PosItem, PosMenu, Shift } from '@/lib/pos-types';
import { useSession } from '@/lib/session';

export { useBillHeader } from '@/lib/use-bill-header';

export function usePosMenu() {
  const { outletId } = useSession();
  return useQuery({
    queryKey: ['pos-menu', outletId],
    queryFn: () => api<PosMenu>(`/pos/menu?outletId=${outletId}`),
    enabled: Boolean(outletId),
    staleTime: 5 * 60_000,
  });
}

export function useActiveOrders() {
  const { outletId } = useSession();
  return useQuery({
    queryKey: ['orders-active', outletId],
    queryFn: () => api<Order[]>(`/orders/active?outletId=${outletId}`),
    enabled: Boolean(outletId),
    // events keep this fresh, polling is only a safety net
    refetchInterval: 60_000,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => api<Order>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useShift() {
  const { outletId, can } = useSession();
  return useQuery({
    queryKey: ['shift', outletId],
    queryFn: () => api<Shift | null>(`/shifts/current?outletId=${outletId}`),
    enabled: Boolean(outletId) && can('shift.manage'),
  });
}

/** Put a fresh order from the API into the cache so the screen updates at once. */
export function useOrderCache() {
  const queryClient = useQueryClient();
  return useCallback(
    (order: Order) => {
      queryClient.setQueryData(['order', order.id], order);
      queryClient.invalidateQueries({ queryKey: ['orders-active'] });
    },
    [queryClient],
  );
}

export function priceOf(item: PosItem, variantId: string | undefined, type: OrderType) {
  const override = item.prices.find(
    (p) => p.orderType === type && (p.variantId ?? undefined) === variantId,
  );
  const variant = item.variants.find((v) => v.id === variantId);
  return Number(override?.price ?? variant?.price ?? item.basePrice);
}

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
