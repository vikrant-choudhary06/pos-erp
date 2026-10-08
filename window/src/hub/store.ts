import fs from 'node:fs';
import path from 'node:path';
import type { Kot, Order, PosMenu } from '@pos/shared';

// Everything the hub needs to keep the shop running without the cloud lives
// in one JSON file. It is small (today's orders, a few cached replies, the
// queue), so rewriting it whole is fine. Writes go to a temp file first so a
// power cut never leaves half a file behind.

export type Till = {
  code: string;
  outletId: string;
  outletCode: string;
  counters: Record<string, number>;
};

export type Queued = {
  seq: number;
  orderId: string;
  method: string;
  path: string;
  body?: unknown;
  session: string;
  label: string;
  at: string;
  /** KOT number the hub printed, swapped for the cloud's id once replayed */
  localKotId?: string;
  error?: string;
};

type Data = {
  deviceCookie: string | null;
  lastSession: string | null;
  till: Till | null;
  /** GET replies by path, plus "me:<session hash>" for /auth/me */
  cache: Record<string, unknown>;
  orders: Record<string, Order>;
  /** kitchen tickets per outlet, last seen from the cloud */
  tickets: Record<string, Kot[]>;
  outbox: Queued[];
  failed: Queued[];
  seq: number;
  /** local KOT id -> the id the cloud gave it */
  kotIds: Record<string, string>;
};

const EMPTY: Data = {
  deviceCookie: null,
  lastSession: null,
  till: null,
  cache: {},
  orders: {},
  tickets: {},
  outbox: [],
  failed: [],
  seq: 0,
  kotIds: {},
};

export class Store {
  data: Data;
  private file: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'hub.json');
    this.data = { ...EMPTY, ...read(this.file) };
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  menu(outletId: string) {
    return this.data.cache[`/pos/menu?outletId=${outletId}`] as PosMenu | undefined;
  }

  putOrder(order: Order) {
    this.data.orders[order.id] = order;
    this.save();
  }

  ordersFor(outletId: string) {
    return Object.values(this.data.orders).filter((o) => o.outletId === outletId);
  }

  queue(entry: Omit<Queued, 'seq' | 'at'>) {
    this.data.seq += 1;
    this.data.outbox.push({ ...entry, seq: this.data.seq, at: new Date().toISOString() });
    this.flush();
  }

  nextNumber(key: string) {
    const till = this.data.till!;
    const value = (till.counters[key] ?? 0) + 1;
    till.counters[key] = value;
    // a printed number must never be handed out twice, even after a crash
    this.flush();
    return value;
  }
}

function read(file: string): Partial<Data> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}
