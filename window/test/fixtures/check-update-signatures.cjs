const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { NsisUpdater } = require('electron-updater');

app.setPath('userData', process.argv[2]);
app.disableHardwareAcceleration();
app
  .whenReady()
  .then(async () => {
    const updater = new NsisUpdater();
    updater.logger = { info() {}, warn() {}, error() {}, debug() {} };
    // Use real Windows executable files and the installed updater's own verifier.
    const unsigned = process.execPath;
    const signed = path.join(
      process.env.SystemRoot,
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    );
    const pinnedConfig = path.resolve(__dirname, '../../dist/trusted-update.json');
    const config = JSON.parse(fs.readFileSync(pinnedConfig, 'utf8'));
    assert.deepEqual(config.publisherName, ['Rizzoto Security Test Publisher']);
    updater.updateConfigPath = pinnedConfig;
    assert.notEqual(
      await updater.verifySignature(unsigned),
      null,
      'Unsigned executable was accepted',
    );
    assert.notEqual(
      await updater.verifySignature(signed),
      null,
      'Different publisher was accepted',
    );

    // Verify the successful path against a real Windows publisher as well.
    const windowsConfig = path.join(process.argv[2], 'windows-publisher.json');
    fs.writeFileSync(
      windowsConfig,
      JSON.stringify({ ...config, publisherName: ['Microsoft Windows'] }),
    );
    updater.updateConfigPath = windowsConfig;
    assert.equal(
      await updater.verifySignature(signed),
      null,
      'Valid matching publisher was rejected',
    );
    if (process.argv[3]) {
      const installer = path.resolve(process.argv[3]);
      const publisher = process.argv[4];
      assert.ok(publisher, 'A publisher is required for the signed installer check');
      assert.ok(fs.existsSync(installer), 'Signed installer does not exist');
      updater.updateConfigPath = pinnedConfig;
      assert.notEqual(
        await updater.verifySignature(installer),
        null,
        'Signed installer was accepted for a different publisher',
      );
      const installerConfig = path.join(process.argv[2], 'installer-publisher.json');
      fs.writeFileSync(installerConfig, JSON.stringify({ ...config, publisherName: [publisher] }));
      updater.updateConfigPath = installerConfig;
      assert.equal(
        await updater.verifySignature(installer),
        null,
        'Signed installer was rejected for its matching publisher',
      );
      const tampered = path.join(process.argv[2], 'tampered-installer.exe');
      const bytes = fs.readFileSync(installer);
      // Alter the signed DOS stub, leaving the PE header and certificate intact.
      bytes[0x50] ^= 1;
      fs.writeFileSync(tampered, bytes);
      assert.notEqual(
        await updater.verifySignature(tampered),
        null,
        'Tampered signed installer was accepted',
      );
      console.log('Real signed installer checks passed: wrong publisher rejected, matching publisher accepted, tampered file rejected');
    }
    console.log(
      'Real Windows update signature checks passed: unsigned rejected, wrong publisher rejected, matching publisher accepted',
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
