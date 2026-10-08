'use client';

import { businessDate, financialYear, type OrderType, type PaymentMethod } from '@pos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api, isOffline } from '@/lib/api';
import { newId } from '@/lib/id';
import type { Kot, Order, OrderItem, PosMenu, Shift } from '@/lib/pos-types';
import { useSession } from '@/lib/session';
import { db } from '@/offline/db';
import * as engine from '@/offline/engine';
import { isLocalMode } from '@/offline/state';
import { enqueue, flush } from '@/offline/sync';
import { nextTillNumber } from '@/offline/till';
import type { Draft } from './use-pos';

const ACTIVE = ['OPEN', 'BILLED'];

class OfflineError extends Error {}
const needsConnection = (what: string) => new OfflineError(`${what} needs an internet connection`);

/**
 * Everything the POS does to an order. Online it talks to the API as usual;
 * without a connection (or while offline work is still syncing) it changes the
 * till's own copy and queues the same request for later.
 */
export function usePosActions(menu: PosMenu) {
  const queryClient = useQueryClient();
  const { outletId, can } = useSession();

  async function show(order: Order) {
    await db().orders.put(order);
    queryClient.setQueryData(['order', order.id], order);
    queryClient.invalidateQueries({ queryKey: ['orders-active'] });
  }

  // try the server first; if the connection drops on the way, do it locally
  async function either<T>(online: () => Promise<T>, offline: () => Promise<T>) {
    if (isLocalMode()) return offline();
    try {
      return await online();
    } catch (err) {
      if (isOffline(err)) return offline();
      throw err;
    }
  }

  async function queue(
    order: Order,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    label: string,
    body?: unknown,
  ) {
    await enqueue({ orderId: order.id, method, path, body, label });
    void flush(queryClient);
  }

  const today = () => businessDate(new Date(), menu.outlet.timezone, menu.outlet.dayStartTime);

  async function localNumber(kind: 'order' | 'kot') {
    const { till, value } = await nextTillNumber(`${kind}:${today()}`).catch(() => {
      throw new OfflineError(
        'Billing offline needs this browser set up as a till (Settings → POS devices)',
      );
    });
    return kind === 'order' ? `${till.code}-${value}` : `${till.code}-K${value}`;
  }

  async function localInvoiceNo() {
    const fy = financialYear(today());
    const { till, value } = await nextTillNumber(`invoice:${fy}`);
    return `${till.outletCode}/${fy.slice(2)}/${till.code}-${String(value).padStart(5, '0')}`;
  }

  async function localActive() {
    const orders = await db().orders.where('outletId').equals(outletId).toArray();
    return orders.filter((o) => ACTIVE.includes(o.status));
  }

  async function checkTableFree(tableId: string, exceptId?: string) {
    const busy = (await localActive()).find((o) => o.tableId === tableId && o.id !== exceptId);
    if (busy) throw new OfflineError(`That table already has order #${busy.orderNo}`);
  }

  async function sendLines(order: Order, drafts: Draft[]) {
    if (!drafts.length) return order;
    const items = drafts.map((d) => ({
      id: d.key,
      menuItemId: d.item.id,
      variantId: d.variantId,
      quantity: d.quantity,
      notes: d.notes,
      modifierOptionIds: d.optionIds.length ? d.optionIds : undefined,
    }));
    return either(
      async () => {
        const saved = await api<Order>(`/orders/${order.id}/items`, {
          method: 'POST',
          body: { items },
        });
        await show(saved);
        return saved;
      },
      async () => {
        const next = engine.addItems(
          order,
          drafts.map((d) => ({ ...d, id: d.key })),
          menu,
        );
        await show(next);
        await queue(order, 'POST', `/orders/${order.id}/items`, `Items on #${order.orderNo}`, {
          items,
        });
        return next;
      },
    );
  }

  async function bill(order: Order, drafts: Draft[]): Promise<{ order: Order; kots: Kot[] }> {
    const saved = await sendLines(order, drafts);
    if (saved.status !== 'OPEN') return { order: saved, kots: [] };
    return either<{ order: Order; kots: Kot[] }>(
      async () => {
        const billed = await api<Order>(`/orders/${order.id}/bill`, { method: 'POST', body: {} });
        await show(billed);
        return { order: billed, kots: [] };
      },
      async () => {
        if (!saved.items.some((i) => i.status !== 'CANCELLED'))
          throw new Error('Add items before printing the bill');
        const invoiceNo = await localInvoiceNo();
        const result = engine.bill(saved, invoiceNo, await localNumber('kot'), menu);
        await show(result.order);
        await queue(result.order, 'POST', `/orders/${order.id}/bill`, `Bill ${invoiceNo}`, {
          invoiceNo,
          issuedAt: result.issuedAt,
        });
        return { order: result.order, kots: result.kot ? [result.kot] : [] };
      },
    );
  }

  return {
    async createOrder(input: { type: OrderType; tableId?: string }) {
      const id = newId();
      return either(
        async () => {
          const order = await api<Order>('/orders', {
            method: 'POST',
            body: { id, outletId, ...input },
          });
          await show(order);
          return order;
        },
        async () => {
          if (input.tableId) await checkTableFree(input.tableId);
          const orderNo = await localNumber('order');
          const table = menu.tables.find((t) => t.id === input.tableId);
          const order = engine.newOrder({
            id,
            outletId,
            orderNo,
            businessDate: today(),
            type: input.type,
            table: table ? { id: table.id, name: table.name } : null,
          });
          await show(order);
          await queue(order, 'POST', '/orders', `New order #${orderNo}`, {
            id,
            outletId,
            ...input,
            orderNo,
            openedAt: order.openedAt,
          });
          return order;
        },
      );
    },

    sendLines,

    async setQuantity(order: Order, item: OrderItem, quantity: number) {
      const path =
        quantity <= 0
          ? `/orders/${order.id}/items/${item.id}/cancel`
          : `/orders/${order.id}/items/${item.id}`;
      const method = quantity <= 0 ? 'POST' : 'PATCH';
      const body = quantity <= 0 ? {} : { quantity };
      return either(
        async () => show(await api<Order>(path, { method, body })),
        async () => {
          if (item.status !== 'PENDING') throw needsConnection('Changing items already sent');
          await show(engine.setQuantity(order, item.id, quantity, menu));
          await queue(order, method, path, `Quantity on #${order.orderNo}`, body);
        },
      );
    },

    async cancelSent(order: Order, item: OrderItem, reason: string) {
      if (isLocalMode()) throw needsConnection('Cancelling an item after the KOT');
      await show(
        await api<Order>(`/orders/${order.id}/items/${item.id}/cancel`, {
          method: 'POST',
          body: { reason },
        }),
      );
    },

    /** Saves the new lines and sends them to the kitchen. Returns the KOTs to print. */
    async sendKot(order: Order, drafts: Draft[]): Promise<Kot[]> {
      const saved = await sendLines(order, drafts);
      return either(
        async () => {
          const kots = await api<Kot[]>(`/orders/${order.id}/kot`, { method: 'POST' });
          await show(await api<Order>(`/orders/${order.id}`));
          return kots;
        },
        async () => {
          const { order: next, kot } = engine.sendToKitchen(saved, await localNumber('kot'));
          if (!kot) throw new Error('Nothing new to send to the kitchen');
          await show(next);
          await queue(next, 'POST', `/orders/${order.id}/kot`, `KOT for #${order.orderNo}`);
          return [kot];
        },
      );
    },

    bill,

    async pay(
      order: Order,
      payments: { id: string; method: PaymentMethod; amount: number; reference?: string }[],
    ): Promise<{ order: Order; change: number }> {
      return either(
        async () => {
          const res = await api<{ order: Order; change: number }>(`/orders/${order.id}/payments`, {
            method: 'POST',
            body: { payments },
          });
          await show(res.order);
          return res;
        },
        async () => {
          if (can('shift.manage')) {
            const shift = queryClient.getQueryData<Shift | null>(['shift', outletId]);
            if (!shift) throw new OfflineError('Open a cash shift before taking payments');
          }
          let current = order;
          if (current.status === 'OPEN') current = (await bill(current, [])).order;
          const result = engine.pay(current, payments);
          await show(result.order);
          await queue(
            result.order,
            'POST',
            `/orders/${order.id}/payments`,
            `Payment on #${order.orderNo}`,
            {
              payments,
              paidAt: new Date().toISOString(),
            },
          );
          return result;
        },
      );
    },

    async setDiscount(
      order: Order,
      discount: { type: 'PERCENT' | 'FLAT'; value: number; reason?: string } | null,
    ) {
      const path = `/orders/${order.id}/discount`;
      return either(
        async () =>
          show(
            await api<Order>(
              path,
              discount ? { method: 'PUT', body: discount } : { method: 'DELETE' },
            ),
          ),
        async () => {
          await show(engine.setDiscount(order, discount, menu));
          await queue(
            order,
            discount ? 'PUT' : 'DELETE',
            path,
            `Discount on #${order.orderNo}`,
            discount ?? undefined,
          );
        },
      );
    },

    async update(
      order: Order,
      patch: {
        tableId?: string;
        covers?: number;
        customerName?: string;
        customerPhone?: string;
        notes?: string;
      },
    ) {
      return either(
        async () => show(await api<Order>(`/orders/${order.id}`, { method: 'PATCH', body: patch })),
        async () => {
          if (patch.tableId) await checkTableFree(patch.tableId, order.id);
          await show(engine.update(order, patch, menu));
          await queue(order, 'PATCH', `/orders/${order.id}`, `Changes to #${order.orderNo}`, patch);
        },
      );
    },

    async voidOrder(order: Order, reason: string) {
      return either(
        async () =>
          show(await api<Order>(`/orders/${order.id}/void`, { method: 'POST', body: { reason } })),
        async () => {
          if (!order.items.every((i) => i.status === 'PENDING'))
            throw needsConnection('Voiding an order');
          await show({ ...order, status: 'VOID', voidReason: reason });
          await queue(order, 'POST', `/orders/${order.id}/void`, `Cancel #${order.orderNo}`, {
            reason,
          });
        },
      );
    },

    async reopen(order: Order, reason: string) {
      if (isLocalMode()) throw needsConnection('Reopening a bill');
      await show(
        await api<Order>(`/orders/${order.id}/reopen`, { method: 'POST', body: { reason } }),
      );
    },
  };
}
