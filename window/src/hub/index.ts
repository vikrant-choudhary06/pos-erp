import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import { businessDate, financialYear, type Kot, type Order } from '@pos/shared';
import { Cloud } from './cloud';
import { LocalEvents } from './events';
import {
  hash,
  HttpError,
  parseCookies,
  parseJson,
  readBody,
  sendError,
  sendJson,
  SESSION_COOKIE,
} from './http';
import { LocalApi } from './local-api';
import { Pages } from './pages';
import { forward } from './proxy';
import { drain } from './sync';
import { Store } from './store';

export type HubOptions = {
  cloudUrl: string;
  dataDir: string;
  port?: number;
  host?: string;
  log?: (message: string) => void;
};

export type HubStatus = {
  mode: 'online' | 'offline' | 'syncing';
  cloudUrl: string;
  port: number;
  addresses: string[];
  till: { code: string; outletCode: string } | null;
  pending: number;
  failed: { seq: number; label: string; error?: string; at: string }[];
};

// GET replies worth keeping for when the cloud is away
const CACHED = [
  /^\/api\/pos\/menu$/,
  /^\/api\/outlets$/,
  /^\/api\/business$/,
  /^\/api\/shifts\/current$/,
  /^\/api\/outlets\/[^/]+\/stations$/,
  /^\/api\/devices\/current$/,
];

const POLL = 5000;

