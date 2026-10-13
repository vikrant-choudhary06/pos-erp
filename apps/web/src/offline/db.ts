import Dexie, { type Table } from 'dexie';
import type { Order } from '@/lib/pos-types';

/** A request the till still owes the server, replayed in order once online. */
export type Mutation = {
  seq?: number;
  orderId: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** shown to staff if it can't be synced */
  label: string;
  createdAt: string;
  userId?: string;
  tenantId?: string;
  status: 'pending' | 'failed';
  error?: string;
};

type Cached = { key: string; value: unknown; savedAt: number };
type Meta = { key: string; value: unknown };

class PosDb extends Dexie {
  orders!: Table<Order, string>;
  outbox!: Table<Mutation, number>;
  cache!: Table<Cached, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super('counter-pos');
    this.version(1).stores({
      orders: 'id, outletId, status',
      outbox: '++seq, orderId, status',
      cache: 'key',
      meta: 'key',
    });
  }
}

let instance: PosDb | null = null;

// IndexedDB only exists in the browser, so open it on first use
export function db() {
  instance ??= new PosDb();
  return instance;
}

export async function getMeta<T>(key: string) {
  return (await db().meta.get(key))?.value as T | undefined;
}

export function setMeta(key: string, value: unknown) {
  return db().meta.put({ key, value });
}
