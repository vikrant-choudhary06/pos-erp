const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async function browserScenario({ api, webOrigin, owner, billedOrder }) {
  const cwd = path.resolve(__dirname, '../../web');
  const webRequire = createRequire(path.join(cwd, 'package.json'));
  const { chromium, expect } = webRequire('@playwright/test');
  let browser,
    logs = '';
  const web = spawn(
    process.execPath,
    [
      webRequire.resolve('next/dist/bin/next'),
      'dev',
      '--port',
      new URL(webOrigin).port,
      '--hostname',
      '127.0.0.1',
    ],
    {
      cwd,
      env: { ...process.env, API_URL: api, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  web.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  web.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });
  try {
    const deadline = Date.now() + 90_000;
    while (true) {
      if (web.exitCode !== null) throw new Error(`Web server exited: ${logs.slice(-1500)}`);
      try {
        if ((await fetch(`${webOrigin}/login`)).ok) break;
      } catch {}
      if (Date.now() > deadline) throw new Error(`Web server did not start: ${logs.slice(-1500)}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || 'chrome' });
    const context = await browser.newContext({
      baseURL: webOrigin,
      viewport: { width: 1440, height: 1000 },
    });
    await context.addCookies(
      owner.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: webOrigin };
      }),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const suffix = Date.now();
    const typeName = `Browser suite ${suffix}`;
    const guestName = `Browser guest ${suffix}`;
    await page.goto('/dashboard/hotel/settings');
    await page.getByLabel('Name', { exact: true }).fill(typeName);
    await page.getByLabel('Maximum guests').fill('2');
    await page.getByLabel('Nightly rate before tax').fill('200');
    await page.getByLabel('Tax percentage').fill('5');
    await page.getByRole('button', { name: 'Save room type', exact: true }).click();
    await expect(page.getByRole('option', { name: typeName })).toHaveCount(1);
    await page.getByLabel('Room number').fill('905');
    await page.getByLabel('Room type', { exact: true }).selectOption({ label: typeName });
    await page.getByRole('button', { name: 'Add room', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Room 905', exact: true })).toBeVisible();
    await page.goto('/dashboard/hotel');
    const originalBranch = await page.getByLabel('Hotel branch', { exact: true }).inputValue();
    await page.getByRole('button', { name: 'New booking', exact: true }).click();
    await page.getByLabel('Guest name').fill(guestName);
    await page.getByLabel('Phone', { exact: true }).fill('9876543210');
    await page
      .getByLabel('Room', { exact: true })
      .selectOption({ label: `905 · ${typeName} · max 2 guests` });
    await page.getByRole('button', { name: 'Reserve room', exact: true }).click();
    await expect(page.getByRole('heading', { name: `${guestName} · Room 905` })).toBeVisible();
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check out', exact: true })).toBeVisible();
    const restaurantOrder = await billedOrder();
    await page.goto('/pos');
    await page
      .getByRole('button')
      .filter({ hasText: `#${restaurantOrder.orderNo} · Takeaway` })
      .click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Charge to room', exact: true }).click();
    await page.getByRole('button', { name: `Room 905 · ${guestName}`, exact: true }).click();
    await expect(
      page.getByText('Bill transferred to guest account', { exact: true }),
    ).toBeVisible();
    const charged = await (await context.request.get(`/api/orders/${restaurantOrder.id}`)).json();
    assert.equal(charged.status, 'CHARGED');
    assert.equal(Number(charged.paidTotal), 0);
    await page.goto('/dashboard/hotel');
    await page.getByRole('tab', { name: /^Staying/ }).click();
    await page.getByLabel('Search guests or rooms').fill(guestName);
    const output = path.join(cwd, 'test-results/pms');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'reception-desktop.png'), fullPage: true });
    await page.getByRole('button').filter({ hasText: guestName }).click();
    await page.getByLabel('Amount', { exact: true }).fill('310');
    await page.getByLabel('Description / reason').fill('Actual browser cash payment');
    await page.getByRole('button', { name: 'Save entry', exact: true }).click();
    await expect(page.getByText('Actual browser cash payment', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save entry', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Print guest statement', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'guest-account.png'), fullPage: true });
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Check out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check out', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog').getByText('Checked out', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('tab', { name: /^All bookings/ }).click();
    await expect(page.getByRole('button').filter({ hasText: guestName })).toBeVisible();
    await page.getByLabel('Search guests or rooms').fill('no-matching-hotel-guest');
    await expect(page.getByText('No matching guests or rooms', { exact: true })).toBeVisible();
    await page.getByLabel('Search guests or rooms').fill('');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'reception-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Reception must not overflow on mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Add hotel branch', exact: true }).click();
    const branchForm = page.getByRole('dialog', { name: 'Add hotel branch', exact: true });
    await branchForm.getByLabel('Branch location').selectOption('new');
    const branchName = `Browser branch ${suffix}`;
    await branchForm.getByLabel('Hotel branch name').fill(branchName);
    await branchForm.getByLabel('Branch code').fill(`H${String(suffix).slice(-8)}`);
    await branchForm.getByLabel('City', { exact: true }).fill('Pune');
    await branchForm.getByLabel('State', { exact: true }).selectOption('27');
    await branchForm.getByRole('button', { name: 'Create hotel branch' }).click();
    await expect(branchForm).toHaveCount(0);
    await expect(page.getByLabel('Hotel branch', { exact: true })).not.toHaveValue(originalBranch);
    await page.getByRole('navigation', { name: 'Hotel navigation' }).getByRole('link', { name: 'Reception', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Set up your first room', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New booking', exact: true })).toBeDisabled();
    await page.getByLabel('Hotel branch', { exact: true }).selectOption(originalBranch);
    await expect(page.getByRole('button', { name: 'New booking', exact: true })).toBeEnabled();
    await page.getByLabel('Reception date').fill('2026-01-01');
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByRole('tab', { name: /^Arrivals/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^Staying/ })).toBeFocused();
    await expect(page.getByRole('tab', { name: /^Staying/ })).toHaveAttribute('aria-selected', 'true');
    const newProperties = await (await context.request.get('/api/pms/properties')).json();
    const newProperty = newProperties.find((property) => property.name === branchName);
    assert.ok(newProperty);
    assert.deepEqual(await (await context.request.get(`/api/pms/${newProperty.id}/rooms`)).json(), []);
    await page.goto('/dashboard/hotel/calendar');
    await expect(page.getByRole('columnheader', { name: 'Room', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'calendar.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard/hotel/housekeeping');
    await expect(page.getByRole('heading', { name: 'Room 905', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'housekeeping-mobile.png'), fullPage: true });
    assert.deepEqual(errors, [], `Browser errors: ${errors.join(', ')}`);
  } finally {
    await browser?.close();
    if (web.exitCode === null) {
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/PID', String(web.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      else {
        const exited = new Promise((resolve) => web.once('exit', resolve));
        web.kill();
        await exited;
      }
    }
  }
};
