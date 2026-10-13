const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { randomBytes, randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const compiled = new Module(__filename, module);
compiled.paths = module.paths;
compiled._compile(
  buildSync({
    stdin: {
      contents: `
  export { startHub } from './src/hub';
  export { Store } from './src/hub/store';
  export { LocalApi } from './src/hub/local-api';
  export { LocalEvents } from './src/hub/events';
  export { Cloud } from './src/hub/cloud';
  export { keyProtection } from './src/hub/protection';
  export { hash, readBody, MAX_BODY_BYTES } from './src/hub/http';
  export { validateMutation } from './src/hub/validation';
  export { drain } from './src/hub/sync';
`,
      resolveDir: path.resolve(__dirname, '..'),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  }).outputFiles[0].text,
  __filename,
);
const {
  startHub,
  Store,
  LocalApi,
  LocalEvents,
  Cloud,
  keyProtection,
  hash,
  readBody,
  MAX_BODY_BYTES,
  validateMutation,
  drain,
} = compiled.exports;
const protection = () => keyProtection(randomBytes(32).toString('base64'));
const rejects = (promise, status) => assert.rejects(promise, (e) => e.status === status);
function directory(t) {
  const root = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(root, 'rizzoto-offline-security-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(dir)), root);
    assert.ok(path.basename(dir).startsWith('rizzoto-offline-security-'));
    fs.rmSync(dir, { recursive: true });
  });
  return dir;
}
function fixture(t) {
  let store, events;
  t.after(() => {
    events.stop();
    store.flush();
  });
  const dir = directory(t),
    cipher = protection();
  store = new Store(dir, cipher);
  events = new LocalEvents();
  const outlet = randomUUID(),
    other = randomUUID(),
    item = randomUUID();
  const session = 'SYNTHETIC_SESSION';
  const me = {
    offlineExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    user: { id: randomUUID(), isOwner: true },
    outlets: [{ id: outlet }],
    permissions: [],
  };
  store.data.cache[`me:${hash(session)}`] = me;
  store.data.till = { code: 'D1', outletId: outlet, outletCode: 'TEST', counters: {} };
  const menu = {
    outlet: {
      id: outlet,
      timezone: 'Asia/Kolkata',
      dayStartTime: '00:00',
      priceIncludesTax: false,
      settings: { serviceChargePercent: 0 },
    },
    tables: [],
    categories: [],
    areas: [],
    items: [
      {
        id: item,
        name: 'Coffee',
        foodType: 'VEG',
        basePrice: '100',
        hasVariants: false,
        variants: [],
        prices: [],
        taxes: [{ name: 'GST', rate: '5' }],
        outOfStock: false,
        modifierGroups: [],
      },
    ],
  };
  store.data.cache[`/pos/menu?outletId=${outlet}`] = menu;
  store.data.cache[`/shifts/current?outletId=${outlet}`] = { id: randomUUID() };
  const api = new LocalApi(store, events);
  const call = (method, route, body, token = session) =>
    api.handle(method, new URL(`http://localhost/api${route}`), token, body);
  return { store, events, outlet, other, item, session, me, menu, api, call, dir, cipher };
}

test('encrypted store roundtrip, plaintext migration, scratch recovery and fail-closed tamper detection', (t) => {
  const dir = directory(t),
    cipher = protection(),
    file = path.join(dir, 'hub.json');
  const legacy = {
    deviceCookie: 'SYNTHETIC_DEVICE_SECRET',
    lastSession: 'SYNTHETIC_SESSION_SECRET',
    outbox: [{ session: 'SYNTHETIC_QUEUE_SECRET', seq: 1 }],
    seq: 1,
  };
  fs.writeFileSync(file + '.tmp', JSON.stringify(legacy));
  const migrated = new Store(dir, cipher);
  assert.deepEqual(migrated.data.outbox, legacy.outbox);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(0, 4).toString(), 'RZH1');
  assert.equal(bytes.includes(Buffer.from('SYNTHETIC')), false);
  assert.deepEqual(new Store(dir, cipher).data, migrated.data);
  assert.throws(() => new Store(dir, protection()));
  assert.deepEqual(fs.readFileSync(file), bytes, 'Wrong key must not erase orders');
  const tampered = Buffer.from(bytes);
  tampered[tampered.length - 1] ^= 1;
  fs.writeFileSync(file, tampered);
  assert.throws(() => new Store(dir, cipher));
  assert.deepEqual(fs.readFileSync(file), tampered);
  assert.throws(() => keyProtection(undefined));
  assert.throws(() => keyProtection('short'));
});

