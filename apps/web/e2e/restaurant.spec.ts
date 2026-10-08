import { expect, test, type Page } from '@playwright/test';

// One long walk through a new restaurant's first day: sign up, set up the menu
// and tables, take an order on the POS, cook it, and see it in reports.
// Needs the API running with DEV_LOGIN_CODE.

const CODE = process.env.E2E_LOGIN_CODE ?? '111111';

test('a new restaurant can sign up, bill an order and see it in reports', async ({ page }) => {
  const email = `e2e-${Date.now()}@test.dev`;

  // receipts print through a hidden iframe; keep headless runs from waiting on it
  await page.addInitScript(() => {
    window.print = () => {};
    HTMLIFrameElement.prototype.focus = () => {};
  });

  await test.step('sign up with an email code', async () => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Continue with email' }).click();
    await page.getByLabel('Digit 1').fill(CODE);
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByLabel('Your name').fill('Test Owner');
    await page.getByLabel('Mobile number').fill('9876500000');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Business name').fill('E2E Cafe');
    await page.getByRole('button', { name: 'Cafe', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('City').fill('Pune');
    await page.getByLabel('State').selectOption('27');
    await page.getByRole('button', { name: 'Create business' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Getting started')).toBeVisible();
  });

  await test.step('build the menu', async () => {
    await page.goto('/dashboard/menu');
    await page.getByRole('button', { name: 'Add category' }).first().click();
    await dialog(page).getByLabel('Name', { exact: true }).fill('Starters');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Category added')).toBeVisible();

    await page.getByRole('button', { name: 'Add item' }).first().click();
    const sheet = dialog(page);
    await sheet.getByLabel('Name', { exact: true }).fill('Paneer Tikka');
    await sheet.getByRole('switch', { name: 'Has portions' }).click();
    const prices = sheet.getByLabel('Price');
    await prices.nth(0).fill('160');
    await prices.nth(1).fill('280');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Item added')).toBeVisible();
    await expect(page.getByText('₹160 – ₹280')).toBeVisible();
  });

  await test.step('set up tables', async () => {
    await page.goto('/dashboard/tables');
    await page.getByRole('button', { name: 'Add tables' }).first().click();
    await dialog(page)
      .getByRole('button', { name: /Add 6 tables/ })
      .click();
    await expect(page.getByText('6 tables added')).toBeVisible();
  });

  await test.step('take a dine-in order and settle it', async () => {
    await page.goto('/pos');
    await page.getByRole('button', { name: 'Open shift' }).click();
    await dialog(page).getByLabel('Cash in drawer').fill('1000');
    await dialog(page).getByRole('button', { name: 'Open shift' }).click();
    await expect(page.getByText(/Shift open since/)).toBeVisible();

    await page.getByRole('button', { name: 'Table T1, free' }).click();
    await expect(page.getByText('Table T1')).toBeVisible();

    await page.getByRole('button', { name: /Paneer Tikka/ }).click();
    await dialog(page).getByRole('button', { name: /^Full/ }).click();
    await dialog(page).getByRole('button', { name: /^Add/ }).click();

    // 280 + 5% GST
    await expect(page.getByText('₹294').first()).toBeVisible();
    await page.getByRole('button', { name: 'Send KOT' }).click();
    await expect(page.getByText(/KOT #\d+ sent/)).toBeVisible();

    await page.getByRole('button', { name: /^Pay/ }).click();
    const pay = dialog(page);
    await expect(pay.getByText('Amount due')).toBeVisible();
    await pay.getByRole('button', { name: '₹500' }).click();
    await expect(pay.getByText('Return change')).toBeVisible();
    await pay.getByRole('button', { name: 'Complete' }).click();

    await expect(page.getByText(/Return ₹206 change/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Table T1, free' })).toBeVisible();
  });

  await test.step('the kitchen sees the ticket and marks it ready', async () => {
    await page.goto('/kitchen');
    await expect(page.getByText('Paneer Tikka')).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Ready' }).click();
    await expect(page.getByRole('button', { name: 'Served' })).toBeVisible();
  });

  await test.step('the sale shows up in reports and order history', async () => {
    await page.goto('/dashboard/reports');
    await page.getByRole('button', { name: 'Today' }).click();
    await expect(page.getByText('Net sales')).toBeVisible();
    await expect(page.getByText('₹294').first()).toBeVisible();

    await page.getByRole('tab', { name: 'GST' }).click();
    await expect(page.getByText('CGST 2.5%')).toBeVisible();

    await page.goto('/dashboard/orders');
    await page.getByText('#1', { exact: true }).click();
    await expect(dialog(page).getByText('Paneer Tikka')).toBeVisible();
    await expect(dialog(page).getByText('Cash')).toBeVisible();
  });

  await test.step('add a waiter who can sign in', async () => {
    await page.goto('/dashboard/staff');
    await page.getByRole('button', { name: 'Add staff' }).click();
    const sheet = dialog(page);
    await sheet.getByLabel('Name').fill('Ravi');
    await sheet.getByLabel('Password').fill('waiter123');
    await sheet.getByLabel('PIN').fill('4321');
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Ravi is added')).toBeVisible();
  });

  await test.step('track stock', async () => {
    await page.goto('/dashboard/inventory');
    await page.getByRole('button', { name: 'Add stock item' }).first().click();
    await dialog(page).getByLabel('Name').fill('Paneer');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Stock item added')).toBeVisible();

    await page.getByRole('button', { name: 'Update' }).click();
    await dialog(page).getByLabel('Counted').fill('2');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('cell', { name: /2 kg/ })).toBeVisible();
  });

  await test.step('every dashboard page loads', async () => {
    for (const [path, text] of [
      ['/dashboard/customers', 'Customers'],
      ['/dashboard/purchases', 'Purchases'],
      ['/dashboard/activity', 'Activity'],
      ['/dashboard/settings', 'Kitchen stations'],
    ]) {
      await page.goto(path);
      await expect(page.getByText(text).first()).toBeVisible();
    }
  });
});

/** The sheet or dialog that is currently open. */
const dialog = (page: Page) => page.locator('[role="dialog"], [role="alertdialog"]').last();
