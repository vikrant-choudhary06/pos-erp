import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

export const randomToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const hmac = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

export const randomDigits = (length: number) =>
  Array.from({ length }, () => randomInt(0, 10)).join('');

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
