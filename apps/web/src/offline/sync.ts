import type { QueryClient } from '@tanstack/react-query';
import { api, ApiError, isOffline } from '@/lib/api';
import type { Order } from '@/lib/pos-types';
import { db, type Mutation } from './db';
import { getOfflineState, setOfflineState } from './state';

// Replies that mean "this already happened", which is fine when replaying
const ALREADY_DONE = ['Nothing new to send to the kitchen', 'Already voided'];

export async function enqueue(mutation: Omit<Mutation, 'status' | 'createdAt'>) {
  await db().outbox.add({ ...mutation, status: 'pending', createdAt: new Date().toISOString() });
  await refreshCounts();
}

export async function refreshCounts() {
  const [pending, failed] = await Promise.all([
    db().outbox.where('status').equals('pending').count(),
    db().outbox.where('status').equals('failed').count(),
  ]);
  setOfflineState({ pending, failed });
}

let running = false;

/**
 * Send the outbox to the server, oldest first. Stops at the first network
 * error and tries again later; a request the server refuses is parked as
 * failed, together with anything after it for the same order.
 */
export async function flush(queryClient: QueryClient) {
  if (running || !getOfflineState().online) return;
  running = true;
  setOfflineState({ syncing: true });

  try {
    for (;;) {
      const next = await db().outbox.where('status').equals('pending').first();
      if (!next) break;

      try {
        const result = await api<unknown>(next.path, { method: next.method, body: next.body });
        await db().outbox.delete(next.seq!);
        await keepServerCopy(next.orderId, result);
      } catch (err) {
        if (isOffline(err)) break;
        if (err instanceof ApiError && err.status >= 500) break;

        const message = err instanceof Error ? err.message : 'Could not sync';
        if (ALREADY_DONE.includes(message)) {
          await db().outbox.delete(next.seq!);
          continue;
        }
        await db()
          .outbox.where('orderId')
          .equals(next.orderId)
          .modify((m) => {
            if (m.status === 'pending') {
              m.status = 'failed';
              m.error = m.seq === next.seq ? message : 'Skipped because an earlier step failed';
            }
          });
      }
      await refreshCounts();
    }
  } finally {
    running = false;
    await refreshCounts();
    setOfflineState({ syncing: false });
    queryClient.invalidateQueries({ queryKey: ['orders-active'] });
    queryClient.invalidateQueries({ queryKey: ['order'] });
  }
}

/** Once nothing else is queued for an order, the server's copy wins. */
async function keepServerCopy(orderId: string, result: unknown) {
  const order = (
    result && typeof result === 'object' && 'order' in result ? result.order : result
  ) as Order;
  if (!order || typeof order !== 'object' || order.id !== orderId || !Array.isArray(order.items))
    return;
  const queued = await db().outbox.where('orderId').equals(orderId).count();
  if (!queued) await db().orders.put(order);
}

export async function failedMutations() {
  return db().outbox.where('status').equals('failed').toArray();
}

export async function dismissFailed(seq: number) {
  await db().outbox.delete(seq);
  await refreshCounts();
}
