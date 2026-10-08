import type { CookieOptions, Request, Response } from 'express';

export const SESSION_COOKIE = 'pos_session';
export const SIGNUP_COOKIE = 'pos_signup';
export const DEVICE_COOKIE = 'pos_device';

const base: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export function setCookie(res: Response, name: string, value: string, expires: Date) {
  res.cookie(name, value, { ...base, expires });
}

export function clearCookie(res: Response, name: string) {
  res.clearCookie(name, base);
}

export function readSessionToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[SESSION_COOKIE];
  if (fromCookie) return fromCookie;

  // POS devices send the token as a bearer header instead of a cookie
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
}
