const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

// This suite starts the real API. Never point it at a shop's database.
const databaseUrl = process.env.SECURITY_DATABASE_URL;
if (!databaseUrl)
  throw new Error('SECURITY_DATABASE_URL must name an isolated rizzoto_security database');
const database = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  database.pathname !== '/rizzoto_security'
) {
  throw new Error('Security tests require a local database named rizzoto_security');
}
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = randomUUID();
const password = `Restaurant-${randomBytes(12).toString('hex')}`;
const pin = '483726';
let api,
  server,
  logs = '',
  requestNumber = 0;
let owner, outsider, business, outletA, outletB, role, menuItem, ingredient;
let webOrigin;
const streams = new Set();

async function until(condition, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await condition();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(message);
}

async function request(actor, method, route, body, status = 200) {
  const n = ++requestNumber;
  const response = await fetch(`${api}/api${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      // Exercise the account limit across client IPs, with the real IP limit enabled.
      'x-forwarded-for': `198.18.${Math.floor(n / 250)}.${(n % 250) + 1}`,
      ...(actor?.cookie && { cookie: actor.cookie }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const allowed = Array.isArray(status) ? status : [status];
  assert.ok(
    allowed.includes(response.status),
    `${method} ${route}: HTTP ${response.status} ${JSON.stringify(data)}`,
  );
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { data, cookie, status: response.status };
}

async function loginCode(email) {
  const offset = logs.length;
  await request(null, 'POST', '/auth/code', { email });
  return until(() => {
    const line = logs
      .slice(offset)
      .split('\n')
      .reverse()
      .find((value) => value.includes(`Login code for ${email}:`));
    return line?.match(/: (\d{6})/)?.[1];
  }, 'API did not generate a login code');
}

async function onboard(label) {
  const email = `${label}-${run}@example.test`.toLowerCase();
  const code = await loginCode(email);
  const signup = await request(null, 'POST', '/auth/code/verify', { email, code });
  return request(
    signup,
    'POST',
    '/onboarding',
    {
      ownerName: `${label} Owner`,
      phone: '9876543210',
      businessName: `${label} Restaurant`,
      businessType: 'RESTAURANT',
      city: 'Indore',
      stateCode: '23',
    },
    201,
  );
}

async function staff(name) {
  return (
    await request(
      owner,
      'POST',
      '/staff',
      {
        name,
        roleId: role.id,
        password,
        pin,
        outletIds: [outletA.id],
      },
      201,
    )
  ).data;
}

function staffCredentials(person, suppliedPassword = password) {
  return {
    businessCode: business.businessCode,
    employeeCode: person.employeeCode,
    password: suppliedPassword,
  };
}

async function staffSession(person) {
  return request(null, 'POST', '/auth/staff-login', staffCredentials(person));
}

async function order(outlet = outletA, phone) {
  const result = (
    await request(
      owner,
      'POST',
      '/orders',
      {
        outletId: outlet.id,
        type: 'TAKEAWAY',
        ...(phone && { customerPhone: phone, customerName: 'Restaurant customer' }),
      },
      201,
    )
  ).data;
  await request(
    owner,
    'POST',
    `/orders/${result.id}/items`,
    {
      items: [{ menuItemId: menuItem.id, quantity: 1 }],
    },
    201,
  );
  return result;
}

async function billedOrder(phone) {
  const result = await order(outletA, phone);
  const billed = (await request(owner, 'POST', `/orders/${result.id}/bill`, {})).data;
  assert.equal(Number(billed.grandTotal), 100);
  return billed;
}

const payment = (amount, method = 'CARD', id = randomUUID()) => ({
  payments: [{ id, method, amount }],
});

async function openStream(actor, outletId = outletA.id, expected = 200) {
  const controller = new AbortController();
  const response = await fetch(`${api}/api/events?outletId=${outletId}`, {
    headers: { cookie: actor.cookie },
    signal: controller.signal,
  });
  assert.equal(response.status, expected);
  if (expected !== 200) {
    await response.text();
    return null;
  }
  const stream = { controller, text: '', closed: false };
  streams.add(stream);
  const reader = response.body.getReader();
  stream.done = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        stream.text += Buffer.from(value).toString();
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      stream.closed = true;
      streams.delete(stream);
    }
  })();
  await until(
    () => stream.text.includes('ping'),
    'Stream did not authorize and send its initial ping',
  );
  return stream;
}

async function closeStream(stream) {
  stream.controller.abort();
  await stream.done;
}

async function startApi() {
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: new URL(api).port,
      NODE_ENV: 'test',
      OTP_SECRET: randomBytes(32).toString('hex'),
      WEB_URL: webOrigin ?? api,
      DEV_LOGIN_CODE: '',
      RESEND_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });
  await until(
    async () => {
      if (server.exitCode !== null) throw new Error(`API exited: ${logs.slice(-2000)}`);
      try {
        return (await fetch(`${api}/api/health`)).ok;
      } catch {
        return false;
      }
    },
    'API did not start',
    90_000,
  );
}

async function stopApi() {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await exited;
  }
}

before(
  async () => {
    await db.$connect();
    const socket = net.createServer();
    await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    api = `http://127.0.0.1:${port}`;
    if (process.env.PMS_UI_TEST === '1') {
      const webSocket = net.createServer();
      await new Promise((resolve) => webSocket.listen(0, '127.0.0.1', resolve));
      webOrigin = `http://localhost:${webSocket.address().port}`;
      await new Promise((resolve) => webSocket.close(resolve));
    }
    await startApi();

    owner = await onboard('Security');
    outsider = await onboard('Other');
    business = (await request(owner, 'GET', '/business')).data;
    outletA = (await request(owner, 'GET', '/outlets')).data[0];
    outletB = (
      await request(
        owner,
        'POST',
        '/outlets',
        {
          name: 'Airport branch',
          code: 'AIRPORT',
          city: 'Indore',
          stateCode: '23',
        },
        201,
      )
    ).data;
    role = (
      await request(
        owner,
        'POST',
        '/roles',
        {
          name: 'Branch operator',
          permissions: ['order.take', 'bill.settle', 'outlet.manage'],
        },
        201,
      )
    ).data;
    const category = (await request(owner, 'POST', '/menu/categories', { name: 'Lunch' }, 201))
      .data;
    menuItem = (
      await request(
        owner,
        'POST',
        '/menu/items',
        {
          categoryId: category.id,
          name: 'Vegetable thali',
          foodType: 'VEG',
          basePrice: 100,
        },
        201,
      )
    ).data;
    await request(owner, 'POST', '/shifts', { outletId: outletA.id, openingCash: 500 }, 201);
    ingredient = (
      await request(
        owner,
        'POST',
        '/inventory/items',
        {
          name: 'Rice',
          baseUnit: 'G',
        },
        201,
      )
    ).data;
    await request(
      owner,
      'POST',
      '/inventory/adjustments',
      {
        outletId: outletA.id,
        inventoryItemId: ingredient.id,
        kind: 'OPENING',
        quantity: 100_000,
      },
      201,
    );
    await request(owner, 'PUT', `/inventory/recipes/${menuItem.id}`, {
      ingredients: [{ inventoryItemId: ingredient.id, quantity: 200 }],
    });
  },
  { timeout: 120_000 },
);

