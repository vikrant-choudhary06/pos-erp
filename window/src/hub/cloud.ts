import http, { type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import https from 'node:https';
import { cookieHeader, DEVICE_COOKIE, HttpError, parseJson, SESSION_COOKIE } from './http';
import type { Store } from './store';

export type CloudReply = { status: number; headers: IncomingHttpHeaders; body: Buffer };

/** Talks to the cloud on the hub's own behalf: replaying the queue, numbering, refreshing. */
export class Cloud {
  base: URL;

  constructor(
    url: string,
    private store: Store,
  ) {
    this.base = new URL(url);
    if (
      !['http:', 'https:'].includes(this.base.protocol) ||
      this.base.username ||
      this.base.password
    )
      throw new Error('Invalid cloud address');
    if (
      this.base.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(this.base.hostname)
    )
      throw new Error('The cloud address must use HTTPS');
  }

  get origin() {
    return this.base.origin;
  }

  /** Only origin-form paths may be forwarded, never client-selected hosts. */
  resolveTarget(path: string): URL {
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u0020\u007f#]/.test(path)) {
      throw new HttpError(400, 'Invalid request target');
    }
    const target = new URL(path, this.base);
    if (target.origin !== this.origin || target.username || target.password) {
      throw new HttpError(400, 'Invalid request target');
    }
    return target;
  }

  /** Validate before opening a socket or sending any credentials. */
  open(
    method: string,
    path: string,
    headers: http.OutgoingHttpHeaders,
    timeout = 8000,
  ): http.ClientRequest {
    const target = this.resolveTarget(path);
    const lib = this.base.protocol === 'https:' ? https : http;
    return lib.request(target, { method, headers, timeout });
  }

  request(
    method: string,
    path: string,
    options: { session?: string | null; body?: unknown; timeout?: number } = {},
  ): Promise<CloudReply> {
    const payload =
      options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body));
    const headers: http.OutgoingHttpHeaders = {
      accept: '*/*',
      'accept-encoding': 'identity',
      cookie: cookieHeader({
        [SESSION_COOKIE]: options.session,
        [DEVICE_COOKIE]: this.store.data.deviceCookie,
      }),
    };
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = payload.length;
    }

    return new Promise((resolve, reject) => {
      const req = this.open(method, path, headers, options.timeout);
      req.on('timeout', () => req.destroy(new Error('Cloud timed out')));
      req.on('error', reject);
      req.on('response', (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on('error', reject);
      });
      req.end(payload);
    });
  }

  async json<T>(path: string, session: string | null): Promise<T | undefined> {
    const reply = await this.request('GET', path, { session });
    return reply.status === 200 ? (parseJson(reply.body) as T) : undefined;
  }

  async reachable() {
    try {
      const reply = await this.request('GET', '/api/health', { timeout: 4000 });
      return reply.status < 500;
    } catch {
      return false;
    }
  }
}

/** The cloud's web server answers 502-504 when it can't reach its own API. */
export const isDown = (status: number) => status === 502 || status === 503 || status === 504;
