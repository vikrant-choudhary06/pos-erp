import type { Kot, Order } from '@pos/shared';
import { isDown, type Cloud } from './cloud';
import { parseJson } from './http';
import type { Queued, Store } from './store';

// Replies that mean "this already happened", fine when replaying
const ALREADY_DONE = ['Nothing new to send to the kitchen', 'Already voided'];

/**
 * Sends the queue to the cloud, oldest first. Returns false if the cloud went
 * away half way; the rest stays queued for next time. A request the cloud
 * refuses is parked with its error, along with anything after it for the
 * same order, so one bad order never holds up the others.
 */
export async function drain(store: Store, cloud: Cloud): Promise<boolean> {
  const { data } = store;

  while (data.outbox.length) {
    const next = data.outbox[0];
    const path = rewrite(store, next.path);
    if (!path) {
      // a ticket status for a KOT the cloud never got, nothing left to do
      data.outbox.shift();
      continue;
    }

    let reply;
    try {
      reply = await cloud.request(next.method, `/api${path}`, {
        session: next.session,
        body: next.body,
        timeout: 15_000,
      });
    } catch {
      return false;
    }
    if (isDown(reply.status) || reply.status >= 500) return false;

    data.outbox.shift();
    const result = parseJson(reply.body);

    if (reply.status < 300) {
      if (next.localKotId) rememberKot(store, next.localKotId, result);
      keepServerCopy(store, next.orderId, result);
    } else {
      const message = result?.message ?? `Refused (${reply.status})`;
      if (!ALREADY_DONE.includes(message)) park(store, next, String(message));
    }
    store.flush();
  }
  return true;
}

function rewrite(store: Store, path: string) {
  const ticket = path.match(/^\/kitchen\/tickets\/(local-.+)$/);
  if (!ticket) return path;
  const real = store.data.kotIds[ticket[1]];
  return real ? `/kitchen/tickets/${real}` : null;
}

function rememberKot(store: Store, localId: string, result: unknown) {
  let kots: { id: string; createdAt: string }[] = [];
  if (Array.isArray(result)) kots = result as Kot[];
  else if (result && typeof result === 'object' && 'kots' in result) kots = (result as Order).kots;
  const newest = [...kots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (newest) store.data.kotIds[localId] = newest.id;
}

function park(store: Store, failed: Queued, message: string) {
  const { data } = store;
  data.failed.push({ ...failed, error: message });
  const later = data.outbox.filter((m) => m.orderId === failed.orderId);
  data.outbox = data.outbox.filter((m) => m.orderId !== failed.orderId);
  for (const m of later)
    data.failed.push({ ...m, error: 'Skipped because an earlier step failed' });
}

/** Once nothing else is queued for an order, the cloud's copy wins. */
function keepServerCopy(store: Store, orderId: string, result: unknown) {
  const order = (
    result && typeof result === 'object' && 'order' in result ? result.order : result
  ) as Order | undefined;
  if (!order || typeof order !== 'object' || order.id !== orderId || !Array.isArray(order.items)) {
    return;
  }
  if (!store.data.outbox.some((m) => m.orderId === orderId)) store.putOrder(order);
}