after(async () => {
  await Promise.all([...streams].map(closeStream));
  await stopApi();
  await db.$disconnect();
});

test('9: competing card payments cannot overpay a real bill', async () => {
  const bill = await billedOrder();
  const results = await Promise.all(
    [80, 80].map((amount) =>
      request(owner, 'POST', `/orders/${bill.id}/payments`, payment(amount), [200, 400]),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  // Either request may win: examine storage and then settle the remainder.
  const row = await db.order.findUniqueOrThrow({ where: { id: bill.id } });
  assert.equal(Number(row.paidTotal), 80);
  assert.equal(await db.payment.count({ where: { orderId: bill.id } }), 1);
  await request(owner, 'POST', `/orders/${bill.id}/payments`, payment(20));
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: bill.id } })).status, 'PAID');
});

test('9: concurrent retries create one payment and close the order once', async () => {
  const bill = await billedOrder('9876543211');
  const body = payment(100);
  await Promise.all(
    Array.from({ length: 6 }, () => request(owner, 'POST', `/orders/${bill.id}/payments`, body)),
  );
  assert.equal(await db.payment.count({ where: { orderId: bill.id } }), 1);
  const customer = await db.customer.findUniqueOrThrow({ where: { id: bill.customerId } });
  assert.equal(customer.visits, 1);
  assert.equal(Number(customer.totalSpent), 100);
  const movements = await db.stockMovement.findMany({
    where: { referenceId: bill.id, type: 'SALE' },
  });
  assert.equal(movements.length, 1);
  assert.equal(Number(movements[0].quantity), -200);
});

