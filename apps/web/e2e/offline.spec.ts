import { expect, test, type APIRequestContext } from '@playwright/test';

// A till loses its connection mid-service, keeps billing, and everything
// reaches the server once it is back. Setup goes through the API to keep it short.

const CODE = process.env.E2E_LOGIN_CODE ?? '111111';

async function setUpCafe(request: APIRequestContext) {
  const email = `offline-${Date.now()}@test.dev`;
  await request.post('/api/auth/code', { data: { email } });
  await request.post('/api/auth/code/verify', { data: { email, code: CODE } });
  await request.post('/api/onboarding', {
    data: {
      ownerName: 'Offline Owner',
      phone: '9876500001',
      businessName: 'Offline Cafe',
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
  await request.post('/api/shifts', { data: { outletId, openingCash: 500 } });
  // this browser becomes till D1
  await request.post('/api/devices', { data: { outletId, name: 'Front counter' } });
  return { outletId };
}

test('a till keeps billing offline and syncs when the connection is back', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  const { outletId } = await setUpCafe(page.request);

  // load the POS once online so the menu, shift and till numbers are saved
  const tillReady = page.waitForResponse((r) => r.url().includes('/api/devices/me') && r.ok());
  await page.goto('/pos');
  await tillReady;
  await expect(page.getByText(/Shift open since/)).toBeVisible();

  await context.setOffline(true);

  await page.getByRole('button', { name: 'Takeaway' }).click();
  await expect(page.getByText('#D1-1')).toBeVisible();
  await expect(page.getByText(/\d+ waiting/)).toBeVisible();

  await page.getByRole('button', { name: /Filter Coffee/ }).click();
  await page.getByRole('button', { name: /Filter Coffee/ }).click();
  // 2 × 100 + 5% GST
  await expect(page.getByText('₹210').filter({ visible: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Send KOT' }).click();
  await expect(page.getByText('KOT #D1-K1 sent')).toBeVisible();

  await page.getByRole('button', { name: /^Pay/ }).click();
  const pay = page.locator('[role="dialog"]').last();
  await pay.getByRole('button', { name: '₹500' }).click();
  await pay.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByText(/Return ₹290 change/)).toBeVisible();
  await expect(page.getByText(/waiting/)).toBeVisible();

  // connection back: the queue drains on its own
  await context.setOffline(false);
  await expect(page.getByText(/waiting|Syncing/)).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('not synced')).toBeHidden();

  const today = new Date().toISOString().slice(0, 10);
  const list = await (
    await page.request.get(`/api/orders?outletId=${outletId}&search=D1-1`)
  ).json();
  const order = list.rows.find((o: { orderNo: string }) => o.orderNo === 'D1-1');
  expect(order, `no synced order on ${today}`).toBeTruthy();
  expect(order.status).toBe('PAID');
  expect(Number(order.grandTotal)).toBe(210);
  expect(order.invoices[0].invoiceNo).toMatch(/\/D1-00001$/);
  expect(
    order.payments.map((p: { method: string; amount: string }) => [p.method, Number(p.amount)]),
  ).toEqual([['CASH', 210]]);
});

test('an order started online can be billed after the connection drops', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  const { outletId } = await setUpCafe(page.request);
  await page.request.post(`/api/outlets/${outletId}/tables/bulk`, {
    data: { prefix: 'T', start: 1, count: 2 },
  });

  const tillReady = page.waitForResponse((r) => r.url().includes('/api/devices/me') && r.ok());
  await page.goto('/pos');
  await tillReady;

  // online: open the table and send the first round
  await page.getByRole('button', { name: 'Table T1, free' }).click();
  await page.getByRole('button', { name: /Filter Coffee/ }).click();
  await page.getByRole('button', { name: 'Send KOT' }).click();
  await expect(page.getByText(/KOT #\d+ sent/)).toBeVisible();

  await context.setOffline(true);

  // offline: second round, then the bill
  await page.getByRole('button', { name: /Filter Coffee/ }).click();
  await page.getByRole('button', { name: 'Bill' }).click();
  await expect(page.getByText(/\d+ waiting/)).toBeVisible();
  await page.getByRole('button', { name: /^Pay/ }).click();
  const pay = page.locator('[role="dialog"]').last();
  await pay.getByRole('button', { name: 'UPI' }).click();
  await pay.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('button', { name: 'Table T1, free' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/waiting|Syncing/)).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('not synced')).toBeHidden();

  const list = await (await page.request.get(`/api/orders?outletId=${outletId}`)).json();
  const order = list.rows[0];
  expect(order.status).toBe('PAID');
  expect(order._count.items).toBe(2);
  expect(Number(order.grandTotal)).toBe(210);
  expect(order.invoices[0].invoiceNo).toMatch(/\/D1-00001$/);
  expect(order.payments[0].method).toBe('UPI');

  // the table is free again on the server too
  const floor = await (await page.request.get(`/api/outlets/${outletId}/floor`)).json();
  expect(floor.tables.find((t: { name: string }) => t.name === 'T1').status).toBe('AVAILABLE');
});
