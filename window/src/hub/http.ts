import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const SESSION_COOKIE = 'pos_session';
export const DEVICE_COOKIE = 'pos_device';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseJson(raw: Buffer): any {
  if (!raw.length) return undefined;
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return undefined;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  // a 204 must not carry a body
  if (body === undefined || status === 204) {
    res.writeHead(status === 200 ? 204 : status).end();
    return;
  }
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(text);
}

export function sendError(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { statusCode: status, message });
}

export function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const value = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(value);
    } catch {
      out[part.slice(0, i).trim()] = value;
    }
  }
  return out;
}

export function cookieHeader(cookies: Record<string, string | null | undefined>) {
  return Object.entries(cookies)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('; ');
}

export const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