export async function startHub(options: HubOptions) {
  const log = options.log ?? (() => {});
  const store = new Store(options.dataDir);
  const cloud = new Cloud(options.cloudUrl, store);
  const pages = new Pages(options.dataDir);
  const events = new LocalEvents();
  const local = new LocalApi(store, events);
  const streams = new Set<ServerResponse>();
  const listeners = new Set<(status: HubStatus) => void>();

  let cloudUp = true;
  let forced = false;
  let syncing = false;
  let stopped = false;
  let lastTill = 0;
  let lastWarm = 0;
  let wasLocal = false;

  const isLocal = () => forced || !cloudUp || store.data.outbox.length > 0;

  function changed() {
    const nowLocal = isLocal();
    if (nowLocal !== wasLocal) {
      wasLocal = nowLocal;
      log(nowLocal ? 'Working offline' : 'Back online');
      // everyone's live connection moves to wherever orders now come from
      if (nowLocal) for (const s of streams) s.destroy();
      else events.closeAll();
    }
    const current = status();
    for (const fn of listeners) fn(current);
  }

  function cloudDown() {
    if (!cloudUp) return;
    cloudUp = false;
    changed();
  }

  // --- requests ---

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://hub');
    const isApi = url.pathname.startsWith('/api/');
    const session = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const raw = await readBody(req);

    // the hub numbers offline orders itself, browsers behind it never should
    if (url.pathname === '/api/devices/me') return sendJson(res, 200, null);

    if (!isLocal()) {
      if (req.method === 'GET' && url.pathname.startsWith('/_next/static/')) {
        const saved = pages.get(url.pathname);
        if (saved) return sendFile(res, saved.type, saved.body, true);
      }

      const isStream = url.pathname === '/api/events';
      const keep = Pages.wanted(url.pathname) && req.method === 'GET' && !req.headers.rsc;
      if (isStream) streams.add(res);
      res.on('close', () => streams.delete(res));

      const reply = await forward(cloud, store, req, res, {
        raw,
        stream: isStream,
        buffer: !isStream && (isApi || keep),
      });

      if (reply) {
        if (reply.body && keep && reply.status === 200) {
          pages.put(url.pathname, reply.type, reply.body);
        }
        if (reply.body && isApi && reply.status < 300) {
          observe(req.method!, url, session, parseJson(raw), parseJson(reply.body));
        }
        return;
      }
      if (res.headersSent) return;
      cloudDown();
    }

    if (isApi) return answerLocally(req, res, url, session, raw);
    return servePage(req, res, url);
  }

  async function answerLocally(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    session: string | undefined,
    raw: Buffer,
  ) {
    if (url.pathname === '/api/events') {
      if (!local.meFor(session)) return sendError(res, 401, 'Please sign in again');
      return events.attach(res, url.searchParams.get('outletId') ?? '');
    }
    try {
      const reply = await local.handle(req.method!, url, session, parseJson(raw));
      sendJson(res, reply.status, reply.body);
      if (req.method !== 'GET') changed();
    } catch (err) {
      if (err instanceof HttpError) return sendError(res, err.status, err.message);
      log(`Hub error: ${(err as Error).stack}`);
      sendError(res, 500, 'Something went wrong on the counter');
    }
  }

  function servePage(req: IncomingMessage, res: ServerResponse, url: URL) {
    const saved = pages.get(url.pathname);
    // a client-side navigation gets the page itself, Next then loads it in full
    if (saved) return sendFile(res, saved.type, saved.body, url.pathname.startsWith('/_next/'));

    if (OFFLINE_REDIRECT.has(url.pathname) && pages.get('/pos')) {
      res.writeHead(307, { location: '/pos' }).end();
      return;
    }
    res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
    res.end(OFFLINE_HTML);
  }

  /** Keep the hub's copy of the shop up to date from what passes through. */
  function observe(method: string, url: URL, session: string | undefined, sent: any, body: any) {
    const path = url.pathname;
    const { data } = store;

    if (method === 'GET' && path === '/api/auth/me' && session) {
      data.cache[`me:${hash(session)}`] = body;
      data.lastSession = session;
    } else if (method === 'POST' && path === '/api/auth/logout' && session) {
      delete data.cache[`me:${hash(session)}`];
      if (data.lastSession === session) data.lastSession = null;
    } else if (method === 'GET' && CACHED.some((re) => re.test(path))) {
      data.cache[path.slice(4) + url.search] = body;
    } else if (method === 'GET' && path === '/api/orders/active') {
      const outletId = url.searchParams.get('outletId');
      for (const o of Object.values(data.orders))
        if (o.outletId === outletId) delete data.orders[o.id];
      for (const o of body as Order[]) data.orders[o.id] = o;
    } else if (
      method === 'GET' &&
      path === '/api/kitchen/tickets' &&
      !url.searchParams.get('stationId')
    ) {
      data.tickets[url.searchParams.get('outletId') ?? ''] = body as Kot[];
      syncTicketStatus(body as Kot[]);
    } else if (method === 'PATCH' && path.startsWith('/api/kitchen/tickets/')) {
      syncTicketStatus([{ id: path.split('/').pop()!, status: sent?.status } as Kot]);
    }

    const order = body?.order ?? body;
    if (
      order &&
      typeof order === 'object' &&
      order.id &&
      order.orderNo &&
      Array.isArray(order.items)
    ) {
      data.orders[order.id] = order;
    }
    store.save();
  }

  function syncTicketStatus(tickets: Kot[]) {
    for (const ticket of tickets) {
      for (const order of Object.values(store.data.orders)) {
        const kot = order.kots.find((k) => k.id === ticket.id);
        if (kot && ticket.status) kot.status = ticket.status;
      }
    }
  }

  // --- background work ---

  async function refreshTill() {
    const { data } = store;
    if (!data.deviceCookie || !data.lastSession) return;
    const menu = data.till ? store.menu(data.till.outletId) : undefined;
    const date = menu
      ? businessDate(new Date(), menu.outlet.timezone, menu.outlet.dayStartTime)
      : businessDate(new Date(), 'Asia/Kolkata', '00:00');
    const fy = financialYear(date);

    type Numbering = {
      code: string;
      outletId: string;
      outletCode: string;
      lastOrder: number;
      lastInvoice: number;
    };
    const info = await cloud.json<Numbering | null>(
      `/api/devices/me?date=${date}&fy=${fy}`,
      data.lastSession,
    );
    if (info === undefined) return;
    if (!info) {
      data.till = null;
      return store.flush();
    }
    const counters = data.till?.code === info.code ? { ...data.till.counters } : {};
    // never go backwards: the cloud may not have seen what was printed offline
    counters[`order:${date}`] = Math.max(counters[`order:${date}`] ?? 0, info.lastOrder);
    counters[`invoice:${fy}`] = Math.max(counters[`invoice:${fy}`] ?? 0, info.lastInvoice);
    data.till = { code: info.code, outletId: info.outletId, outletCode: info.outletCode, counters };
    store.flush();
  }

  /** After a sync the cloud's list of open orders replaces the hub's. */
  async function refreshOrders() {
    const session = store.data.lastSession;
    if (!session) return;
    const outlets = new Set(Object.values(store.data.orders).map((o) => o.outletId));
    if (store.data.till) outlets.add(store.data.till.outletId);

    for (const outletId of outlets) {
      const orders = await cloud.json<Order[]>(`/api/orders/active?outletId=${outletId}`, session);
      if (!orders) continue;
      for (const o of Object.values(store.data.orders)) {
        if (o.outletId === outletId) delete store.data.orders[o.id];
      }
      for (const o of orders) store.data.orders[o.id] = o;
      const tickets = await cloud.json<Kot[]>(`/api/kitchen/tickets?outletId=${outletId}`, session);
      if (tickets) {
        store.data.tickets[outletId] = tickets;
        syncTicketStatus(tickets);
      }
    }
    store.data.kotIds = {};
    store.flush();
  }

  async function tick() {
    if (syncing || stopped) return;
    syncing = true;
    try {
      if (!forced && !cloudUp) {
        cloudUp = await cloud.reachable();
        if (cloudUp) log('Cloud reachable again');
      }
      if (!forced && cloudUp && store.data.outbox.length) {
        changed();
        log(`Syncing ${store.data.outbox.length} change(s)`);
        const done = await drain(store, cloud);
        if (!done) cloudUp = false;
        else await refreshOrders().catch(() => {});
      }
      // check often until this counter is a till, then every few minutes
      const every = store.data.till ? 5 * 60_000 : 30_000;
      if (!isLocal() && store.data.deviceCookie && Date.now() - lastTill > every) {
        lastTill = Date.now();
        await refreshTill().catch(() => {});
      }
      if (!isLocal() && store.data.lastSession && Date.now() - lastWarm > 60 * 60_000) {
        lastWarm = Date.now();
        void pages.warm(cloud, store.data.lastSession);
      }
    } finally {
      syncing = false;
      changed();
    }
  }

  function status(): HubStatus {
    return {
      mode: isLocal() ? (cloudUp && !forced ? 'syncing' : 'offline') : 'online',
      cloudUrl: cloud.origin,
      port,
      addresses: lanAddresses().map((a) => `http://${a}:${port}`),
      till: store.data.till && {
        code: store.data.till.code,
        outletCode: store.data.till.outletCode,
      },
      pending: store.data.outbox.length,
      failed: store.data.failed.map(({ seq, label, error, at }) => ({ seq, label, error, at })),
    };
  }

  // --- server ---

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      log(`Hub error: ${(err as Error).stack}`);
      if (!res.headersSent) sendError(res, 500, 'Something went wrong on the counter');
      else res.destroy();
    });
  });
  server.keepAliveTimeout = 65_000;
  // websockets (Next's dev reload) pass straight through while online
  server.on('upgrade', (req, socket, head) => {
    if (isLocal()) return socket.destroy();
    const upstream = cloud.open('GET', req.url!, { ...req.headers, host: cloud.base.host }, 0);
    upstream.on('upgrade', (reply, cloudSocket, cloudHead) => {
      const lines = Object.entries(reply.headers).map(([k, v]) => `${k}: ${v}`);
      socket.write(['HTTP/1.1 101 Switching Protocols', ...lines, '', ''].join('\r\n'));
      if (cloudHead.length) socket.write(cloudHead);
      if (head.length) cloudSocket.write(head);
      cloudSocket.pipe(socket).pipe(cloudSocket);
      socket.on('error', () => cloudSocket.destroy());
      cloudSocket.on('error', () => socket.destroy());
    });
    upstream.on('response', () => socket.destroy());
    upstream.on('error', () => socket.destroy());
    upstream.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 7400, options.host ?? '0.0.0.0', resolve);
  });
  const port = (server.address() as { port: number }).port;
  const timer = setInterval(() => void tick(), POLL);
  void tick();
  log(`Hub on port ${port}, cloud ${cloud.origin}`);

  return {
    port,
    status,
    onChange(fn: (status: HubStatus) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** For testing and the "work offline" switch in settings. */
    setForcedOffline(value: boolean) {
      forced = value;
      changed();
      if (!value) void tick();
    },
    async syncNow() {
      if (!forced) cloudUp = await cloud.reachable();
      lastTill = 0;
      await tick();
      return status();
    },
    dismissFailed(seq: number) {
      store.data.failed = store.data.failed.filter((m) => m.seq !== seq);
      store.flush();
      changed();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      events.stop();
      for (const s of streams) s.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.flush();
    },
  };
}

export type Hub = Awaited<ReturnType<typeof startHub>>;

function sendFile(res: ServerResponse, type: string, body: Buffer, immutable: boolean) {
  res.writeHead(200, {
    'content-type': type || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
  });
  res.end(body);
}

export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}

const OFFLINE_REDIRECT = new Set(['/', '/dashboard']);

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Offline</title>
<body style="font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#222">
<div style="text-align:center"><p style="font-weight:600">No internet right now</p>
<p style="color:#777">Billing still works from the POS screen.</p><a href="/pos" style="color:#222">Open POS</a></div>`;
