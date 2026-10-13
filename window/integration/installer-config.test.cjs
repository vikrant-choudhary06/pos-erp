const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const path = require('node:path');

test('installer configuration passes the installed electron-builder schema', async () => {
  const builderRequire = createRequire(require.resolve('electron-builder'));
  const { getConfig, validateConfiguration } = builderRequire('app-builder-lib/out/util/config/config');
  const { DebugLogger } = builderRequire('builder-util');
  const config = await getConfig(path.resolve(__dirname, '..'), 'electron-builder.yml');

  await validateConfiguration(config, new DebugLogger(false));
  assert.equal(config.forceCodeSigning, true);
  assert.equal(config.win.verifyUpdateCodeSignature, true);
  assert.equal(config.win.signtoolOptions.publisherName, '${env.RIZZOTO_UPDATE_PUBLISHER}');
});
