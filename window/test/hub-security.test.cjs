const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');

// Exercise the actual TypeScript implementation without writing build artifacts.
const result = buildSync({
  stdin: {
    contents:
      "export { Cloud } from './src/hub/cloud'; export { startHub } from './src/hub'; export { forward } from './src/hub/proxy';",
    resolveDir: path.resolve(__dirname, '..'),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const compiled = new Module(__filename, module);
compiled.paths = module.paths;
compiled._compile(result.outputFiles[0].text, __filename);
const { Cloud, startHub, forward } = compiled.exports;
const deviceToken = 'SYNTHETIC_DEVICE_TOKEN';
const sessionToken = 'SYNTHETIC_SESSION_TOKEN';
const store = { data: { deviceCookie: deviceToken } };

const invalidTargets = [
  '//attacker.invalid/api/auth/me',
  '///attacker.invalid/probe',
  'http://attacker.invalid/probe',
  'https://attacker.invalid/probe',
  '//cloud.example@attacker.invalid/probe',
  '//cloud.example.attacker.invalid/probe',
  '//cloud.example:8443/probe',
  '/\\attacker.invalid/probe',
  '\\\\attacker.invalid/probe',
  '/\t/attacker.invalid/probe',
  '/\n/attacker.invalid/probe',
  '/\r/attacker.invalid/probe',
  ' //attacker.invalid/probe',
  '/path with spaces',
  '/api/health#fragment',
  'api/health',
  '',
];

for (const protocol of ['http:', 'https:']) {
  test(`${protocol} blocks unsafe targets before any network request`, async (t) => {
    const plain = t.mock.method(http, 'request', () => assert.fail('Unexpected HTTP request'));
    const secure = t.mock.method(https, 'request', () => assert.fail('Unexpected HTTPS request'));
    const cloud = new Cloud(
      `${protocol}//${protocol === 'http:' ? '127.0.0.1' : 'cloud.example'}`,
      store,
    );
    for (const target of invalidTargets) {
      assert.throws(
        () => cloud.open('GET', target, { cookie: sessionToken }),
        (err) => err.status === 400,
        JSON.stringify(target),
      );
      await assert.rejects(
        cloud.request('POST', target, { session: sessionToken, body: {} }),
        (err) => err.status === 400,
        JSON.stringify(target),
      );
      await assert.rejects(
        forward(
          cloud,
          store,
          { method: 'GET', url: target, headers: { cookie: `pos_session=${sessionToken}` } },
          {},
          { raw: Buffer.alloc(0), buffer: false },
        ),
        (err) => err.status === 400,
      );
    }
    assert.equal(plain.mock.callCount(), 0);
    assert.equal(secure.mock.callCount(), 0);
  });
}

test('normal paths and encoded values retain the configured origin and port', (t) => {
  const calls = [];
  t.mock.method(https, 'request', (url, options) => {
    calls.push({ url, options });
    return {};
  });
  const cloud = new Cloud('https://cloud.example:8443', store);
  for (const target of [
    '/',
    '/pos',
    '/api/orders?outletId=123',
    '/_next/static/chunks/app.js',
    '/_next/webpack-hmr',
    '/api/search?q=https%3A%2F%2Fexample.com',
    '/api/search?q=%23%20%5C',
    '/%2F%2Fexample.com',
  ]) {
    cloud.open('GET', target, { cookie: `pos_session=${sessionToken}` });
    const last = calls.at(-1);
    assert.equal(last.url.origin, 'https://cloud.example:8443');
    assert.equal(last.url.pathname + last.url.search, target);
    assert.equal(last.options.headers.cookie, `pos_session=${sessionToken}`);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}
function request(port, target, upgrade = false) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: target,
      method: 'GET',
      headers: {
        cookie: `pos_session=${sessionToken}; pos_device=UNTRUSTED_TABLET_DEVICE`,
        ...(upgrade ? { connection: 'Upgrade', upgrade: 'websocket' } : { connection: 'close' }),
      },
    });
    req.setTimeout(3000, () => req.destroy(new Error('Test request timed out')));
    req.on('error', reject);
    req.on('response', (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode);
    });
    req.end();
  });
}

