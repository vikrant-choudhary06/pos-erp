import { esc } from '@/lib/print';
import type { Folio, HotelProperty } from './types';

export function hotelStatementHtml(property: HotelProperty, folio: Folio) {
  const amount = (value: string | number) => Number(value).toFixed(2);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Guest account statement</title>
    <style>@page{size:80mm auto;margin:4mm}body{font:12px/1.5 system-ui;color:#000}h1{font-size:17px}table{width:100%;border-collapse:collapse}td{padding:5px 0;border-bottom:1px solid #ddd}td:last-child{text-align:right;white-space:nowrap}</style></head><body>
    <h1>${esc(property.name)}</h1><p>Guest account statement</p>
    <p>${esc(folio.guest.name)} · Room ${esc(folio.room.number)}<br>${esc(folio.arrival.slice(0, 10))} → ${esc(folio.departure.slice(0, 10))}</p>
    <table><tbody>${folio.entries.map((entry) => `<tr><td>${esc(entry.description)}${entry.method ? `<br>${esc(entry.method)}` : ''}</td><td>${amount(entry.amount)}</td></tr>`).join('')}</tbody></table>
    <p><strong>Posted balance: INR ${amount(folio.balance)}</strong><br>Estimated booked-stay balance: INR ${amount(folio.estimatedBalance)}</p>
    <p>This is a guest account statement, not a tax invoice. Restaurant tax invoices remain separate.</p>
    </body></html>`;
}
