const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test(
  '15: real Windows updater rejects unsigned and incorrectly signed executables',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  () => {
    const root = fs.realpathSync(os.tmpdir());
    const dir = fs.mkdtempSync(path.join(root, 'rizzoto-update-signatures-'));
    const cwd = path.resolve(__dirname, '..');
    const env = {
      ...process.env,
      RIZZOTO_UPDATE_REPO: 'security-tests/releases',
      RIZZOTO_UPDATE_PUBLISHER: 'Rizzoto Security Test Publisher',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.RIZZOTO_UPDATE_HOST;
    try {
      const build = spawnSync(process.execPath, ['build.mjs'], {
        cwd,
        env,
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.equal(build.status, 0, build.stderr);
      const checked = spawnSync(
        require('electron'),
        [
          path.join(cwd, 'test/fixtures/check-update-signatures.cjs'),
          dir,
          ...(process.env.RIZZOTO_TEST_SIGNED_INSTALLER
            ? [process.env.RIZZOTO_TEST_SIGNED_INSTALLER, process.env.RIZZOTO_TEST_SIGNED_PUBLISHER ?? '']
            : []),
        ],
        {
          cwd,
          env,
          encoding: 'utf8',
          windowsHide: true,
          timeout: 50_000,
        },
      );
      assert.equal(checked.status, 0, `${checked.error?.message ?? ''}\n${checked.stderr}`);
      assert.match(checked.stdout, /Real Windows update signature checks passed/);
      if (process.env.RIZZOTO_TEST_SIGNED_INSTALLER) {
        assert.match(checked.stdout, /Real signed installer checks passed/);
      }
    } finally {
      // Restore the user's ordinary local build after exercising update-enabled output.
      const localEnv = { ...process.env };
      delete localEnv.RIZZOTO_UPDATE_REPO;
      delete localEnv.RIZZOTO_UPDATE_PUBLISHER;
      delete localEnv.RIZZOTO_UPDATE_HOST;
      const restored = spawnSync(process.execPath, ['build.mjs'], {
        cwd,
        env: localEnv,
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.equal(restored.status, 0, restored.stderr);
      assert.equal(path.dirname(fs.realpathSync(dir)), root);
      assert.ok(path.basename(dir).startsWith('rizzoto-update-signatures-'));
      fs.rmSync(dir, { recursive: true, maxRetries: 3, retryDelay: 100 });
    }
  },
);