test(
  'live hub rejects host redirection without leaking credentials or disrupting forwarding',
  { timeout: 20000 },
  async () => {
    const seen = [];
    const leaked = [];
    const cloudSockets = new Set();
    const cloudServer = http.createServer((req, res) => {
      if (req.url === '/api/health') {
        // The hub's background probe is separate from client-forwarded traffic.
        assert.equal(req.method, 'GET');
        assert.equal(req.headers.cookie, undefined);
        assert.equal(req.headers.authorization, undefined);
        return res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
      }
      seen.push({ url: req.url, cookie: req.headers.cookie });
      if (req.url === '/redirect') {
        res.writeHead(302, { location: `http://127.0.0.1:${otherPort}/capture` }).end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      }
    });
    cloudServer.on('connection', (socket) => {
      cloudSockets.add(socket);
      socket.on('close', () => cloudSockets.delete(socket));
    });
    cloudServer.on('upgrade', (req, socket) => {
      seen.push({ url: req.url, upgrade: true });
      socket.end(
        'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
      );
    });
    const otherServer = http.createServer((req, res) => {
      leaked.push(req.headers);
      res.end('Unexpected destination');
    });
    const tempRoot = fs.realpathSync(os.tmpdir());
    const dir = fs.mkdtempSync(path.join(tempRoot, 'rizzoto-hub-security-'));
    fs.writeFileSync(path.join(dir, 'hub.json'), JSON.stringify({ deviceCookie: deviceToken }));
    let hub;
    let otherPort;
    try {
      const cloudPort = await listen(cloudServer);
      otherPort = await listen(otherServer);
      hub = await startHub({
        cloudUrl: `http://127.0.0.1:${cloudPort}`,
        dataDir: dir,
        host: '127.0.0.1',
        port: 0,
        protection: { encrypt: (s) => Buffer.from(s), decrypt: (b) => b.toString() },
      });
      const badPaths = [
        `//127.0.0.1:${otherPort}/capture`,
        `///127.0.0.1:${otherPort}/capture`,
        `http://127.0.0.1:${otherPort}/capture`,
        `//cloud.example@127.0.0.1:${otherPort}/capture`,
        `/\\127.0.0.1:${otherPort}/capture`,
      ];
      for (const target of badPaths) {
        assert.equal(await request(hub.port, target), 400, target);
        assert.equal(await request(hub.port, target, true), 400, `Upgrade: ${target}`);
      }
      assert.equal(seen.length, 0, 'Invalid requests must not reach even the configured cloud');
      assert.equal(leaked.length, 0, 'No request or credential may reach the other server');
      assert.equal(hub.status().mode, 'online', 'Rejected paths must not trigger offline mode');

      assert.equal(await request(hub.port, '/api/health?source=tablet'), 200);
      assert.equal(seen[0].url, '/api/health?source=tablet');
      assert.equal(seen[0].cookie, `pos_session=${sessionToken}; pos_device=${deviceToken}`);
      assert.equal(await request(hub.port, '/_next/webpack-hmr', true), 101);
      assert.equal(seen.at(-1).upgrade, true);
      assert.equal(await request(hub.port, '/redirect'), 302);
      assert.equal(
        leaked.length,
        0,
        'The proxy must not follow upstream redirects with credentials',
      );

      hub.setForcedOffline(true);
      assert.equal(await request(hub.port, badPaths[0]), 400);
      assert.equal(await request(hub.port, '/api/health'), 200);
      assert.equal(leaked.length, 0);
    } finally {
      for (const socket of cloudSockets) socket.destroy();
      if (hub) await hub.stop();
      await Promise.all(
        [cloudServer, otherServer].map(
          (server) =>
            new Promise((resolve) => {
              server.closeAllConnections();
              server.close(resolve);
            }),
        ),
      );
      // Only remove the dedicated temporary directory created by this test.
      assert.equal(path.dirname(fs.realpathSync(dir)), tempRoot);
      assert.ok(path.basename(dir).startsWith('rizzoto-hub-security-'));
      fs.rmSync(dir, { recursive: true });
    }
  },
);
