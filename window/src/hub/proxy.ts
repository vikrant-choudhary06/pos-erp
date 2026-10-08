import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { isDown, type Cloud } from './cloud';
import { cookieHeader, DEVICE_COOKIE, parseCookies } from './http';
import type { Store } from './store';

// Online, the hub is a plain reverse proxy to the cloud. Three things make
// that work for tablets on the shop's LAN:
//  - Origin/Host are rewritten, so the cloud's CSRF check sees itself.
//  - Cookies lose Secure/Domain, so they stick on http://192.168.x.x:7400.
//  - The till cookie (pos_device) stays with the hub and is added to every
//    request, so every tablet bills as this counter.

const HOP = ['connection', 'keep-alive', 'upgrade', 'proxy-connection', 'transfer-encoding', 'te'];

export type Forwarded = {
  status: number;
  type: string;
  /** set when the reply was buffered (JSON, pages, static files) */
  body?: Buffer;
};

export function forward(
  cloud: Cloud,
  store: Store,
  req: IncomingMessage,
  res: ServerResponse,
  options: { raw: Buffer; buffer: boolean; stream?: boolean },
): Promise<Forwarded | null> {
  const headers: OutgoingHttpHeaders = { ...req.headers };
  for (const h of HOP) delete headers[h];
  headers.host = cloud.base.host;
  headers['accept-encoding'] = 'identity';
  if (headers.origin) headers.origin = cloud.origin;
  if (typeof headers.referer === 'string') {
    headers.referer = headers.referer.replace(/^https?:\/\/[^/]+/, cloud.origin);
  }

  const cookies = parseCookies(req.headers.cookie);
  delete cookies[DEVICE_COOKIE];
  headers.cookie = cookieHeader({ ...cookies, [DEVICE_COOKIE]: store.data.deviceCookie });
  if (options.raw.length) headers['content-length'] = options.raw.length;
  else delete headers['content-length'];

  return new Promise((resolve) => {
    const upstream = cloud.open(req.method!, req.url!, headers, options.stream ? 0 : 10_000);
    let answered = false;

    upstream.on('timeout', () => upstream.destroy(new Error('Cloud timed out')));
    upstream.on('error', () => {
      if (!answered) resolve(null);
      else res.destroy();
    });

    upstream.on('response', (reply) => {
      const status = reply.statusCode ?? 502;
      if (isDown(status) && req.url!.startsWith('/api/')) {
        reply.resume();
        resolve(null);
        return;
      }
      answered = true;
      const type = String(reply.headers['content-type'] ?? '');
      res.writeHead(status, responseHeaders(reply, store, cloud));

      if (!options.buffer) {
        reply.pipe(res);
        res.on('close', () => reply.destroy());
        resolve({ status, type });
        return;
      }
      const chunks: Buffer[] = [];
      reply.on('data', (c: Buffer) => chunks.push(c));
      reply.on('end', () => {
        const body = Buffer.concat(chunks);
        res.end(body);
        resolve({ status, type, body });
      });
      reply.on('error', () => res.destroy());
    });

    upstream.end(options.raw);
  });
}

function responseHeaders(reply: IncomingMessage, store: Store, cloud: Cloud) {
  const headers: OutgoingHttpHeaders = { ...reply.headers };
  for (const h of HOP) delete headers[h];
  // plain http on the LAN, HSTS would only confuse the browser
  delete headers['strict-transport-security'];

  if (typeof headers.location === 'string' && headers.location.startsWith(cloud.origin)) {
    headers.location = headers.location.slice(cloud.origin.length) || '/';
  }

  const cookies: string[] = [];
  for (const line of reply.headers['set-cookie'] ?? []) {
    const [pair] = line.split(';');
    const name = pair.slice(0, pair.indexOf('=')).trim();
    if (name === DEVICE_COOKIE) {
      keepDeviceCookie(store, line, pair);
      continue;
    }
    cookies.push(line.replace(/;\s*secure/gi, '').replace(/;\s*domain=[^;]*/gi, ''));
  }
  headers['set-cookie'] = cookies;
  return headers;
}

function keepDeviceCookie(store: Store, line: string, pair: string) {
  const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1).trim());
  const expires = line.match(/expires=([^;]+)/i)?.[1];
  const cleared =
    !value || /max-age=0/i.test(line) || (expires && Date.parse(expires) < Date.now());
  store.data.deviceCookie = cleared ? null : value;
  if (cleared) store.data.till = null;
  store.flush();
}
