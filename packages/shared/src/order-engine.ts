import { calculateBill } from './bill';
import { toPaise } from './money';
import type { OrderType, PaymentMethod } from './orders';
import type { Kot, Order, OrderItem, PosItem, PosMenu } from './pos-types';

// The same rules the API applies, run on a local copy of an order while the
// cloud can't be reached: by the browser till (version 1) and by the counter
// hub (version 2). Totals come from calculateBill, so they match once the
// server replays the same steps.

const str = (n: number) => String(Math.round(n * 100) / 100);

export function priceOf(item: PosItem, variantId: string | undefined, type: OrderType) {
  const override = item.prices.find(
    (p) => p.orderType === type && (p.variantId ?? undefined) === variantId,
  );
  const variant = item.variants.find((v) => v.id === variantId);
  return Number(override?.price ?? variant?.price ?? item.basePrice);
}

export function newOrder(input: {
  id: string;
  outletId: string;
  orderNo: string;
  businessDate: string;
  type: OrderType;
  table: { id: string; name: string } | null;
  covers?: number;
  customerName?: string;
  customerPhone?: string;
}): Order {
  return {
    id: input.id,
    outletId: input.outletId,
    orderNo: input.orderNo,
    businessDate: input.businessDate,
    type: input.type,
    status: 'OPEN',
    tableId: input.table?.id ?? null,
    table: input.table,
    covers: input.covers ?? null,
    customerId: null,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    customer: null,
    notes: null,
    subtotal: '0',
    discountTotal: '0',
    serviceCharge: '0',
    taxTotal: '0',
    roundOff: '0',
    grandTotal: '0',
    paidTotal: '0',
    openedAt: new Date().toISOString(),
    billedAt: null,
    closedAt: null,
    voidReason: null,
    items: [],
    discount: null,
    payments: [],
    invoice: null,
    kots: [],
  };
}

export type NewLine = {
  id: string;
  item: PosItem;
  variantId?: string;
  optionIds: string[];
  quantity: number;
  notes?: string;
};

export function addItems(order: Order, lines: NewLine[], menu: PosMenu): Order {
  const items: OrderItem[] = lines.map((line) => {
    const variant = line.item.variants.find((v) => v.id === line.variantId);
    const options = line.item.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => line.optionIds.includes(o.id));
    return {
      id: line.id,
      menuItemId: line.item.id,
      variantId: line.variantId ?? null,
      itemName: line.item.name,
      variantName: variant?.name ?? null,
      foodType: line.item.foodType,
      unitPrice: str(priceOf(line.item, line.variantId, order.type)),
      modifiersTotal: str(options.reduce((s, o) => s + Number(o.price), 0)),
      quantity: String(line.quantity),
      lineTotal: '0',
      taxBreakup: line.item.taxes.map((t) => ({ name: t.name, rate: Number(t.rate), amount: 0 })),
      status: 'PENDING',
      notes: line.notes ?? null,
      cancelReason: null,
      kotId: null,
      modifiers: options.map((o) => ({ id: o.id, name: o.name, price: o.price })),
    };
  });
  return recalc({ ...order, items: [...order.items, ...items] }, menu);
}

export function setQuantity(order: Order, itemId: string, quantity: number, menu: PosMenu) {
  const items =
    quantity <= 0
      ? order.items.filter((i) => i.id !== itemId)
      : order.items.map((i) => (i.id === itemId ? { ...i, quantity: String(quantity) } : i));
  return recalc({ ...order, items }, menu);
}

/** Move everything still in the cart onto a kitchen ticket. */
export function sendToKitchen(order: Order, kotNo: string): { order: Order; kot: Kot | null } {
  const pending = order.items.filter((i) => i.status === 'PENDING');
  if (!pending.length) return { order, kot: null };

  const kotId = `local-${kotNo}`;
  const createdAt = new Date().toISOString();
  const kot: Kot = {
    id: kotId,
    kotNo,
    status: 'NEW',
    createdAt,
    station: null,
    order: { id: order.id, orderNo: order.orderNo, type: order.type, table: order.table },
    items: pending.map((i) => ({
      id: i.id,
      itemName: i.itemName,
      variantName: i.variantName,
      quantity: i.quantity,
      notes: i.notes,
      status: 'SENT',
      foodType: i.foodType,
      modifiers: i.modifiers.map((m) => ({ name: m.name })),
    })),
  };

  return {
    kot,
    order: {
      ...order,
      items: order.items.map((i) => (i.status === 'PENDING' ? { ...i, status: 'SENT', kotId } : i)),
      kots: [...order.kots, { id: kotId, kotNo, status: 'NEW', createdAt }],
    },
  };
}

export function setDiscount(
  order: Order,
  discount: { type: 'PERCENT' | 'FLAT'; value: number; reason?: string } | null,
  menu: PosMenu,
) {
  return recalc(
    {
      ...order,
      discount: discount
        ? {
            type: discount.type,
            value: String(discount.value),
            amount: '0',
            reason: discount.reason ?? null,
          }
        : null,
    },
    menu,
  );
}

