const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { _electron: electron } = require('@playwright/test');

test('signed packaged app starts, isolates settings and decrypts persisted data after restart', {
  skip: process.platform !== 'win32' || !process.env.RIZZOTO_TEST_PACKAGED_EXE,
  timeout: 60_000,
}, async () => {
  const root = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(root, 'rizzoto-packaged-runtime-'));
  const secret = randomBytes(32).toString('base64');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let running;
  try {
    const launch = () => electron.launch({
      executablePath: path.resolve(process.env.RIZZOTO_TEST_PACKAGED_EXE),
      args: [`--user-data-dir=${dir}`],
      env,
      timeout: 20_000,
    });
    running = await launch();
    const page = await running.firstWindow();
    await page.locator('#updateText').waitFor();
    await page.waitForFunction(() => document.querySelector('#updateText').textContent.includes('Version'));
    const info = await running.evaluate(({ app, BrowserWindow, safeStorage }, value) => {
      const directory = app.getPath('userData');
      const encrypted = safeStorage.encryptString(value);
      return {
        packaged: app.isPackaged,
        version: app.getVersion(),
        directory,
        encryption: safeStorage.isEncryptionAvailable(),
        containsPlaintext: encrypted.includes(Buffer.from(value)),
        encrypted: encrypted.toString('base64'),
        preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
      };
    }, secret);
    assert.equal(fs.realpathSync(info.directory), fs.realpathSync(dir));
    assert.equal(info.packaged, true);
    assert.equal(info.version, require('../package.json').version);
    assert.equal(info.encryption, true);
    assert.equal(info.containsPlaintext, false);
    fs.writeFileSync(path.join(dir, 'runtime-encrypted.bin'), Buffer.from(info.encrypted, 'base64'));
    assert.equal(info.preferences.nodeIntegration, false);
    assert.equal(info.preferences.contextIsolation, true);
    assert.match(await page.locator('#updateText').textContent(), /updates are off/);
    assert.equal(await page.locator('[name="cloudUrl"]').inputValue(), '');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    await page.screenshot({ path: path.resolve(__dirname, '../test-results/signed-startup.png') });
    await running.close();
    running = await launch();
    await running.firstWindow();
    const recovered = await running.evaluate(({ safeStorage }, encrypted) =>
      safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
      fs.readFileSync(path.join(dir, 'runtime-encrypted.bin')).toString('base64'),
    );
    assert.equal(recovered, secret);
  } finally {
    if (running) await running.close();
    assert.equal(path.dirname(fs.realpathSync(dir)), root);
    assert.ok(path.basename(dir).startsWith('rizzoto-packaged-runtime-'));
    fs.rmSync(dir, { recursive: true, maxRetries: 5, retryDelay: 300 });
  }
});
