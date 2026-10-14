const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const Module = require('node:module');
const { buildSync } = require('esbuild');

const compiled = new Module(__filename, module);
compiled.paths = module.paths;
compiled._compile(buildSync({
  stdin: {
    contents: "export { startHealthPing } from './src/hub/health-ping'; export { Cloud } from './src/hub/cloud'; export { startHub } from './src/hub'; export { keyProtection } from './src/hub/protection';",
    resolveDir: path.resolve(__dirname, '..'), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false,
}).outputFiles[0].text, __filename);
const { startHealthPing, Cloud, startHub, keyProtection } = compiled.exports;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!check()) {
    assert.ok(Date.now() < end, 'Timed out waiting for actual network activity');
    await sleep(10);
  }
}
async function server(t, handler) {
  const instance = http.createServer(handler);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    instance.closeAllConnections();
    await new Promise((resolve) => instance.close(resolve));
  });
  return `http://127.0.0.1:${instance.address().port}`;
}
function ping(t, origin, options = {}) {
  const cloud = new Cloud(origin, { data: { deviceCookie: 'private-device-cookie' } });
  const loop = startHealthPing(cloud, {
    intervalMs: 200, timeoutMs: 100, retryDelayMs: 20, ...options,
  });
  t.after(() => loop.stop());
  return loop;
}
const healthy = (res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');

test('health ping uses real unauthenticated requests, waits after completion and never overlaps', async (t) => {
  let calls = 0, active = 0, maximum = 0, endedAt = 0;
  const gaps = [];
  const origin = await server(t, (req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/api/health');
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers.authorization, undefined);
    if (endedAt) gaps.push(Date.now() - endedAt);
    calls++;
    maximum = Math.max(maximum, ++active);
    setTimeout(() => { active--; endedAt = Date.now(); healthy(res); }, 25);
  });
  const loop = ping(t, origin, { intervalMs: 40, timeoutMs: 1000 });
  await until(() => calls === 3);
  await sleep(35);
  loop.stop();
  assert.equal(maximum, 1);
  assert.ok(gaps.every((gap) => gap >= 35), `Unexpected request gaps: ${gaps}`);
  const stoppedAt = calls;
  await sleep(100);
  assert.equal(calls, stoppedAt);
});

test('server errors get only one quick retry, then normal pacing and one recovery log', async (t) => {
  const times = [], logs = [];
  const origin = await server(t, (_req, res) => {
    times.push(Date.now());
    if (times.length <= 2) res.writeHead(503).end('Unavailable');
    else healthy(res);
  });
  const loop = ping(t, origin, { intervalMs: 250, log: (message) => logs.push(message) });
  await until(() => times.length === 2);
  await sleep(80);
  assert.equal(times.length, 2, 'No third immediate retry');
  await until(() => logs.some((message) => message.includes('recovered')));
  loop.stop();
  assert.ok(times[2] - times[1] >= 240);
  assert.equal(logs.filter((message) => message.includes('HTTP 503')).length, 1);
  assert.equal(logs.filter((message) => message.includes('recovered')).length, 1);
});

test('429 honours Retry-After seconds instead of an immediate retry', async (t) => {
  const times = [];
  const origin = await server(t, (_req, res) => {
    times.push(Date.now());
    if (times.length === 1) res.writeHead(429, { 'retry-after': '1' }).end();
    else healthy(res);
  });
  const loop = ping(t, origin, { intervalMs: 30 });
  await until(() => times.length === 1);
  await sleep(150);
  assert.equal(times.length, 1);
  await until(() => times.length >= 2);
  loop.stop();
  assert.ok(times[1] - times[0] >= 990);
});

test('503 honours an HTTP-date Retry-After before its single retry', async (t) => {
  let calls = 0, requestedAfter = 0, retriedAt = 0;
  const origin = await server(t, (_req, res) => {
    calls++;
    if (calls === 1) {
      const value = new Date(Date.now() + 2000).toUTCString();
      requestedAfter = Date.parse(value);
      res.writeHead(503, { 'retry-after': value }).end();
    } else { retriedAt = Date.now(); healthy(res); }
  });
  const loop = ping(t, origin);
  await until(() => calls >= 2);
  loop.stop();
  assert.ok(retriedAt >= requestedAfter - 10);
});

test('an unresponsive server is timed out and the socket is cancelled', async (t) => {
  let calls = 0, closed = 0;
  const logs = [];
  const origin = await server(t, (req) => {
    calls++;
    req.on('close', () => closed++);
  });
  const loop = ping(t, origin, { timeoutMs: 40, intervalMs: 300, log: (message) => logs.push(message) });
  await until(() => calls === 2 && closed === 2);
  await sleep(80);
  assert.equal(calls, 2);
  assert.equal(logs.filter((message) => message.includes('timed out')).length, 1);
  loop.stop();
});

