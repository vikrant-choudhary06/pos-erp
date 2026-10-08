import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { startHub, type Hub } from '../src/hub';

// The internet drops in the middle of service. A waiter's tablet and the
// counter both go through the hub: the waiter takes a table and sends a KOT,
// the kitchen screen gets it, the counter bills and takes cash. When the
// internet is back, all of it lands in the cloud under till D1's numbers.

const CLOUD = process.env.E2E_URL ?? 'http://localhost:3000';
const CODE = process.env.E2E_LOGIN_CODE ?? '111111';

let hub: Hub;
let dataDir: string;
let base: string;

test.beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rizzoto-hub-'));
  hub = await startHub({ cloudUrl: CLOUD, dataDir, port: 0, host: '127.0.0.1' });
  base = `http://localhost:${hub.port}`;
});

test.afterAll(async () => {
  await hub?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function signIn(request: APIRequestContext, email: string) {
  await request.post('/api/auth/code', { data: { email } });
  await request.post('/api/auth/code/verify', { data: { email, code: CODE } });
}

async function setUpCafe(request: APIRequestContext) {
  const email = `hub-${Date.now()}@test.dev`;
  await signIn(request, email);
  await request.post('/api/onboarding', {
    data: {
      ownerName: 'Hub Owner',
      phone: '9876500002',
      businessName: 'Hub Cafe',
      businessType: 'CAFE',
      city: 'Indore',
      stateCode: '23',
    },
  });

  const me = await (await request.get('/api/auth/me')).json();
  const outletId: string = me.outlets[0].id;
  const taxes = await (await request.get('/api/menu/tax-groups')).json();
  const category = await (
    await request.post('/api/menu/categories', { data: { name: 'Coffee' } })
  ).json();
  await request.post('/api/menu/items', {
    data: {
      categoryId: category.id,
      name: 'Filter Coffee',
      foodType: 'VEG',
      basePrice: 100,
      taxGroupId: taxes.find((t: { name: string }) => t.name === 'GST 5%').id,
    },
  });
  await request.post(`/api/outlets/${outletId}/tables/bulk`, {
    data: { prefix: 'T', start: 1, count: 2 },
  });
  await request.post('/api/shifts', { data: { outletId, openingCash: 500 } });
  // registered through the hub, so the hub becomes till D1
  const device = await request.post('/api/devices', { data: { outletId, name: 'Front PC' } });
  expect(device.ok()).toBeTruthy();
  return { email, outletId };
}

async function openContext(browser: Browser) {
  const context = await browser.newContext({ baseURL: base });
  await context.addInitScript(() => {
    window.print = () => {};
  });
  return context;
}

test('tablets keep billing through the hub while the internet is down', async ({ browser }) => {
  const counterContext = await openContext(browser);
  const counter = await counterContext.newPage();
  const { email, outletId } = await setUpCafe(counter.request);

  // online: every screen is opened once so the hub has a copy of it
  await counter.goto('/pos');
  await expect(counter.getByText(/Shift open since/)).toBeVisible();
  const kitchen = await counterContext.newPage();
  await kitchen.goto('/kitchen');
  await expect(kitchen.getByText('All caught up')).toBeVisible();

  const waiterContext = await openContext(browser);
  const waiter = await waiterContext.newPage();
  await signIn(waiter.request, email);
  await waiter.goto('/pos');
  await expect(waiter.getByRole('button', { name: 'Table T1, free' })).toBeVisible();

  await expect.poll(async () => (await hub.syncNow()).till?.code).toBe('D1');

  // the internet goes
  hub.setForcedOffline(true);
  expect(hub.status().mode).toBe('offline');

  await waiter.getByRole('button', { name: 'Table T1, free' }).click();
  await waiter.getByRole('button', { name: /Filter Coffee/ }).click();
  await waiter.getByRole('button', { name: /Filter Coffee/ }).click();
  await waiter.getByRole('button', { name: 'Send KOT' }).click();
  await expect(waiter.getByText('KOT #D1-K1 sent')).toBeVisible();

  // the kitchen screen picks it up from the hub
  await expect(kitchen.getByText(/KOT D1-K1/)).toBeVisible({ timeout: 30_000 });

  // the counter sees the table taken and settles it
  const table = counter.getByRole('button', { name: 'Table T1, order D1-1' });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await table.click();
  await expect(counter.getByText('₹210').first()).toBeVisible();
  await counter.getByRole('button', { name: /^Pay/ }).click();
  const pay = counter.locator('[role="dialog"]').last();
  await pay.getByRole('button', { name: '₹500' }).click();
  await pay.getByRole('button', { name: 'Complete' }).click();
  await expect(counter.getByText(/Return ₹290 change/)).toBeVisible();

  // the waiter's tablet sees it paid without anyone refreshing
  await expect(waiter.getByText('Paid. cash ₹210')).toBeVisible({ timeout: 30_000 });
  expect(hub.status().pending).toBeGreaterThanOrEqual(5);

  // the internet is back
  hub.setForcedOffline(false);
  await expect
    .poll(
      async () => {
        const s = await hub.syncNow();
        return `${s.mode}:${s.pending}:${s.failed.length}`;
      },
      { timeout: 60_000 },
    )
    .toBe('online:0:0');

  const list = await (await counter.request.get(`/api/orders?outletId=${outletId}`)).json();
  const order = list.rows.find((o: { orderNo: string }) => o.orderNo === 'D1-1');
  expect(order).toBeTruthy();
  expect(order.status).toBe('PAID');
  expect(Number(order.grandTotal)).toBe(210);
  expect(order.invoices[0].invoiceNo).toMatch(/\/D1-00001$/);
  expect(order.payments.map((p: { method: string }) => p.method)).toEqual(['CASH']);

  const floor = await (await counter.request.get(`/api/outlets/${outletId}/floor`)).json();
  expect(floor.tables.find((t: { name: string }) => t.name === 'T1').status).toBe('AVAILABLE');

  // and the counter's screen is back on the cloud's copy
  await expect(counter.getByRole('button', { name: 'Table T1, free' })).toBeVisible();

  await waiterContext.close();
  await counterContext.close();
});
