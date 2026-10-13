const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test(
  'Windows safeStorage encrypts and decrypts through the real Electron runtime',
  { skip: process.platform !== 'win32', timeout: 20000 },
  () => {
    const root = fs.realpathSync(os.tmpdir());
    const dir = fs.mkdtempSync(path.join(root, 'rizzoto-dpapi-test-'));
    try {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const result = spawnSync(
        require('electron'),
        [path.join(__dirname, 'fixtures/check-safe-storage.cjs'), dir],
        { env, encoding: 'utf8', timeout: 15000, windowsHide: true },
      );
      assert.equal(result.status, 0, `${result.error?.message ?? ''}\n${result.stderr}`);
      assert.match(result.stdout, /Windows safeStorage roundtrip passed/);
    } finally {
      assert.equal(path.dirname(fs.realpathSync(dir)), root);
      assert.ok(path.basename(dir).startsWith('rizzoto-dpapi-test-'));
      fs.rmSync(dir, { recursive: true, maxRetries: 3, retryDelay: 100 });
    }
  },
);