test('a real connection reset recovers without crashing or exposing credentials in logs', async (t) => {
  let calls = 0;
  const logs = [];
  const origin = await server(t, (req, res) => {
    if (++calls === 1) req.socket.destroy();
    else healthy(res);
  });
  const loop = ping(t, origin, { log: (message) => logs.push(message) });
  await until(() => logs.some((message) => message.includes('recovered')));
  loop.stop();
  assert.equal(calls, 2);
  assert.ok(logs.some((message) => message.includes('network or TLS error')));
  assert.ok(logs.every((message) => !message.includes('private-device-cookie')));
});

test('the timeout covers a slow response body even while bytes keep arriving', async (t) => {
  let calls = 0, closed = 0;
  const origin = await server(t, (_req, res) => {
    calls++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{');
    const drip = setInterval(() => res.write(' '), 10);
    res.on('close', () => { clearInterval(drip); closed++; });
  });
  const loop = ping(t, origin, { timeoutMs: 50, intervalMs: 300 });
  await until(() => calls === 2 && closed === 2);
  loop.stop();
});

for (const scenario of ['redirect', 'unauthorized', 'invalid JSON', 'wrong health status', 'oversized body']) {
  test(`${scenario} cannot be mistaken for a healthy API or cause rapid retries`, async (t) => {
    let calls = 0, redirected = 0;
    const logs = [];
    const origin = await server(t, (req, res) => {
      if (req.url !== '/api/health') { redirected++; return healthy(res); }
      calls++;
      if (scenario === 'redirect') res.writeHead(302, { location: '/different-endpoint' }).end();
      else if (scenario === 'unauthorized') res.writeHead(401).end();
      else res.end(scenario === 'invalid JSON' ? '<html>Loading</html>' : scenario === 'oversized body' ? 'x'.repeat(8193) : '{"status":"error"}');
    });
    const loop = ping(t, origin, { intervalMs: 300, log: (message) => logs.push(message) });
    await until(() => logs.length === 1);
    await sleep(100);
    loop.stop();
    assert.equal(calls, 1);
    assert.equal(redirected, 0);
  });
}

test('pause/resume cancels active requests without duplicate loops; stop prevents restart', async (t) => {
  let calls = 0, closed = 0;
  const origin = await server(t, (req, res) => {
    calls++;
    req.on('close', () => closed++);
    if (calls > 1) healthy(res);
  });
  const loop = ping(t, origin, { intervalMs: 200, timeoutMs: 1000 });
  await until(() => calls === 1);
  loop.pause();
  loop.resume();
  loop.pause();
  await until(() => closed === 1);
  await sleep(80);
  assert.equal(calls, 1);
  loop.resume();
  loop.resume();
  await until(() => calls === 2);
  await sleep(60);
  assert.equal(calls, 2);
  loop.stop();
  loop.resume();
  await sleep(250);
  assert.equal(calls, 2);
});

test('a failed logger cannot interrupt the background scheduler', async (t) => {
  let calls = 0;
  const origin = await server(t, (_req, res) => {
    if (++calls === 1) res.writeHead(500).end(); else healthy(res);
  });
  const loop = ping(t, origin, { log: () => { throw new Error('Disk unavailable'); } });
  await until(() => calls >= 3);
  loop.stop();
});

test('untrusted HTTPS certificates are rejected by the actual TLS connection', async (t) => {
  let rejected = 0, received = 0;
  const instance = https.createServer({
    cert: fs.readFileSync(path.join(__dirname, 'fixtures/hub-cert.pem')),
    key: fs.readFileSync(path.join(__dirname, 'fixtures/hub-key.pem')),
  }, (_req, res) => { received++; healthy(res); });
  instance.on('tlsClientError', () => rejected++);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  t.after(async () => { instance.closeAllConnections(); await new Promise((resolve) => instance.close(resolve)); });
  const logs = [];
  const loop = ping(t, `https://127.0.0.1:${instance.address().port}`, { log: (message) => logs.push(message) });
  await until(() => logs.length > 0 && rejected > 0);
  loop.stop();
  assert.equal(received, 0);
  assert.ok(logs[0].includes('network or TLS error'));
  assert.ok(rejected > 0, 'The HTTPS server must observe an actual failed TLS handshake');
});

test('real hub starts health pings without login, pauses offline and stops on shutdown', async (t) => {
  let calls = 0;
  const origin = await server(t, (_req, res) => { calls++; healthy(res); });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rizzoto-health-hub-'));
  let hub;
  try {
    hub = await startHub({ cloudUrl: origin, dataDir: directory, port: 0, protection: keyProtection(randomBytes(32).toString('base64')) });
    await until(() => calls === 1);
    hub.setForcedOffline(true);
    await sleep(40);
    assert.equal(calls, 1);
    hub.setForcedOffline(false);
    await until(() => calls === 2);
    await hub.stop();
    hub = null;
    await sleep(60);
    assert.equal(calls, 2);
  } finally {
    await hub?.stop();
    fs.rmSync(directory, { recursive: true });
  }
});