test('9: reopening a bill cannot race with taking its payment', async () => {
  const bill = await billedOrder();
  const results = await Promise.all([
    request(owner, 'POST', `/orders/${bill.id}/payments`, payment(100), [200, 400]),
    request(owner, 'POST', `/orders/${bill.id}/reopen`, { reason: 'Change the bill' }, [200, 400]),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  const saved = await db.order.findUniqueOrThrow({ where: { id: bill.id } });
  const paid = results[0].status === 200;
  assert.equal(saved.status, paid ? 'PAID' : 'OPEN');
  assert.equal(await db.payment.count({ where: { orderId: bill.id } }), paid ? 1 : 0);
  assert.equal(
    await db.invoice.count({ where: { orderId: bill.id, status: 'ISSUED' } }),
    paid ? 1 : 0,
  );
});

test('9: voiding a bill racing with payment leaves no successful payment or duplicate stock reversal', async () => {
  const bill = await billedOrder('9876543215');
  const [paid] = await Promise.all([
    request(owner, 'POST', `/orders/${bill.id}/payments`, payment(100, 'CREDIT'), [200, 400]),
    request(owner, 'POST', `/orders/${bill.id}/void`, { reason: 'Customer cancelled' }),
  ]);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: bill.id } })).status, 'VOID');
  assert.equal(await db.payment.count({ where: { orderId: bill.id, status: 'SUCCESS' } }), 0);
  const customer = await db.customer.findUniqueOrThrow({ where: { id: bill.customerId } });
  assert.equal(Number(customer.creditBalance), 0);
  assert.equal(customer.visits, 0);
  const movements = await db.stockMovement.findMany({ where: { referenceId: bill.id } });
  assert.equal(movements.length, paid.status === 200 ? 2 : 0);
  assert.equal(
    movements.reduce((sum, row) => sum + Number(row.quantity), 0),
    0,
  );
});

test('9: concurrent payments on an open order issue a single invoice', async () => {
  const bill = await order(outletA, '9876543212');
  const body = payment(100);
  await Promise.all(
    Array.from({ length: 4 }, () => request(owner, 'POST', `/orders/${bill.id}/payments`, body)),
  );
  assert.equal(await db.invoice.count({ where: { orderId: bill.id, status: 'ISSUED' } }), 1);
  assert.equal(await db.payment.count({ where: { orderId: bill.id } }), 1);
});

test('9: cash change and duplicate payment validation still work', async () => {
  const bill = await billedOrder();
  const body = payment(150, 'CASH');
  assert.equal((await request(owner, 'POST', `/orders/${bill.id}/payments`, body)).data.change, 50);
  await request(owner, 'POST', `/orders/${bill.id}/payments`, body);
  assert.equal(
    Number((await db.order.findUniqueOrThrow({ where: { id: bill.id } })).paidTotal),
    100,
  );
  const other = await billedOrder();
  await request(owner, 'POST', `/orders/${other.id}/payments`, body, 400);
  await request(
    owner,
    'POST',
    `/orders/${other.id}/payments`,
    { payments: [body.payments[0], body.payments[0]] },
    400,
  );
  assert.equal(await db.payment.count({ where: { orderId: other.id } }), 0);
});

test('9: competing settlements cannot produce a negative customer balance', async () => {
  const bill = await billedOrder('9876543213');
  await request(owner, 'POST', `/orders/${bill.id}/payments`, payment(100, 'CREDIT'));
  const route = `/customers/${bill.customerId}/settle`;
  const outcomes = await Promise.all(
    [80, 80].map(async (amount) => {
      const response = await fetch(`${api}/api${route}`, {
        method: 'POST',
        headers: { cookie: owner.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ amount, method: 'CARD' }),
      });
      await response.text();
      return response.status;
    }),
  );
  assert.deepEqual(outcomes.sort(), [200, 400]);
  assert.equal(
    Number((await db.customer.findUniqueOrThrow({ where: { id: bill.customerId } })).creditBalance),
    20,
  );
  assert.equal(
    await db.auditLog.count({
      where: { entityId: bill.customerId, action: 'customer.dues_settled' },
    }),
    1,
  );
  await request(owner, 'POST', route, { amount: 20, method: 'CASH' });
  assert.equal(
    Number((await db.customer.findUniqueOrThrow({ where: { id: bill.customerId } })).creditBalance),
    0,
  );
});