test('offline identity expires, legacy identities are denied, revoked identities cannot return', async (t) => {
  const f = fixture(t);
  assert.equal((await f.call('GET', '/auth/me')).status, 200);
  for (const expiry of [undefined, 'invalid', new Date(Date.now() - 1).toISOString()]) {
    f.me.offlineExpiresAt = expiry;
    await rejects(f.call('GET', '/auth/me'), 401);
    await rejects(
      f.call('POST', '/orders', { id: randomUUID(), outletId: f.outlet, type: 'COUNTER' }),
      401,
    );
  }
  f.me.offlineExpiresAt = new Date(Date.now() + 3600000).toISOString();
  f.store.data.revokedSessions[hash(f.session)] = true;
  await rejects(f.call('GET', '/auth/me'), 401);
  assert.equal(f.store.data.outbox.length, 0);
});

test('cached reads, kitchen, duplicate order IDs and event streams respect outlet and session scope', async (t) => {
  const f = fixture(t);
  const foreignOrder = randomUUID();
  f.store.data.orders[foreignOrder] = { id: foreignOrder, outletId: f.other, kots: [] };
  f.store.data.cache[`session:${hash(f.session)}:/pos/menu?outletId=${f.other}`] = { secret: true };
  f.store.data.cache[`session:${hash('owner')}:/business`] = { secret: true };
  for (const route of [
    `/kitchen/tickets?outletId=${f.other}`,
    `/orders/active?outletId=${f.other}`,
    `/orders/${foreignOrder}`,
    `/pos/menu?outletId=${f.other}`,
    `/outlets/${f.other}/stations`,
  ])
    await rejects(f.call('GET', route), 404);
  await rejects(f.call('GET', '/business'), 400);
  await rejects(
    f.call('POST', '/orders', { id: foreignOrder, outletId: f.outlet, type: 'COUNTER' }),
    404,
  );
  assert.throws(
    () => f.events.attach({}, f.other, () => f.api.authorizeOutlet(f.session, f.other)),
    (e) => e.status === 404,
  );
  const res = new EventEmitter();
  res.lines = [];
  res.writeHead = () => {};
  res.write = (v) => res.lines.push(v);
  res.end = () => {
    res.ended = true;
  };
  f.events.attach(res, f.outlet, () => f.api.authorizeOutlet(f.session, f.outlet));
  f.events.emit(f.other, { type: 'order' });
  assert.equal(res.lines.length, 1);
  f.events.emit(f.outlet, { type: 'order' });
  assert.equal(res.lines.length, 2);
  f.me.offlineExpiresAt = new Date(0).toISOString();
  f.events.emit(f.outlet, { type: 'order' });
  assert.equal(res.lines.length, 2);
  assert.equal(res.ended, true);
});

test('invalid quantities and payments cannot mutate orders, counters or the replay queue', async (t) => {
  const f = fixture(t),
    id = randomUUID(),
    lineId = randomUUID();
  await f.call('POST', '/orders', { id, outletId: f.outlet, type: 'COUNTER' });
  const unchanged = async (route, body, method = 'POST') => {
    const before = JSON.stringify(f.store.data);
    await rejects(f.call(method, route, body), 400);
    assert.equal(JSON.stringify(f.store.data), before);
  };
  for (const quantity of [-1, 0, 1000, '2', null, 0.0001, 1.1234, Infinity, NaN])
    await unchanged(`/orders/${id}/items`, {
      items: [{ id: lineId, menuItemId: f.item, quantity }],
    });
  const line = { id: lineId, menuItemId: f.item, quantity: 2 };
  await unchanged(`/orders/${id}/items`, { items: [line, line] });
  await unchanged(`/orders/${id}/items`, { items: [{ ...line, variantId: randomUUID() }] });
  await unchanged(`/orders/${id}/items`, {
    items: [{ ...line, modifierOptionIds: [randomUUID()] }],
  });
  f.menu.items[0].outOfStock = true;
  await unchanged(`/orders/${id}/items`, { items: [line] });
  f.menu.items[0].outOfStock = false;
  await f.call('POST', `/orders/${id}/items`, { items: [line] });
  for (const amount of [-1, 0, '100', null, 1.111, 10000001])
    await unchanged(`/orders/${id}/payments`, {
      payments: [{ id: randomUUID(), method: 'CASH', amount }],
    });
  await unchanged(`/orders/${id}/payments`, {
    payments: [{ id: randomUUID(), method: 'CARD', amount: 1000 }],
  });
  await unchanged(`/orders/${id}/payments`, { payments: [], tip: 2 });
  await unchanged(`/orders/${id}/discount`, { type: 'PERCENT', value: 101 }, 'PUT');
  await unchanged(`/orders/${id}/items/${lineId}`, { quantity: -1 }, 'PATCH');
  await unchanged(`/orders/${id}`, { grandTotal: '0' }, 'PATCH');
});