export function bill(order: Order, invoiceNo: string, kotNo: string, menu: PosMenu) {
  // like the server, anything still in the cart goes to the kitchen with the bill
  const sent = sendToKitchen(order, kotNo);
  const billed = recalc(sent.order, menu);
  const totals = calculateTotals(billed, menu);
  const issuedAt = new Date().toISOString();

  return {
    kot: sent.kot,
    issuedAt,
    order: {
      ...billed,
      status: 'BILLED' as const,
      billedAt: issuedAt,
      invoice: {
        id: `local-${invoiceNo}`,
        invoiceNo,
        issuedAt,
        customerGstin: null,
        taxLines: totals.taxSummary.map((t) => ({
          taxName: t.name,
          rate: String(t.rate),
          taxableAmount: str(t.taxable),
          taxAmount: str(t.amount),
        })),
      },
    },
  };
}

type PaymentInput = { id: string; method: PaymentMethod; amount: number; reference?: string };

/** Same rules as the API: only cash may exceed what is due, the rest is change. */
export function pay(order: Order, payments: PaymentInput[]) {
  const due = toPaise(order.grandTotal) - toPaise(order.paidTotal);
  const nonCash = payments.filter((p) => p.method !== 'CASH');
  const cash = payments.filter((p) => p.method === 'CASH');
  const nonCashTotal = nonCash.reduce((s, p) => s + toPaise(p.amount), 0);
  const cashGiven = cash.reduce((s, p) => s + toPaise(p.amount), 0);

  if (nonCashTotal > due) throw new Error('That is more than the amount due');
  if (payments.some((p) => p.method === 'CREDIT')) {
    throw new Error('Credit needs a connection to check the customer');
  }
  const cashApplied = Math.min(cashGiven, due - nonCashTotal);
  const saved = [
    ...nonCash.map((p) => ({ ...p, paise: toPaise(p.amount) })),
    ...(cashApplied > 0 ? [{ ...cash[0], paise: cashApplied }] : []),
  ];
  const paidNow = saved.reduce((s, p) => s + p.paise, 0);
  if (!paidNow && due > 0) throw new Error('Add a payment');

  const settled = paidNow >= due;
  const paidAt = new Date().toISOString();
  return {
    change: (cashGiven - cashApplied) / 100,
    order: {
      ...order,
      paidTotal: str((toPaise(order.paidTotal) + paidNow) / 100),
      payments: [
        ...order.payments,
        ...saved.map((p) => ({
          id: p.id,
          method: p.method,
          amount: str(p.paise / 100),
          tipAmount: '0',
          reference: p.reference ?? null,
          paidAt,
        })),
      ],
      ...(settled && { status: 'PAID' as const, closedAt: paidAt }),
    },
  };
}

export function update(
  order: Order,
  patch: {
    tableId?: string;
    covers?: number;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
  },
  menu: PosMenu,
): Order {
  const table = patch.tableId
    ? (menu.tables.find((t) => t.id === patch.tableId) ?? null)
    : undefined;
  return {
    ...order,
    ...(table !== undefined && {
      tableId: table?.id ?? null,
      table: table && { id: table.id, name: table.name },
    }),
    covers: patch.covers ?? order.covers,
    customerName: patch.customerName ?? order.customerName,
    customerPhone: patch.customerPhone ?? order.customerPhone,
    notes: patch.notes ?? order.notes,
  };
}

function calculateTotals(order: Order, menu: PosMenu) {
  return calculateBill({
    lines: order.items
      .filter((i) => i.status !== 'CANCELLED')
      .map((i) => ({
        key: i.id,
        unitPrice: Number(i.unitPrice),
        modifiersTotal: Number(i.modifiersTotal),
        quantity: Number(i.quantity),
        taxes: i.taxBreakup.map((t) => ({ name: t.name, rate: Number(t.rate) })),
      })),
    discount: order.discount
      ? { type: order.discount.type, value: Number(order.discount.value) }
      : null,
    serviceChargePercent: order.type === 'DINE_IN' ? menu.outlet.settings.serviceChargePercent : 0,
    priceIncludesTax: menu.outlet.priceIncludesTax,
  });
}

function recalc(order: Order, menu: PosMenu): Order {
  const bill = calculateTotals(order, menu);
  const lines = new Map(bill.lines.map((l) => [l.key, l]));

  return {
    ...order,
    items: order.items.map((i) => {
      const line = lines.get(i.id);
      return line ? { ...i, lineTotal: str(line.total), taxBreakup: line.taxes } : i;
    }),
    discount: order.discount && { ...order.discount, amount: str(bill.discount) },
    subtotal: str(bill.subtotal),
    discountTotal: str(bill.discount),
    serviceCharge: str(bill.serviceCharge),
    taxTotal: str(bill.tax),
    roundOff: str(bill.roundOff),
    grandTotal: str(bill.total),
  };
}
