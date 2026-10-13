import { HttpError } from './http';

type Check = (value: any) => boolean;
const uuid: Check = (v) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text =
  (max: number, min = 0): Check =>
  (v) =>
    typeof v === 'string' && v.trim().length >= min && v.length <= max;
const number =
  (min: number, max: number, decimals: number): Check =>
  (v) =>
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= min &&
    v <= max &&
    Math.abs(v * 10 ** decimals - Math.round(v * 10 ** decimals)) < 0.000001;
const oneOf =
  (...values: string[]): Check =>
  (v) =>
    values.includes(v);
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);
const array =
  (check: Check, min: number, max: number): Check =>
  (v) =>
    Array.isArray(v) && v.length >= min && v.length <= max && v.every(check);
const unique: Check = (v) => new Set(v).size === v.length;
const object =
  (fields: Record<string, Check>): Check =>
  (v) =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).every((key) => Object.hasOwn(fields, key)) &&
    Object.entries(fields).every(([key, check]) => check(v[key]));
const meta = {
  type: optional(oneOf('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'COUNTER')),
  tableId: optional(uuid),
  covers: optional(number(1, 99, 0)),
  customerName: optional(text(80)),
  customerPhone: optional((v) => typeof v === 'string' && /^[6-9]\d{9}$/.test(v)),
  notes: optional(text(200)),
};
const item = object({
  id: uuid,
  menuItemId: uuid,
  variantId: optional(uuid),
  quantity: number(0.001, 999, 3),
  notes: optional(text(120)),
  modifierOptionIds: optional((v) => array(uuid, 0, 20)(v) && unique(v)),
});
const payment = object({
  id: uuid,
  method: oneOf('CASH', 'UPI', 'CARD', 'WALLET', 'CREDIT', 'OTHER'),
  amount: number(0.01, 10_000_000, 2),
  reference: optional(text(80)),
});

/** Validate all supported local mutations before numbering, saving or queueing. */
export function validateMutation(method: string, path: string, body: any) {
  let check: Check | undefined;
  if (method === 'POST' && path === '/orders') {
    check = object({
      ...meta,
      id: uuid,
      outletId: uuid,
      type: oneOf('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'COUNTER'),
    });
  } else if (method === 'PATCH' && /^\/orders\/[^/]+$/.test(path)) check = object(meta);
  else if (method === 'POST' && /\/items$/.test(path)) {
    check = object({ items: (v) => array(item, 1, 100)(v) && unique(v.map((i: any) => i.id)) });
  } else if (method === 'PATCH' && /\/items\/[^/]+$/.test(path)) {
    check = object({ quantity: optional(number(0.001, 999, 3)), notes: optional(text(120)) });
  } else if (method === 'PUT' && /\/discount$/.test(path)) {
    check = object({
      type: oneOf('PERCENT', 'FLAT'),
      value: number(0.01, 1_000_000, 2),
      reason: optional(text(200)),
    });
  } else if (method === 'POST' && /\/payments$/.test(path)) {
    check = object({
      payments: (v) => array(payment, 0, 10)(v) && unique(v.map((p: any) => p.id)),
      tip: optional(number(0, 100_000, 2)),
    });
  } else if (method === 'POST' && /\/void$/.test(path)) check = object({ reason: text(200, 3) });
  else if (method === 'POST' && /\/cancel$/.test(path))
    check = object({ reason: optional(text(200)) });
  else if (method === 'PATCH' && /^\/kitchen\/tickets\//.test(path)) {
    check = object({ status: oneOf('NEW', 'PREPARING', 'READY', 'SERVED') });
  } else if (/\/(bill|kot|discount)$/.test(path)) check = object({});
  if (check && !check(body ?? {})) throw new HttpError(400, 'Invalid request fields or values');
}
