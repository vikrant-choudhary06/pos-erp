import {
  businessDate,
  financialYear,
  orderEngine as engine,
  type Kot,
  type Order,
  type OrderType,
  type PosMenu,
} from '@pos/shared';
import type { LocalEvents } from './events';
import { hash, HttpError } from './http';
import type { Store } from './store';
import { validateMutation } from './validation';

// The part of the API the shop needs while the cloud is away: taking orders,
// KOTs, bills, payments and the kitchen screen. Each change is applied to the
// hub's copy with the same order engine the tills use, then queued so the
// cloud can replay it later. Anything else answers "needs a connection".

type Me = {
  offlineExpiresAt: string;
  user: { id: string; name: string; isOwner: boolean };
  permissions: string[];
  outlets: { id: string }[];
};

export type Reply = { status: number; body?: unknown };

const ACTIVE = ['OPEN', 'BILLED'];
const KITCHEN = ['NEW', 'PREPARING', 'READY'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const needsConnection = (what = 'This') =>
  new HttpError(400, `${what} needs an internet connection`);
const bad = (message: string) => new HttpError(400, message);

export class LocalApi {
  constructor(
    private store: Store,
    private events: LocalEvents,
  ) {}

  meFor(session: string | undefined) {
    if (session && this.store.data.revokedSessions[hash(session)]) return undefined;
    const me = session
      ? (this.store.data.cache[`me:${hash(session)}`] as Me | undefined)
      : undefined;
    return me && Date.parse(me.offlineExpiresAt) > Date.now() ? me : undefined;
  }

  authorizeOutlet(session: string | undefined, outletId: string) {
    const me = this.meFor(session);
    if (!me) throw new HttpError(401, 'Please sign in again');
    this.checkOutlet({ me, session: session! }, outletId);
    return me;
  }

  async handle(method: string, url: URL, session: string | undefined, body: any): Promise<Reply> {
    const path = url.pathname.replace(/^\/api/, '');

    if (path === '/health') return ok({ status: 'ok', hub: true });
    if (path === '/devices/me') return ok(null);

    const me = this.meFor(session);
    if (!me) throw new HttpError(401, 'Please sign in again once the internet is back');
    const ctx = { me, session: session! };

    const order = path.match(/^\/orders\/([^/]+)(\/.*)?$/);
    if (method === 'GET') {
      if (path === '/auth/me') return ok(me);
      if (path === '/orders/active') return ok(this.active(ctx, url.searchParams.get('outletId')));
      if (path === '/kitchen/tickets') {
        this.checkOutlet(ctx, url.searchParams.get('outletId') ?? '');
        return ok(this.tickets(url.searchParams.get('outletId')));
      }
      if (path === '/customers/lookup') return ok(null);
      if (order && !order[2]) return ok(this.order(ctx, order[1]));
      const outletId =
        url.searchParams.get('outletId') ?? path.match(/^\/outlets\/([^/]+)\/stations$/)?.[1];
      if (outletId) this.checkOutlet(ctx, outletId);
      if (path === '/shifts/current') this.require(ctx, 'shift.manage');
      const cached = this.store.data.cache[`session:${hash(session!)}:${path}${url.search}`];
      if (cached !== undefined) return ok(cached);
      throw bad("This isn't available offline");
    }

    validateMutation(method, path, body);
    if (method === 'POST' && path === '/orders') return ok(this.create(ctx, body ?? {}));

    const ticket = path.match(/^\/kitchen\/tickets\/([^/]+)$/);
    if (method === 'PATCH' && ticket) return this.setTicket(ctx, ticket[1], body?.status);

    if (order) {
      const current = this.order(ctx, order[1]);
      const rest = order[2] ?? '';
      const item = rest.match(/^\/items\/([^/]+)(\/cancel)?$/);

      if (method === 'PATCH' && !rest) return ok(this.update(ctx, current, body ?? {}));
      if (method === 'POST' && rest === '/items') return ok(this.addItems(ctx, current, body));
      if (method === 'PATCH' && item && !item[2])
        return ok(this.changeItem(ctx, current, item[1], body ?? {}));
      if (method === 'POST' && item?.[2]) return ok(this.cancelItem(ctx, current, item[1]));
      if (method === 'POST' && rest === '/kot') return ok(this.sendKot(ctx, current));
      if ((method === 'PUT' || method === 'DELETE') && rest === '/discount')
        return ok(this.discount(ctx, current, method === 'PUT' ? body : null));
      if (method === 'POST' && rest === '/bill') return ok(this.bill(ctx, current).order);
      if (method === 'POST' && rest === '/payments') return ok(this.pay(ctx, current, body));
      if (method === 'POST' && rest === '/void') return ok(this.void(ctx, current, body?.reason));
      if (method === 'POST' && rest === '/reopen') throw needsConnection('Reopening a bill');
    }

    throw needsConnection();
  }

  // --- reads ---

  private active(ctx: Ctx, outletId: string | null) {
    if (!outletId) throw bad('outletId is required');
    this.checkOutlet(ctx, outletId);
    return this.store
      .ordersFor(outletId)
      .filter((o) => ACTIVE.includes(o.status))
      .sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }

  private order(ctx: Ctx, id: string) {
    const order = this.store.data.orders[id];
    if (!order) throw new HttpError(404, 'Order not found');
    this.checkOutlet(ctx, order.outletId);
    return order;
  }

  /** Kitchen tickets rebuilt from the orders, so new KOTs show up straight away. */
  tickets(outletId: string | null) {
    if (!outletId) throw bad('outletId is required');
    const known = new Map((this.store.data.tickets[outletId] ?? []).map((t) => [t.id, t]));
    const tickets: Kot[] = [];

    for (const order of this.store.ordersFor(outletId)) {
      if (order.status === 'VOID') continue;
      for (const kot of order.kots) {
        if (!KITCHEN.includes(kot.status)) continue;
        tickets.push({
          id: kot.id,
          kotNo: kot.kotNo,
          status: kot.status as Kot['status'],
          createdAt: kot.createdAt,
          station: known.get(kot.id)?.station ?? null,
          order: { id: order.id, orderNo: order.orderNo, type: order.type, table: order.table },
          items: order.items
            .filter((i) => i.kotId === kot.id && i.status !== 'CANCELLED')
            .map((i) => ({
              id: i.id,
              itemName: i.itemName,
              variantName: i.variantName,
              quantity: i.quantity,
              notes: i.notes,
              status: i.status,
              foodType: i.foodType,
              modifiers: i.modifiers.map((m) => ({ name: m.name })),
            })),
        });
      }
    }
    return tickets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // --- changes ---

  private create(ctx: Ctx, body: any) {
    this.require(ctx, 'order.take');
    const { outletId, type, tableId } = body;
    if (!UUID.test(body.id ?? '')) throw bad('Order id is missing');
    if (this.store.data.orders[body.id]) return this.order(ctx, body.id);
    this.checkOutlet(ctx, outletId);

    const menu = this.menu(outletId);
    const till = this.till(outletId);
    if (type === 'DINE_IN' && !tableId) throw bad('Pick a table for a dine-in order');
    if (tableId && !menu.tables.some((t) => t.id === tableId)) throw bad('Unknown table');
    if (tableId) this.checkTableFree(outletId, tableId);

    const date = today(menu);
    const orderNo = `${till.code}-${this.store.nextNumber(`order:${date}`)}`;
    const table = menu.tables.find((t) => t.id === tableId);
    const order = engine.newOrder({
      id: body.id,
      outletId,
      orderNo,
      businessDate: date,
      type: type as OrderType,
      table: table ? { id: table.id, name: table.name } : null,
      covers: body.covers,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
    });

    this.save(ctx, order, 'POST', '/orders', `New order #${orderNo}`, {
      ...body,
      orderNo,
      openedAt: order.openedAt,
    });
    this.events.emit(outletId, { type: 'order', id: order.id }, { type: 'table' });
    return order;
  }

  private update(ctx: Ctx, order: Order, patch: any) {
    this.require(ctx, 'order.take');
    this.checkOpen(order);
    if (patch.type && patch.type !== order.type) throw needsConnection('Changing the order type');
    if (patch.tableId && !this.menu(order.outletId).tables.some((t) => t.id === patch.tableId))
      throw bad('Unknown table');
    if (patch.tableId) this.checkTableFree(order.outletId, patch.tableId, order.id);

    const next = engine.update(order, patch, this.menu(order.outletId));
    this.save(ctx, next, 'PATCH', `/orders/${order.id}`, `Changes to #${order.orderNo}`, patch);
    this.events.emit(order.outletId, { type: 'order', id: order.id }, { type: 'table' });
    return next;
  }

  private addItems(ctx: Ctx, order: Order, body: any) {
    this.require(ctx, 'order.take');
    this.checkOpen(order);
    const menu = this.menu(order.outletId);
    const lines = (body?.items ?? []).map((line: any) => {
      const item = menu.items.find((i) => i.id === line.menuItemId);
      if (!item) throw bad('That item is no longer on the menu');
      if (item.outOfStock) throw bad('That item is out of stock');
      if (
        (item.hasVariants && !line.variantId) ||
        (line.variantId && !item.variants.some((v) => v.id === line.variantId))
      )
        throw bad('Choose a valid variant');
      const options: string[] = line.modifierOptionIds ?? [];
      if (
        options.some((id) => !item.modifierGroups.some((g) => g.options.some((o) => o.id === id)))
      )
        throw bad('Unknown modifier');
      for (const group of item.modifierGroups) {
        const count = group.options.filter((o) => options.includes(o.id)).length;
        if (count < group.minSelect || count > group.maxSelect)
          throw bad('Choose the required modifiers');
      }
      if (!UUID.test(line.id ?? '')) throw bad('Item id is missing');
      return {
        id: line.id,
        item,
        variantId: line.variantId,
        optionIds: line.modifierOptionIds ?? [],
        quantity: Number(line.quantity),
        notes: line.notes,
      };
    });
    if (!lines.length) throw bad('Add at least one item');

    const fresh = lines.filter((l: { id: string }) => !order.items.some((i) => i.id === l.id));
    const next = engine.addItems(order, fresh, menu);
    this.save(ctx, next, 'POST', `/orders/${order.id}/items`, `Items on #${order.orderNo}`, body);
    this.events.emit(order.outletId, { type: 'order', id: order.id });
    return next;
  }

  private changeItem(ctx: Ctx, order: Order, itemId: string, patch: any) {
    this.require(ctx, 'order.take');
    const item = this.pendingItem(order, itemId);
    let next = order;
    if (patch.quantity !== undefined) {
      next = engine.setQuantity(order, item.id, Number(patch.quantity), this.menu(order.outletId));
    }
    if (patch.notes !== undefined) {
      next = {
        ...next,
        items: next.items.map((i) => (i.id === itemId ? { ...i, notes: patch.notes || null } : i)),
      };
    }
    const path = `/orders/${order.id}/items/${itemId}`;
    this.save(ctx, next, 'PATCH', path, `Quantity on #${order.orderNo}`, patch);
    this.events.emit(order.outletId, { type: 'order', id: order.id });
    return next;
  }

  private cancelItem(ctx: Ctx, order: Order, itemId: string) {
    this.require(ctx, 'order.take');
    const item = this.pendingItem(order, itemId);
    const next = engine.setQuantity(order, item.id, 0, this.menu(order.outletId));
    const path = `/orders/${order.id}/items/${itemId}/cancel`;
    this.save(ctx, next, 'POST', path, `Remove item on #${order.orderNo}`, {});
    this.events.emit(order.outletId, { type: 'order', id: order.id });
    return next;
  }

  private sendKot(ctx: Ctx, order: Order) {
    this.require(ctx, 'order.take');
    this.checkOpen(order);
    const { order: next, kot } = engine.sendToKitchen(order, this.kotNo(order));
    if (!kot) throw bad('Nothing new to send to the kitchen');

    this.save(
      ctx,
      next,
      'POST',
      `/orders/${order.id}/kot`,
      `KOT for #${order.orderNo}`,
      undefined,
      {
        localKotId: kot.id,
      },
    );
    this.events.emit(order.outletId, { type: 'order', id: order.id }, { type: 'kot' });
    return [kot];
  }

  private discount(ctx: Ctx, order: Order, body: any) {
    this.require(ctx, 'bill.discount');
    if (order.status !== 'OPEN') throw bad('Reopen the bill to change the discount');
    if (body && body.type === 'PERCENT' && Number(body.value) > 100) {
      throw bad("Discount can't be more than 100%");
    }
    const discount = body
      ? { type: body.type, value: Number(body.value), reason: body.reason }
      : null;
    const next = engine.setDiscount(order, discount, this.menu(order.outletId));
    const path = `/orders/${order.id}/discount`;
    this.save(
      ctx,
      next,
      body ? 'PUT' : 'DELETE',
      path,
      `Discount on #${order.orderNo}`,
      body ?? undefined,
    );
    this.events.emit(order.outletId, { type: 'order', id: order.id });
    return next;
  }

  private bill(ctx: Ctx, order: Order) {
    this.require(ctx, 'bill.settle');
    if (order.status === 'BILLED') return { order };
    this.checkOpen(order);
    if (!order.items.some((i) => i.status !== 'CANCELLED')) {
      throw bad('Add items before printing the bill');
    }

    const menu = this.menu(order.outletId);
    const till = this.till(order.outletId);
    const fy = financialYear(today(menu));
    const n = this.store.nextNumber(`invoice:${fy}`);
    const invoiceNo = `${till.outletCode}/${fy.slice(2)}/${till.code}-${String(n).padStart(5, '0')}`;

    const result = engine.bill(order, invoiceNo, this.kotNo(order), menu);
    const path = `/orders/${order.id}/bill`;
    this.save(
      ctx,
      result.order,
      'POST',
      path,
      `Bill ${invoiceNo}`,
      { invoiceNo, issuedAt: result.issuedAt },
      result.kot ? { localKotId: result.kot.id } : undefined,
    );
    this.events.emit(
      order.outletId,
      { type: 'order', id: order.id },
      ...(result.kot ? [{ type: 'kot' as const }] : []),
    );
    return result;
  }

  private pay(ctx: Ctx, order: Order, body: any) {
    this.require(ctx, 'bill.settle');
    if (order.status !== 'OPEN' && order.status !== 'BILLED') throw bad('This order is closed');
    const shift = this.store.data.cache[`/shifts/current?outletId=${order.outletId}`];
    if (!shift) throw bad('Open a cash shift before taking payments');
    if (body.tip) throw needsConnection('Adding a tip');

    const payments = (body?.payments ?? [])
      .filter((p: any) => !order.payments.some((old) => old.id === p.id))
      .map((p: any) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        reference: p.reference,
      }));
    if (body.payments.length && !payments.length) return { order, change: 0 };
    // Check payment rules before billing changes status or allocates invoice numbers.
    try {
      engine.pay(order, payments);
    } catch (err) {
      throw bad((err as Error).message);
    }
    let current = order;
    if (current.status === 'OPEN') current = this.bill(ctx, current).order;

    let result;
    try {
      result = engine.pay(current, payments);
    } catch (err) {
      throw bad((err as Error).message);
    }
    this.save(
      ctx,
      result.order,
      'POST',
      `/orders/${order.id}/payments`,
      `Payment on #${order.orderNo}`,
      { ...body, paidAt: new Date().toISOString() },
    );
    this.events.emit(order.outletId, { type: 'order', id: order.id }, { type: 'table' });
    return result;
  }

  private void(ctx: Ctx, order: Order, reason: string) {
    this.require(ctx, 'order.take');
    if (!reason?.trim()) throw bad('Give a reason');
    if (order.status === 'VOID') throw bad('Already voided');
    if (!order.items.every((i) => i.status === 'PENDING'))
      throw needsConnection('Voiding an order');

    const next: Order = { ...order, status: 'VOID', voidReason: reason };
    this.save(ctx, next, 'POST', `/orders/${order.id}/void`, `Cancel #${order.orderNo}`, {
      reason,
    });
    this.events.emit(order.outletId, { type: 'order', id: order.id }, { type: 'table' });
    return next;
  }

  private setTicket(ctx: Ctx, kotId: string, status: string): Reply {
    const can = (p: string) => ctx.me.user.isOwner || ctx.me.permissions.includes(p);
    if (!can('kitchen.view') && !can('order.take')) {
      throw new HttpError(403, "You don't have access to this");
    }
    if (!['NEW', 'PREPARING', 'READY', 'SERVED'].includes(status)) throw bad('Unknown status');

    const order = Object.values(this.store.data.orders).find((o) =>
      o.kots.some((k) => k.id === kotId),
    );
    if (!order) throw new HttpError(404, 'Ticket not found');
    this.checkOutlet(ctx, order.outletId);

    const itemStatus = status === 'NEW' ? 'SENT' : status;
    const next: Order = {
      ...order,
      kots: order.kots.map((k) => (k.id === kotId ? { ...k, status } : k)),
      items: order.items.map((i) =>
        i.kotId === kotId && i.status !== 'CANCELLED'
          ? { ...i, status: itemStatus as Order['items'][number]['status'] }
          : i,
      ),
    };
    const label = `Kitchen #${order.orderNo}`;
    this.save(ctx, next, 'PATCH', `/kitchen/tickets/${kotId}`, label, { status });
    this.events.emit(order.outletId, { type: 'kot' }, { type: 'order', id: order.id });
    return { status: 204 };
  }

  // --- helpers ---

  private save(
    ctx: Ctx,
    order: Order,
    method: string,
    path: string,
    label: string,
    body?: unknown,
    extra?: { localKotId?: string },
  ) {
    this.store.putOrder(order);
    this.store.queue({
      orderId: order.id,
      method,
      path,
      body,
      session: ctx.session,
      label,
      ...extra,
    });
  }

  private require(ctx: Ctx, permission: string) {
    if (ctx.me.user.isOwner || ctx.me.permissions.includes(permission)) return;
    throw new HttpError(403, "You don't have access to this");
  }

  private checkOutlet(ctx: Ctx, outletId: string) {
    if (!ctx.me.outlets.some((o) => o.id === outletId))
      throw new HttpError(404, 'Outlet not found');
  }

  private checkOpen(order: Order) {
    if (order.status !== 'OPEN') throw bad('This order is already billed');
  }

  private checkTableFree(outletId: string, tableId: string, exceptId?: string) {
    const busy = this.store
      .ordersFor(outletId)
      .find((o) => ACTIVE.includes(o.status) && o.tableId === tableId && o.id !== exceptId);
    if (busy) throw bad(`That table already has order #${busy.orderNo}`);
  }

  private pendingItem(order: Order, itemId: string) {
    this.checkOpen(order);
    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new HttpError(404, 'Item not found');
    if (item.status !== 'PENDING') throw needsConnection('Changing items already sent');
    return item;
  }

  private menu(outletId: string): PosMenu {
    const menu = this.store.menu(outletId);
    if (!menu) throw needsConnection('Opening the menu for the first time');
    return menu;
  }

  private till(outletId: string) {
    const till = this.store.data.till;
    if (!till) {
      throw bad('Set this counter up as a till first (Settings → POS devices), then bill offline');
    }
    if (till.outletId !== outletId) throw bad('This counter is set up for another outlet');
    return till;
  }

  private kotNo(order: Order) {
    const till = this.till(order.outletId);
    return `${till.code}-K${this.store.nextNumber(`kot:${today(this.menu(order.outletId))}`)}`;
  }
}

type Ctx = { me: Me; session: string };

const ok = (body: unknown): Reply => ({ status: 200, body });

const today = (menu: PosMenu) =>
  businessDate(new Date(), menu.outlet.timezone, menu.outlet.dayStartTime);
