const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { AuthService } = require('../dist/auth/auth.service');

test('offline authorization ends within 12 hours and never outlives the cloud session', async () => {
  const service = new AuthService(
    {
      user: {
        findUniqueOrThrow: async () => ({
          id: 'u',
          isOwner: true,
          tenant: { id: 't' },
          outlets: [],
        }),
      },
      outlet: { findMany: async () => [] },
    },
    {},
    {},
  );
  const now = Date.now();
  const auth = {
    userId: 'u',
    permissions: [],
    expiresAt: new Date(now + 30 * 86400000).toISOString(),
  };
  const long = await service.me(auth);
  assert.ok(Date.parse(long.offlineExpiresAt) <= Date.now() + 12 * 3600000);
  assert.ok(Date.parse(long.offlineExpiresAt) >= now + 12 * 3600000);
  const short = await service.me({ ...auth, expiresAt: new Date(now + 60000).toISOString() });
  assert.equal(short.offlineExpiresAt, new Date(now + 60000).toISOString());
  const legacy = await service.me({ ...auth, expiresAt: undefined });
  assert.ok(Date.parse(legacy.offlineExpiresAt) <= Date.now());
});
