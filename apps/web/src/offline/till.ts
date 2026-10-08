import { businessDate, financialYear } from '@pos/shared';
import { api } from '@/lib/api';
import { db, getMeta, setMeta } from './db';

/**
 * A registered till numbers its own orders, KOTs and bills while offline
 * ("D1-12", "IND01/26-27/D1-00004"), so nothing clashes with numbers the
 * server hands out to other devices.
 */
export type Till = {
  code: string;
  outletId: string;
  outletCode: string;
  counters: Record<string, number>;
};

const KEY = 'till';

type Numbering = {
  code: string;
  outletId: string;
  outletCode: string;
  lastOrder: number;
  lastInvoice: number;
};

export async function refreshTill(outlet: { id: string; timezone: string; dayStartTime: string }) {
  const date = businessDate(new Date(), outlet.timezone, outlet.dayStartTime);
  const fy = financialYear(date);
  const info = await api<Numbering | null>(`/devices/me?date=${date}&fy=${fy}`);

  if (!info || info.outletId !== outlet.id) {
    await setMeta(KEY, null);
    return null;
  }

  const saved = await getMeta<Till>(KEY);
  const counters = saved?.code === info.code ? { ...saved.counters } : {};
  // never go backwards: the server may not have seen what we printed offline yet
  counters[`order:${date}`] = Math.max(counters[`order:${date}`] ?? 0, info.lastOrder);
  counters[`invoice:${fy}`] = Math.max(counters[`invoice:${fy}`] ?? 0, info.lastInvoice);

  const till: Till = {
    code: info.code,
    outletId: info.outletId,
    outletCode: info.outletCode,
    counters,
  };
  await setMeta(KEY, till);
  return till;
}

/** Next number for a counter like "order:2026-10-08", saved before it is used. */
export async function nextTillNumber(key: string) {
  return db().transaction('rw', db().meta, async () => {
    const till = await getMeta<Till | null>(KEY);
    if (!till) throw new Error('This browser is not set up as a till');
    const value = (till.counters[key] ?? 0) + 1;
    await setMeta(KEY, { ...till, counters: { ...till.counters, [key]: value } });
    return { till, value };
  });
}