test('10: concurrent PIN failures lock the account across client IPs', async () => {
  const person = await staff('PIN operator');
  const device = await request(
    owner,
    'POST',
    '/devices',
    { outletId: outletA.id, name: 'Security counter' },
    201,
  );
  await Promise.all(
    Array.from({ length: 10 }, () =>
      request(device, 'POST', '/auth/pin', { userId: person.id, pin: '000000' }, 401),
    ),
  );
  const locked = await db.user.findUniqueOrThrow({ where: { id: person.id } });
  assert.equal(locked.pinFailures, 5);
  assert.ok(locked.pinLockedAt);
  await request(device, 'POST', '/auth/pin', { userId: person.id, pin }, 401);
  // A password login remains independent of the PIN lock.
  await staffSession(person);
  await db.user.update({
    where: { id: person.id },
    data: { pinLockedAt: new Date(Date.now() - 301_000) },
  });
  await request(device, 'POST', '/auth/pin', { userId: person.id, pin });
  const unlocked = await db.user.findUniqueOrThrow({ where: { id: person.id } });
  assert.equal(unlocked.pinFailures, 0);
  assert.equal(unlocked.pinLockedAt, null);
});

test('11: outlet updates respect staff scope and tenant ownership', async () => {
  const actor = await staffSession(await staff('Outlet operator'));
  await request(actor, 'PATCH', `/outlets/${outletB.id}`, { isActive: false }, 403);
  assert.equal((await db.outlet.findUniqueOrThrow({ where: { id: outletB.id } })).isActive, true);
  await request(actor, 'PATCH', `/outlets/${outletA.id}`, {
    settings: { billFooter: 'Thank you' },
  });
  await request(owner, 'PATCH', `/outlets/${outletB.id}`, {
    settings: { billFooter: 'Airport branch' },
  });
  await request(outsider, 'PATCH', `/outlets/${outletA.id}`, { isActive: false }, 404);
});

test('12: customer history contains only orders from allowed outlets', async () => {
  const first = await order(outletA, '9876543214');
  const second = await order(outletB, '9876543214');
  const actor = await staffSession(await staff('History operator'));
  const history = (await request(actor, 'GET', `/customers/${first.customerId}`)).data.orders;
  assert.deepEqual(
    history.map((row) => row.id),
    [first.id],
  );
  const all = (await request(owner, 'GET', `/customers/${first.customerId}`)).data.orders;
  assert.ok(all.some((row) => row.id === second.id));
  await request(outsider, 'GET', `/customers/${first.customerId}`, undefined, 404);
});

test('13: a generated OTP creates only one session under concurrent verification', async () => {
  const email = `security-${run}@example.test`;
  const code = await loginCode(email);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const before = await db.session.count({ where: { userId: user.id } });
  const statuses = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const n = ++requestNumber;
      const response = await fetch(`${api}/api/auth/code/verify`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `198.19.0.${(n % 250) + 1}`,
        },
        body: JSON.stringify({ email, code }),
      });
      await response.text();
      return response.status;
    }),
  );
  assert.equal(statuses.filter((status) => status === 200).length, 1);
  assert.equal(statuses.filter((status) => status === 400).length, 7);
  assert.equal(await db.session.count({ where: { userId: user.id } }), before + 1);
});

