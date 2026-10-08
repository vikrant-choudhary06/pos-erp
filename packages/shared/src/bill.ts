// Bill maths shared by the POS screen and the API, so the total the cashier
// sees is exactly the total that gets saved. Everything runs in paise.

export type TaxRate = { name: string; rate: number };

export type BillLineInput = {
  key: string;
  unitPrice: number;
  /** add-ons per unit, in rupees */
  modifiersTotal?: number;
  quantity: number;
  taxes: TaxRate[];
};

export type BillDiscount = { type: 'PERCENT' | 'FLAT'; value: number } | null;

export type BillInput = {
  lines: BillLineInput[];
  discount?: BillDiscount;
  serviceChargePercent?: number;
  priceIncludesTax?: boolean;
};

export type BillLine = {
  key: string;
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  taxes: { name: string; rate: number; amount: number }[];
  total: number;
};

export type Bill = {
  lines: BillLine[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  roundOff: number;
  total: number;
  taxSummary: { name: string; rate: number; taxable: number; amount: number }[];
};

const paise = (rupees: number) => Math.round(rupees * 100);
const rupees = (p: number) => Math.round(p) / 100;

/** Split `amount` across `weights` so the parts always add back to `amount`. */
function allocate(amount: number, weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total || !amount) return weights.map(() => 0);

  const parts = weights.map((w) => Math.floor((amount * w) / total));
  let left = amount - parts.reduce((a, b) => a + b, 0);
  // hand out the leftover paise to the biggest lines first
  const order = weights.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0; i = (i + 1) % order.length, left--) parts[order[i][1]]++;
  return parts;
}

export function calculateBill(input: BillInput): Bill {
  const gross = input.lines.map((line) =>
    Math.round(paise(line.unitPrice + (line.modifiersTotal ?? 0)) * line.quantity),
  );
  const subtotal = gross.reduce((a, b) => a + b, 0);

  let discount = 0;
  if (input.discount && input.discount.value > 0) {
    discount =
      input.discount.type === 'PERCENT'
        ? Math.round((subtotal * Math.min(input.discount.value, 100)) / 100)
        : Math.min(paise(input.discount.value), subtotal);
  }
  const lineDiscounts = allocate(discount, gross);

  const lines = input.lines.map((line, i) => {
    const net = gross[i] - lineDiscounts[i];
    const totalRate = line.taxes.reduce((sum, t) => sum + t.rate, 0);

    let taxable: number;
    let tax: number;
    if (input.priceIncludesTax) {
      taxable = Math.round(net / (1 + totalRate / 100));
      tax = net - taxable;
    } else {
      taxable = net;
      tax = line.taxes.reduce((sum, t) => sum + Math.round((taxable * t.rate) / 100), 0);
    }

    const parts = allocate(
      tax,
      line.taxes.map((t) => t.rate),
    );
    return {
      key: line.key,
      gross: gross[i],
      discount: lineDiscounts[i],
      taxable,
      tax,
      taxes: line.taxes.map((t, j) => ({ name: t.name, rate: t.rate, amount: parts[j] })),
      total: taxable + tax,
    };
  });

  const taxable = lines.reduce((sum, l) => sum + l.taxable, 0);
  const tax = lines.reduce((sum, l) => sum + l.tax, 0);
  const serviceCharge = Math.round((taxable * (input.serviceChargePercent ?? 0)) / 100);

  const exact = taxable + tax + serviceCharge;
  const total = Math.round(exact / 100) * 100;

  const summary = new Map<
    string,
    { name: string; rate: number; taxable: number; amount: number }
  >();
  for (const line of lines) {
    for (const t of line.taxes) {
      const key = `${t.name}@${t.rate}`;
      const row = summary.get(key) ?? { name: t.name, rate: t.rate, taxable: 0, amount: 0 };
      row.taxable += line.taxable;
      row.amount += t.amount;
      summary.set(key, row);
    }
  }

  return {
    lines: lines.map((l) => ({
      ...l,
      gross: rupees(l.gross),
      discount: rupees(l.discount),
      taxable: rupees(l.taxable),
      tax: rupees(l.tax),
      taxes: l.taxes.map((t) => ({ ...t, amount: rupees(t.amount) })),
      total: rupees(l.total),
    })),
    subtotal: rupees(subtotal),
    discount: rupees(discount),
    serviceCharge: rupees(serviceCharge),
    tax: rupees(tax),
    roundOff: rupees(total - exact),
    total: rupees(total),
    taxSummary: [...summary.values()].map((r) => ({
      ...r,
      taxable: rupees(r.taxable),
      amount: rupees(r.amount),
    })),
  };
}
