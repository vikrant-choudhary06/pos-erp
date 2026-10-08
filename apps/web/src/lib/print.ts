import { ORDER_TYPES, PAYMENT_METHODS } from '@pos/shared';
import type { Kot, Order } from './pos-types';

// Receipts are printed from a hidden iframe so the POS screen itself is never
// re-laid out for print. Widths match common 80mm thermal printers.

export const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const amount = (v: string | number) => Number(v).toFixed(2);

const STYLE = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 4mm 0; font: 12px/1.35 ui-monospace, Menlo, Consolas, monospace; color: #000; }
  h1 { font-size: 15px; margin: 0; text-align: center; }
  .c { text-align: center; }
  .muted { font-size: 11px; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row span:first-child { flex: 1; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  td.n { text-align: right; white-space: nowrap; padding-left: 6px; }
  .big { font-size: 15px; font-weight: 700; }
  .kot td { font-size: 14px; }
  .note { font-size: 11px; padding-left: 10px; }
`;

export function printHtml(body: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`,
  );
  doc.close();

  const win = frame.contentWindow!;
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.onafterprint = cleanup;
  setTimeout(() => {
    win.focus();
    win.print();
    // some browsers never fire afterprint
    setTimeout(cleanup, 60_000);
  }, 50);
}

type BillHeader = {
  businessName: string;
  outlet: {
    name: string;
    addressLine?: string | null;
    city?: string | null;
    phone?: string | null;
    gstin?: string | null;
    fssaiNo?: string | null;
  };
  footer?: string;
};

export function billHtml(order: Order, header: BillHeader) {
  const o = header.outlet;
  const items = order.items.filter((i) => i.status !== 'CANCELLED');
  const when = new Date(order.invoice?.issuedAt ?? order.openedAt).toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const lines = items
    .map((i) => {
      const name = `${esc(i.itemName)}${i.variantName ? ` (${esc(i.variantName)})` : ''}`;
      const mods = i.modifiers.length
        ? `<div class="note">+ ${i.modifiers.map((m) => esc(m.name)).join(', ')}</div>`
        : '';
      const unit = Number(i.unitPrice) + Number(i.modifiersTotal);
      return `<tr><td>${name}${mods}</td><td class="n">${Number(i.quantity)}</td><td class="n">${amount(unit)}</td><td class="n">${amount(unit * Number(i.quantity))}</td></tr>`;
    })
    .join('');

  const taxes = (order.invoice?.taxLines ?? [])
    .map(
      (t) =>
        `<div class="row"><span>${esc(t.taxName)} ${Number(t.rate)}%</span><span>${amount(t.taxAmount)}</span></div>`,
    )
    .join('');

  const payments = order.payments
    .map(
      (p) =>
        `<div class="row"><span>${esc(PAYMENT_METHODS[p.method])}</span><span>${amount(p.amount)}</span></div>`,
    )
    .join('');

  return `
    <h1>${esc(header.businessName)}</h1>
    <div class="c muted">${esc(o.name)}${o.addressLine ? `<br>${esc(o.addressLine)}` : ''}${o.city ? `, ${esc(o.city)}` : ''}</div>
    ${o.phone ? `<div class="c muted">Ph ${esc(o.phone)}</div>` : ''}
    ${o.gstin ? `<div class="c muted">GSTIN ${esc(o.gstin)}</div>` : ''}
    ${o.fssaiNo ? `<div class="c muted">FSSAI ${esc(o.fssaiNo)}</div>` : ''}
    <hr>
    <div class="c"><b>${order.invoice ? 'TAX INVOICE' : 'ESTIMATE'}</b></div>
    ${order.invoice ? `<div class="row"><span>Bill no</span><span>${esc(order.invoice.invoiceNo)}</span></div>` : ''}
    <div class="row"><span>Date</span><span>${esc(when)}</span></div>
    <div class="row"><span>Order #${esc(order.orderNo)}</span><span>${order.table ? `Table ${esc(order.table.name)}` : esc(ORDER_TYPES[order.type])}</span></div>
    ${order.customerName || order.customerPhone ? `<div class="row"><span>Customer</span><span>${esc(order.customerName ?? '')} ${esc(order.customerPhone ?? '')}</span></div>` : ''}
    ${order.invoice?.customerGstin ? `<div class="row"><span>GSTIN</span><span>${esc(order.invoice.customerGstin)}</span></div>` : ''}
    <hr>
    <table>
      <tr><td><b>Item</b></td><td class="n"><b>Qty</b></td><td class="n"><b>Rate</b></td><td class="n"><b>Amt</b></td></tr>
      ${lines}
    </table>
    <hr>
    <div class="row"><span>Subtotal</span><span>${amount(order.subtotal)}</span></div>
    ${Number(order.discountTotal) ? `<div class="row"><span>Discount</span><span>-${amount(order.discountTotal)}</span></div>` : ''}
    ${Number(order.serviceCharge) ? `<div class="row"><span>Service charge</span><span>${amount(order.serviceCharge)}</span></div>` : ''}
    ${taxes}
    ${Number(order.roundOff) ? `<div class="row"><span>Round off</span><span>${amount(order.roundOff)}</span></div>` : ''}
    <hr>
    <div class="row big"><span>TOTAL</span><span>₹${amount(order.grandTotal)}</span></div>
    ${payments ? `<hr>${payments}` : ''}
    <hr>
    <div class="c muted">${esc(header.footer ?? '')}</div>
  `;
}

export function kotHtml(kot: Kot) {
  const when = new Date(kot.createdAt).toLocaleTimeString('en-IN', { timeStyle: 'short' });
  const rows = kot.items
    .map((i) => {
      const name = `${esc(i.itemName)}${i.variantName ? ` (${esc(i.variantName)})` : ''}`;
      const extra = [
        i.modifiers.length ? `+ ${i.modifiers.map((m) => esc(m.name)).join(', ')}` : '',
        i.notes ? `* ${esc(i.notes)}` : '',
      ]
        .filter(Boolean)
        .map((t) => `<div class="note">${t}</div>`)
        .join('');
      return `<tr><td class="n" style="text-align:left;padding:0 8px 0 0"><b>${Number(i.quantity)}</b></td><td>${name}${extra}</td></tr>`;
    })
    .join('');

  return `
    <h1>KOT #${esc(kot.kotNo)}</h1>
    ${kot.station ? `<div class="c">${esc(kot.station.name)}</div>` : ''}
    <hr>
    <div class="row big"><span>${kot.order.table ? `Table ${esc(kot.order.table.name)}` : esc(ORDER_TYPES[kot.order.type])}</span><span>#${esc(kot.order.orderNo)}</span></div>
    <div class="muted">${esc(when)}</div>
    <hr>
    <table class="kot">${rows}</table>
    <hr>
  `;
}