test('valid offline order, KOT, bill, payment and restart preserve correct totals and replay data', async (t) => {
  const f = fixture(t),
    id = randomUUID();
  await f.call('POST', '/orders', { id, outletId: f.outlet, type: 'COUNTER' });
  await f.call('POST', `/orders/${id}/items`, {
    items: [{ id: randomUUID(), menuItemId: f.item, quantity: 2 }],
  });
  const kot = (await f.call('POST', `/orders/${id}/kot`, {})).body[0];
  await f.call('PATCH', `/kitchen/tickets/${kot.id}`, { status: 'READY' });
  const billed = (await f.call('POST', `/orders/${id}/bill`, {})).body;
  assert.equal(Number(billed.grandTotal), 210);
  const paid = (
    await f.call('POST', `/orders/${id}/payments`, {
      payments: [{ id: randomUUID(), method: 'CASH', amount: 250 }],
    })
  ).body;
  assert.equal(paid.order.status, 'PAID');
  assert.equal(Number(paid.change), 40);
  assert.equal(Number(paid.order.paidTotal), 210);
  assert.equal(f.store.data.outbox.length, 6);
  assert.ok(f.store.data.outbox.every((q) => q.session === f.session));
  const reopened = new Store(f.dir, f.cipher);
  assert.deepEqual(reopened.data, JSON.parse(JSON.stringify(f.store.data)));
  assert.equal((await f.call('GET', `/orders/active?outletId=${f.outlet}`)).body.length, 0);
  const replayed = [],
    realKotId = randomUUID();
  assert.equal(
    await drain(reopened, {
      request: async (method, route, options) => {
        replayed.push({ method, route, ...options });
        const body = route.endsWith('/kot')
          ? [{ id: realKotId, createdAt: new Date().toISOString() }]
          : route.endsWith('/payments')
            ? paid
            : {};
        return { status: 200, body: Buffer.from(JSON.stringify(body)) };
      },
    }),
    true,
  );
  assert.equal(replayed.length, 6);
  assert.equal(replayed[3].route, `/api/kitchen/tickets/${realKotId}`);
  assert.ok(replayed.every((r) => r.session === f.session));
  assert.equal(reopened.data.outbox.length, 0);
  assert.equal(reopened.data.failed.length, 0);
});

test('schema rejects oversized arrays, metadata and spoofed server-owned values', () => {
  const id = randomUUID(),
    outletId = randomUUID();
  const invalid = [
    ['POST', '/orders', { id, outletId, type: 'UNKNOWN' }],
    ['POST', '/orders', { id, outletId, type: 'COUNTER', covers: -1 }],
    ['POST', '/orders', { id, outletId, type: 'COUNTER', orderNo: 'D1-10' }],
    ['POST', '/orders', { id, outletId, type: 'COUNTER', customerName: 'x'.repeat(81) }],
    [
      'POST',
      `/orders/${id}/items`,
      {
        items: Array.from({ length: 101 }, () => ({
          id: randomUUID(),
          menuItemId: id,
          quantity: 1,
        })),
      },
    ],
    ['POST', `/orders/${id}/payments`, { payments: [{ id, method: 'UNKNOWN', amount: 5 }] }],
    [
      'POST',
      `/orders/${id}/payments`,
      {
        payments: [
          { id, method: 'CASH', amount: 5 },
          { id, method: 'CASH', amount: 5 },
        ],
      },
    ],
    ['POST', `/orders/${id}/void`, { reason: ' ' }],
    ['PATCH', `/kitchen/tickets/${id}`, { status: 'UNKNOWN' }],
  ];
  for (const args of invalid)
    assert.throws(
      () => validateMutation(...args),
      (e) => e.status === 400,
    );
});

