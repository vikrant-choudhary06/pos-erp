// Real Windows OS encryption smoke test; creates no application window.
const assert = require('node:assert/strict');
const { app, safeStorage } = require('electron');
app.setPath('userData', process.argv[2]);
app.disableHardwareAcceleration();
app
  .whenReady()
  .then(() => {
    assert.equal(safeStorage.isEncryptionAvailable(), true);
    const plain = 'SYNTHETIC_HUB_SECRET';
    const encrypted = safeStorage.encryptString(plain);
    assert.equal(encrypted.includes(Buffer.from(plain)), false);
    assert.equal(safeStorage.decryptString(encrypted), plain);
    console.log('Windows safeStorage roundtrip passed');
    app.exit(0);
  })
  .catch((error) => {
    console.error(error.message);
    app.exit(1);
  });
