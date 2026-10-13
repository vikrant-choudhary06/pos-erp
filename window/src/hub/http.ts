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

export const MAX_BODY_BYTES = 200 * 1024;

export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
      req.pause();
      return reject(new HttpError(413, 'Request body is too large'));
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('aborted', onAbort);
      req.off('error', fail);
    };
    const fail = (err: Error) => {
      cleanup();
      req.pause();
      reject(err);
    };
    const onAbort = () => fail(new HttpError(400, 'Request aborted'));
    const onData = (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) return fail(new HttpError(413, 'Request body is too large'));
      chunks.push(c);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const timer = setTimeout(() => fail(new HttpError(408, 'Request body timed out')), 10_000);
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('aborted', onAbort);
    req.on('error', fail);
  });
}

export function requestJson(raw: Buffer): unknown {
  if (!raw.length) return undefined;
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
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