test('body size and timeout limits apply before buffering completes', async (t) => {
  const request = (headers = {}) => {
    const req = new EventEmitter();
    req.headers = headers;
    req.pause = () => {
      req.paused = true;
    };
    return req;
  };
  await rejects(readBody(request({ 'content-length': MAX_BODY_BYTES + 1 })), 413);
  let req = request(),
    promise = readBody(req);
  req.emit('data', Buffer.alloc(MAX_BODY_BYTES));
  req.emit('data', Buffer.from('x'));
  await rejects(promise, 413);
  assert.equal(req.paused, true);
  assert.equal(req.listenerCount('data'), 0);
  req = request();
  promise = readBody(req);
  req.emit('data', Buffer.from('{}'));
  req.emit('end');
  assert.equal((await promise).toString(), '{}');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  req = request();
  promise = readBody(req);
  t.mock.timers.tick(10000);
  await rejects(promise, 408);
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

test(
  'hub logout retains queued sales across restart and revokes only after replay',
  { timeout: 20000 },
  async (t) => {
    const dir = directory(t),
      cipher = protection(),
      seen = [];
    let online = false;
    const upstream = http.createServer((req, res) => {
      req.resume();
      if (!online) return res.writeHead(503).end();
      seen.push({ path: req.url, cookie: req.headers.cookie });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
    const port = await listen(upstream);
    const store = new Store(dir, cipher);
    const entry = {
      session: 'SYNTHETIC_SESSION',
      orderId: randomUUID(),
      method: 'POST',
      path: '/orders',
      body: { savedSale: true },
      label: 'Saved sale',
    };
    store.data.cache[`me:${hash(entry.session)}`] = {
      offlineExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    store.queue(entry);
    const options = {
      cloudUrl: `http://127.0.0.1:${port}`,
      dataDir: dir,
      protection: cipher,
      port: 0,
    };
    let hub;
    try {
      hub = await startHub(options);
      hub.setForcedOffline(true);
      const logout = await request(hub.port, '/api/auth/logout', { method: 'POST' });
      assert.equal(logout.status, 200);
      assert.equal(hub.status().pending, 1);
      await hub.stop();
      hub = null;
      const saved = new Store(dir, cipher);
      assert.equal(saved.data.outbox.length, 1);
      assert.equal(saved.data.revocations.length, 1);
      online = true;
      hub = await startHub(options);
      const until = Date.now() + 5000;
      while (!seen.some((r) => r.path === '/api/auth/logout') && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(
        seen.map((r) => r.path),
        ['/api/orders', '/api/auth/logout'],
      );
      assert.ok(seen.every((r) => r.cookie.includes('pos_session=SYNTHETIC_SESSION')));
      assert.equal(hub.status().pending, 0);
      assert.equal((await request(hub.port, '/api/auth/me')).status, 401);
    } finally {
      await hub?.stop();
      upstream.closeAllConnections();
      await new Promise((resolve) => upstream.close(resolve));
    }
  },
);
function request(
  port,
  route,
  { tls, body, method = 'GET', token = 'SYNTHETIC_SESSION', headers = {} } = {},
) {
  return new Promise((resolve, reject) => {
    const req = (tls ? https : http).request(
      {
        host: '127.0.0.1',
        port,
        path: route,
        method,
        ca: tls,
        headers: { cookie: `pos_session=${token}`, connection: 'close', ...headers },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.setTimeout(3000, () => req.destroy(new Error('Test request timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

test(
  'live HTTPS hub uses Secure cookies, enforces size/CSRF checks and persists offline logout',
  { timeout: 20000 },
  async (t) => {
    const seen = [];
    const upstream = http.createServer((req, res) => {
      seen.push(req.url);
      req.resume();
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'pos_session=SYNTHETIC_SESSION; HttpOnly; SameSite=Lax',
      });
      res.end(
        JSON.stringify(
          req.url === '/api/auth/me'
            ? {
                user: { id: 'user', isOwner: true },
                outlets: [],
                permissions: [],
                offlineExpiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
              }
            : { ok: true },
        ),
      );
    });
    const port = await listen(upstream);
    const dir = directory(t),
      cipher = protection();
    const cert = fs.readFileSync(path.join(__dirname, 'fixtures/hub-cert.pem'));
    const key = fs.readFileSync(path.join(__dirname, 'fixtures/hub-key.pem'));
    const options = {
      cloudUrl: `http://127.0.0.1:${port}`,
      dataDir: dir,
      protection: cipher,
      port: 0,
      host: '127.0.0.1',
      tls: { cert, key },
    };
    let hub;
    try {
      await assert.rejects(startHub({ ...options, tls: undefined, host: '0.0.0.0' }), /TLS/);
      await assert.rejects(
        startHub({
          ...options,
          tls: { cert: Buffer.from('invalid'), key: Buffer.from('invalid') },
        }),
      );
      assert.throws(() => new Cloud('http://cloud.example', {}), /HTTPS/);
      hub = await startHub(options);
      await assert.rejects(
        startHub({ ...options, port: hub.port }),
        (error) => error.code === 'EADDRINUSE',
      );
      const me = await request(hub.port, '/api/auth/me', { tls: cert });
      assert.equal(me.status, 200);
      assert.match(me.headers['set-cookie'][0], /; Secure/);
      await assert.rejects(
        request(hub.port, '/api/auth/me'),
        'Plain HTTP cannot reach TLS listener',
      );
      const before = seen.length;
      assert.equal(
        (
          await request(hub.port, '/api/orders', {
            tls: cert,
            method: 'POST',
            headers: { 'content-length': MAX_BODY_BYTES + 1 },
          })
        ).status,
        413,
      );
      assert.equal(
        (
          await request(hub.port, '/api/orders', {
            tls: cert,
            method: 'POST',
            headers: { origin: 'https://attacker.invalid' },
          })
        ).status,
        403,
      );
      assert.equal(seen.length, before);
      hub.setForcedOffline(true);
      for (let index = 0; index < 3; index++) {
        const unknown = await request(hub.port, '/api/auth/logout', {
          tls: cert,
          method: 'POST',
          token: `UNKNOWN_SESSION_${index}`,
        });
        assert.equal(unknown.status, 503);
        assert.equal(
          unknown.headers['set-cookie'],
          undefined,
          'Keep the cookie so browser retry can reach the cloud',
        );
      }
      const cached = await request(hub.port, '/api/auth/me', { tls: cert });
      assert.ok(Date.parse(JSON.parse(cached.body).offlineExpiresAt) <= Date.now() + 12 * 3600000);
      assert.equal(
        (await request(hub.port, '/api/orders', { tls: cert, method: 'POST', body: '{' })).status,
        400,
      );
      const logout = await request(hub.port, '/api/auth/logout', { tls: cert, method: 'POST' });
      assert.equal(logout.status, 200);
      assert.match(logout.headers['set-cookie'][0], /Max-Age=0; Secure/);
      assert.equal((await request(hub.port, '/api/auth/me', { tls: cert })).status, 401);
      await hub.stop();
      hub = null;
      const disk = new Store(dir, cipher);
      assert.equal(disk.data.revocations.length, 1);
      assert.equal(
        Object.keys(disk.data.revokedSessions).length,
        1,
        'Unknown sessions cannot inflate the stored logout records',
      );
      assert.equal(disk.data.lastSession, null);
      assert.equal(disk.data.cache[`me:${hash('SYNTHETIC_SESSION')}`], undefined);
      hub = await startHub(options);
      assert.equal(
        (await request(hub.port, '/api/auth/me', { tls: cert })).status,
        401,
        'Restart and revocation replay cannot resurrect the token',
      );
    } finally {
      await hub?.stop();
      upstream.closeAllConnections();
      await new Promise((resolve) => upstream.close(resolve));
    }
  },
);