test('13: concurrent wrong OTP attempts stop at five', async () => {
  const email = `attempts-${run}@example.test`;
  const correct = await loginCode(email);
  const wrong = correct === '000000' ? '999999' : '000000';
  await Promise.all(
    Array.from({ length: 10 }, () =>
      request(null, 'POST', '/auth/code/verify', { email, code: wrong }, 400),
    ),
  );
  const otp = await db.otpCode.findFirstOrThrow({
    where: { email },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(otp.attempts, 5);
  assert.equal(otp.verifiedAt, null);
  await request(null, 'POST', '/auth/code/verify', { email, code: correct }, 400);
});

test('14: live notifications work, then stop after logout', async () => {
  const actor = await staffSession(await staff('Live operator'));
  const stream = await openStream(actor);
  const created = await order();
  await until(() => stream.text.includes(created.id), 'Authorized order event was not delivered');
  await request(actor, 'POST', '/auth/logout');
  await until(() => stream.closed, 'Logged-out stream stayed open', 4_000);
  await request(actor, 'GET', '/auth/me', undefined, 401);
});

test('14: idle streams close after outlet reassignment, expiry, deactivation and outlet closure', async () => {
  for (const change of ['outlet', 'expiry', 'inactive', 'disabled-outlet']) {
    const person = await staff(`Stream ${change} operator`);
    const actor = await staffSession(person);
    const stream = await openStream(actor);
    if (change === 'outlet')
      await request(owner, 'PATCH', `/staff/${person.id}`, { outletIds: [outletB.id] });
    if (change === 'inactive')
      await request(owner, 'PATCH', `/staff/${person.id}`, { status: 'INACTIVE' });
    if (change === 'expiry')
      await db.session.updateMany({
        where: { userId: person.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    if (change === 'disabled-outlet')
      await request(owner, 'PATCH', `/outlets/${outletA.id}`, { isActive: false });
    await until(() => stream.closed, `${change} did not close the stream`, 4_000);
    if (change === 'disabled-outlet')
      await request(owner, 'PATCH', `/outlets/${outletA.id}`, { isActive: true });
  }
});

test('14: revoking a device closes its PIN-authenticated event stream', async () => {
  const person = await staff('Device stream operator');
  const device = await request(
    owner,
    'POST',
    '/devices',
    {
      outletId: outletA.id,
      name: 'Revocation counter',
    },
    201,
  );
  const actor = await request(device, 'POST', '/auth/pin', { userId: person.id, pin });
  const stream = await openStream(actor);
  await request(owner, 'DELETE', `/devices/${device.data.id}`, undefined, 204);
  await until(() => stream.closed, 'Revoked device stream stayed open', 4_000);
  await request(actor, 'GET', '/auth/me', undefined, 401);
});

test('14: connection limit applies across sessions and releases slots on disconnect', async () => {
  const person = await staff('Connection operator');
  const actors = await Promise.all([staffSession(person), staffSession(person)]);
  const opened = [];
  try {
    for (let i = 0; i < 5; i++) opened.push(await openStream(actors[i % 2]));
    await openStream(actors[1], outletA.id, 429);
    await closeStream(opened.pop());
    await new Promise((resolve) => setTimeout(resolve, 100));
    opened.push(await openStream(actors[1]));
  } finally {
    await Promise.all(opened.map(closeStream));
  }
});

test('16: password lockout persists across IPs, API restart, expiry and credential reset', async () => {
  const person = await staff('Password operator');
  await Promise.all(
    Array.from({ length: 10 }, () =>
      request(
        null,
        'POST',
        '/auth/staff-login',
        staffCredentials(person, 'Incorrect-password'),
        401,
      ),
    ),
  );
  let account = await db.user.findUniqueOrThrow({ where: { id: person.id } });
  assert.equal(account.passwordFailures, 5);
  assert.ok(account.passwordLockedAt);
  await stopApi();
  await startApi();
  await request(null, 'POST', '/auth/staff-login', staffCredentials(person), 401);
  await db.user.update({
    where: { id: person.id },
    data: { passwordLockedAt: new Date(Date.now() - 301_000) },
  });
  await staffSession(person);
  account = await db.user.findUniqueOrThrow({ where: { id: person.id } });
  assert.equal(account.passwordFailures, 0);
  assert.equal(account.passwordLockedAt, null);
  await Promise.all(
    Array.from({ length: 5 }, () =>
      request(
        null,
        'POST',
        '/auth/staff-login',
        staffCredentials(person, 'Incorrect-password'),
        401,
      ),
    ),
  );
  await request(owner, 'PATCH', `/staff/${person.id}`, { password });
  await staffSession(person);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: person.id } })).passwordLockedAt,
    null,
  );
});

test(
  'inbuilt PMS workflows against the real API and PostgreSQL',
  { timeout: process.env.PMS_UI_TEST === '1' ? 360_000 : 120_000 },
  async (t) => {
    await require('./pms-scenarios.cjs')(t, {
      request,
      db,
      owner,
      outsider,
      outletA,
      outletB,
      staff,
      staffSession,
      billedOrder,
      ingredient,
    });
    if (process.env.PMS_UI_TEST === '1') {
      await t.test(
        'hotel browser workflow uses real guest records and payments',
        { timeout: 240_000 },
        async () => {
          await require('./pms-browser.cjs')({ api, webOrigin, owner, billedOrder, loginCode });
        },
      );
    }
  },
);
