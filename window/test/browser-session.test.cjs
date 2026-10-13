const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const { build } = require('esbuild');

const source = build({
  stdin: {
    contents: `export * from './src/offline/cache'; export * from './src/offline/session-lock'; export * from './src/offline/logout'; export * from './src/offline/sync'; export * from './src/lib/api';`,
    resolveDir: path.resolve(__dirname, '../../apps/web'),
    loader: 'ts',
  },
  tsconfig: path.resolve(__dirname, '../../apps/web/tsconfig.json'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'in-memory-browser-storage',
      setup(b) {
        b.onResolve({ filter: /^(?:@\/offline\/db|\.\/db)$/ }, () => ({
          path: 'db',
          namespace: 'fixture',
        }));
        b.onResolve({ filter: /^(?:@\/offline\/state|\.\/state)$/ }, () => ({
          path: 'state',
          namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents:
            path === 'db'
              ? 'export const db = () => globalThis.testDb;'
              : 'export const getOfflineState = () => globalThis.testState; export const setOfflineState = v => Object.assign(globalThis.testState, v);',
        }));
      },
    },
  ],
}).then((r) => r.outputFiles[0].text);

async function fixture() {
  const data = new Map(),
    storage = new Map(),
    queue = [];
  global.window = new EventTarget();
  global.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  global.testState = { online: true };
  global.testDb = {
    cache: {
      get: async (k) => data.get(k),
      put: async (v) => data.set(v.key, v),
      clear: async () => data.clear(),
    },
    orders: { put: async () => {} },
    outbox: {
      add: async (v) => queue.push({ ...v, seq: queue.length + 1 }),
      delete: async (seq) => {
        const i = queue.findIndex((q) => q.seq === seq);
        if (i !== -1) queue.splice(i, 1);
      },
      update: async (seq, v) =>
        Object.assign(
          queue.find((q) => q.seq === seq),
          v,
        ),
      where: (key) => ({
        equals: (value) => ({
          count: async () => queue.filter((q) => q[key] === value).length,
          first: async () => queue.find((q) => q[key] === value),
          modify: async (fn) => queue.filter((q) => q[key] === value).forEach(fn),
        }),
      }),
    },
  };
  const m = new Module(__filename, module);
  m.paths = module.paths;
  m._compile(await source, __filename);
  const me = {
    user: { id: 'alice' },
    business: { id: 'shop' },
    outlets: [{ id: 'outlet' }],
    offlineExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  data.set('me', { key: 'me', value: me });
  const calls = [];
  global.fetch = async (...args) => {
    calls.push(args);
    return Response.json({ ok: true });
  };
  return { ...m.exports, data, me, queue, calls };
}

test('offline logout denies API and cached access immediately while keeping unsynced work', async () => {
  const f = await fixture();
  await f.enqueue({ orderId: 'order', method: 'POST', path: '/orders', label: 'Order' });
  global.fetch = async () => {
    throw new Error('Disconnected');
  };
  await assert.rejects(f.api('/auth/logout', { method: 'POST' }), (e) => e.status === 0);
  assert.equal(f.sessionLocked(), true);
  await assert.rejects(f.cachedApi('me', '/auth/me'), (e) => e.status === 401);
  await assert.rejects(f.api('/orders'), (e) => e.status === 401);
  await f.forgetSession();
  assert.equal(f.data.size, 0);
  assert.equal(f.queue.length, 1);
  assert.equal(f.queue[0].userId, 'alice');
  assert.equal(f.queue[0].tenantId, 'shop');
});

test('offline cache expiry cannot be extended by reading it and old records fail closed', async () => {
  const f = await fixture();
  global.fetch = async () => {
    throw new Error('Disconnected');
  };
  const expiry = f.me.offlineExpiresAt;
  assert.equal((await f.cachedApi('me', '/auth/me')).offlineExpiresAt, expiry);
  assert.equal((await f.cachedApi('me', '/auth/me')).offlineExpiresAt, expiry);
  f.me.offlineExpiresAt = new Date(0).toISOString();
  await assert.rejects(f.cachedApi('me', '/auth/me'), (e) => e.status === 401);
  assert.equal(f.data.size, 0);
  f.unlockSession();
  f.data.set('me', { value: { ...f.me, offlineExpiresAt: undefined } });
  await assert.rejects(f.offlineIdentity(), (e) => e.status === 401);
});

test('fresh login purges old cache and a delayed response cannot restore the previous identity', async () => {
  const f = await fixture();
  let finish;
  global.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const old = f.cachedApi('me', '/auth/me');
  await f.forgetSession();
  global.fetch = async () => Response.json({ ok: true });
  await f.api('/auth/pin', { method: 'POST', body: { pin: '1234' } });
  assert.equal(f.sessionLocked(), false);
  assert.equal(f.data.size, 0);
  finish(Response.json(f.me));
  await assert.rejects(old, (e) => e.status === 401);
  assert.equal(f.data.size, 0);
});

test('outbox cannot replay under another account; same account can resume', async () => {
  const f = await fixture();
  await f.enqueue({ orderId: 'order', method: 'POST', path: '/orders', label: 'Order' });
  f.me.user.id = 'bob';
  const query = { invalidateQueries() {} };
  await f.flush(query);
  assert.equal(f.calls.length, 0);
  assert.equal(f.queue.length, 1);
  f.me.user.id = 'alice';
  await f.flush(query);
  assert.equal(f.calls.length, 1);
  assert.equal(f.queue.length, 0);
  await assert.rejects(f.authorizeOfflineOutlet('other'), (e) => e.status === 404);
});

test('pending browser sign-out is retried before a new login', async () => {
  const f = await fixture();
  global.fetch = async () => {
    throw new Error('Offline');
  };
  await assert.rejects(f.api('/auth/logout', { method: 'POST' }));
  assert.equal(localStorage.getItem('pos.pendingLogout'), '1');
  const paths = [];
  global.fetch = async (path) => {
    paths.push(path);
    return Response.json({ ok: true });
  };
  await f.api('/auth/pin', { method: 'POST', body: { pin: '1234' } });
  assert.deepEqual(paths, ['/api/auth/logout', '/api/auth/pin']);
  assert.equal(localStorage.getItem('pos.pendingLogout'), null);
  assert.equal(f.sessionLocked(), false);
});

test('legacy unowned work is retained for review instead of replaying as the current user', async () => {
  const f = await fixture();
  f.queue.push({ seq: 1, orderId: 'legacy', status: 'pending' });
  await f.flush({ invalidateQueries() {} });
  assert.equal(f.calls.length, 0);
  assert.equal(f.queue[0].status, 'failed');
  assert.match(f.queue[0].error, /predates session tracking/);
});
