const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, APP_GUARD, Reflector } = require('@nestjs/core');
const { StaffService } = require('../dist/staff/staff.service');
const { StaffController } = require('../dist/staff/staff.controller');
const { AuthGuard } = require('../dist/auth/auth.guard');
const { DEFAULT_ROLES, ALL_PERMISSIONS } = require('@pos/shared');

const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  manager: '22222222-2222-4222-8222-222222222222',
  waiter: '33333333-3333-4333-8333-333333333333',
  role: '44444444-4444-4444-8444-444444444444',
  outlet: '55555555-5555-4555-8555-555555555555',
  otherOutlet: '66666666-6666-4666-8666-666666666666',
};
const manager = {
  sessionId: 'session',
  userId: ids.manager,
  tenantId: 'tenant',
  isOwner: false,
  permissions: DEFAULT_ROLES.find((r) => r.name === 'Manager').permissions,
  outletIds: [ids.outlet],
  deviceId: null,
  deviceCode: null,
};
const owner = { ...manager, userId: ids.owner, isOwner: true, permissions: [], outletIds: null };

function fixture({
  targetOwner = false,
  targetPermissions = ['order.take'],
  targetOutlets = [ids.outlet],
  targetAllOutlets = false,
  assignedPermissions = ['order.take'],
  foreignTarget = false,
  foreignRole = false,
} = {}) {
  const calls = [];
  const target = {
    id: targetOwner ? ids.owner : ids.waiter,
    tenantId: 'tenant',
    isOwner: targetOwner,
    allOutlets: targetAllOutlets,
    status: 'ACTIVE',
    email: 'existing@example.invalid',
    role: { id: ids.role, permissions: targetOwner ? ALL_PERMISSIONS : targetPermissions },
    outlets: targetOutlets.map((outletId) => ({ outletId })),
  };
  const role = {
    id: ids.role,
    tenantId: 'tenant',
    name: 'Waiter',
    isSystem: false,
    permissions: assignedPermissions,
  };
  const presentable = (data = {}) => ({
    ...target,
    ...data,
    passwordHash: data.passwordHash ?? null,
    pinHash: data.pinHash ?? null,
    outlets: [],
    role: { id: ids.role, name: 'Waiter' },
  });
  const prisma = {
    user: {
      findFirst: async ({ where }) =>
        !foreignTarget && where.tenantId === target.tenantId ? target : null,
      count: async () => 0,
      create: async ({ data }) => {
        calls.push(['user.create', data]);
        return presentable(data);
      },
      update: async ({ data }) => {
        calls.push(['user.update', data]);
        return presentable(data);
      },
    },
    role: {
      findFirst: async ({ where }) =>
        !foreignRole && where.tenantId === role.tenantId ? role : null,
      create: async ({ data }) => {
        calls.push(['role.create', data]);
        return data;
      },
      update: async ({ data }) => {
        calls.push(['role.update', data]);
        return data;
      },
      delete: async () => {
        calls.push(['role.delete']);
      },
    },
    outlet: { count: async ({ where }) => where.id.in.length },
    userOutlet: {
      deleteMany: async () => {
        calls.push(['outlets.delete']);
      },
    },
    $transaction: async (fn) => {
      calls.push(['transaction']);
      return fn(prisma);
    },
  };
  const sessions = {
    revokeAllForUser: async (id) => {
      calls.push(['sessions.revoke', id]);
    },
  };
  return { service: new StaffService(prisma, sessions), calls, target, role };
}

async function denied(operation, f, status = 403) {
  await assert.rejects(
    async () => operation(),
    (err) => err.getStatus() === status,
  );
  assert.deepEqual(f.calls, [], 'Denied requests must not write or revoke anything');
}

for (const patch of [
  { email: 'attacker@example.invalid' },
  { email: null },
  { password: 'attacker-password' },
  { pin: '1234' },
  { name: 'Changed owner' },
  { phone: '9999999999' },
  { roleId: ids.role },
  { status: 'INACTIVE' },
  { allOutlets: false },
  { outletIds: [] },
]) {
  test(`manager cannot change owner ${Object.keys(patch)[0]} (${JSON.stringify(patch)})`, async () => {
    const f = fixture({ targetOwner: true });
    await denied(() => f.service.update(manager, ids.owner, patch), f);
  });
}

for (const method of ['createRole', 'updateRole', 'removeRole']) {
  test(`manager cannot ${method}, even with all permission codes`, async () => {
    const f = fixture();
    const actor = { ...manager, permissions: ALL_PERMISSIONS };
    const body = { name: 'Elevated', permissions: ALL_PERMISSIONS };
    await denied(
      () =>
        method === 'createRole'
          ? f.service[method](actor, body)
          : f.service[method](actor, ids.role, body),
      f,
    );
  });
}

test('manager cannot assign a role containing a permission they lack', async () => {
  const f = fixture({ assignedPermissions: ALL_PERMISSIONS });
  await denied(() => f.service.update(manager, ids.waiter, { roleId: ids.role }), f);
});
test('manager cannot create an account with greater permissions', async () => {
  const f = fixture({ assignedPermissions: ALL_PERMISSIONS });
  await denied(() => f.service.create(manager, { name: 'Admin', roleId: ids.role }), f);
});
test('manager cannot reset credentials of a more privileged non-owner', async () => {
  const f = fixture({ targetPermissions: ALL_PERMISSIONS });
  await denied(() => f.service.update(manager, ids.waiter, { password: 'new-password' }), f);
});
test('manager cannot downgrade a privileged account and reset its credentials', async () => {
  const f = fixture({ targetPermissions: ALL_PERMISSIONS });
  await denied(
    () =>
      f.service.update(manager, ids.waiter, {
        roleId: ids.role,
        email: 'attacker@example.invalid',
      }),
    f,
  );
});
test('manager cannot remove a more privileged account', async () => {
  const f = fixture({ targetPermissions: ALL_PERMISSIONS });
  await denied(() => f.service.remove(manager, ids.waiter), f);
});

for (const scope of [{ targetAllOutlets: true }, { targetOutlets: [ids.otherOutlet] }]) {
  test(`manager cannot take over an account outside their scope ${JSON.stringify(scope)}`, async () => {
    const f = fixture(scope);
    await denied(() => f.service.update(manager, ids.waiter, { pin: '1234' }), f);
  });
  test(`manager cannot remove an account outside their scope ${JSON.stringify(scope)}`, async () => {
    const f = fixture(scope);
    await denied(() => f.service.remove(manager, ids.waiter), f);
  });
}
for (const patch of [{ allOutlets: true }, { outletIds: [ids.otherOutlet] }]) {
  test(`manager cannot grant broader outlet access ${JSON.stringify(patch)}`, async () => {
    const f = fixture();
    await denied(() => f.service.update(manager, ids.waiter, patch), f);
  });
  test(`manager cannot create staff with broader outlet access ${JSON.stringify(patch)}`, async () => {
    const f = fixture();
    await denied(() => f.service.create(manager, { name: 'Staff', roleId: ids.role, ...patch }), f);
  });
}

test('cross-tenant staff and role IDs are rejected before writes', async () => {
  const staff = fixture({ foreignTarget: true });
  await denied(
    () => staff.service.update(owner, ids.waiter, { email: 'new@example.invalid' }),
    staff,
    404,
  );
  const role = fixture({ foreignRole: true });
  await denied(
    () => role.service.updateRole(owner, ids.role, { name: 'Role', permissions: [] }),
    role,
    404,
  );
});

test('owner can update their own PIN and old sessions are revoked', async () => {
  const f = fixture({ targetOwner: true });
  await f.service.update(owner, ids.owner, { pin: '1234' });
  const data = f.calls.find(([name]) => name === 'user.update')[1];
  assert.notEqual(data.pinHash, '1234');
  assert.ok(await require('bcryptjs').compare('1234', data.pinHash));
  assert.ok(f.calls.some(([name, id]) => name === 'sessions.revoke' && id === ids.owner));
});
test('owner email changes revoke existing sessions', async () => {
  const f = fixture({ targetOwner: true });
  await f.service.update(owner, ids.owner, { email: 'new@example.invalid' });
  assert.ok(f.calls.some(([name]) => name === 'sessions.revoke'));
});
test('saving an unchanged email does not sign the user out', async () => {
  const f = fixture({ targetOwner: true });
  await f.service.update(owner, ids.owner, { name: 'Owner updated', email: f.target.email });
  assert.equal(
    f.calls.some(([name]) => name === 'sessions.revoke'),
    false,
  );
});
for (const patch of [{ email: null }, { roleId: ids.role }, { status: 'INACTIVE' }]) {
  test(`owner account invariants remain protected ${JSON.stringify(patch)}`, async () => {
    const f = fixture({ targetOwner: true });
    await denied(() => f.service.update(owner, ids.owner, patch), f, 400);
  });
}
test('owner cannot be deleted', async () => {
  const f = fixture({ targetOwner: true });
  await denied(() => f.service.remove(owner, ids.owner), f, 400);
});
test('manager can create ordinary staff within their outlets', async () => {
  const f = fixture();
  const result = await f.service.create(manager, {
    name: 'Waiter',
    roleId: ids.role,
    outletIds: [ids.outlet],
    password: 'safe-password',
  });
  assert.equal(result.hasPassword, true);
  assert.equal('passwordHash' in result, false);
  assert.equal('pinHash' in result, false);
  assert.ok(f.calls.some(([name]) => name === 'user.create'));
});
test('manager can update and remove ordinary staff', async () => {
  const f = fixture();
  await f.service.update(manager, ids.waiter, { name: 'New name', roleId: ids.role });
  assert.ok(f.calls.some(([name]) => name === 'user.update'));
  assert.equal(
    f.calls.some(([name]) => name === 'sessions.revoke'),
    false,
  );
  await f.service.remove(manager, ids.waiter);
  assert.ok(f.calls.some(([name]) => name === 'sessions.revoke'));
});
test('owner can grant greater permissions and all-outlet access to non-owners', async () => {
  const f = fixture({ assignedPermissions: ALL_PERMISSIONS });
  await f.service.update(owner, ids.waiter, { roleId: ids.role, allOutlets: true });
  assert.ok(f.calls.some(([name]) => name === 'user.update'));
});
test('owner can create, edit and remove custom roles', async () => {
  const f = fixture();
  const body = { name: 'Custom admin', permissions: ALL_PERMISSIONS };
  await f.service.createRole(owner, body);
  await f.service.updateRole(owner, ids.role, body);
  await f.service.removeRole(owner, ids.role);
  assert.deepEqual(
    f.calls.map(([name]) => name),
    ['role.create', 'role.update', 'role.delete'],
  );
});
test('system Owner role cannot be assigned, edited or removed', async () => {
  const f = fixture();
  f.role.name = 'Owner';
  f.role.isSystem = true;
  await denied(() => f.service.create(owner, { name: 'Second owner', roleId: ids.role }), f, 400);
  await denied(
    () => f.service.updateRole(owner, ids.role, { name: 'Changed', permissions: [] }),
    f,
    400,
  );
  await denied(() => f.service.removeRole(owner, ids.role), f, 400);
});

test('HTTP routes enforce owner protection and role restrictions through the real auth guard', async () => {
  const f = fixture({ targetOwner: true });
  class TestModule {}
  Module({
    controllers: [StaffController],
    providers: [
      { provide: StaffService, useValue: f.service },
      {
        provide: APP_GUARD,
        useFactory: (reflector) =>
          new AuthGuard(reflector, {
            resolve: async (token) =>
              ({ manager, owner, cashier: { ...manager, permissions: ['bill.settle'] } })[token] ??
              null,
          }),
        inject: [Reflector],
      },
    ],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = (route, method, token, body) =>
      fetch(`${base}/api${route}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    for (const body of [
      { email: 'attacker@example.invalid' },
      { password: 'attacker-password' },
      { pin: '1234' },
    ]) {
      assert.equal((await request(`/staff/${ids.owner}`, 'PATCH', 'manager', body)).status, 403);
    }
    for (const [route, method] of [
      ['/roles', 'POST'],
      [`/roles/${ids.role}`, 'PATCH'],
      [`/roles/${ids.role}`, 'DELETE'],
    ]) {
      assert.equal(
        (
          await request(
            route,
            method,
            'manager',
            method === 'DELETE' ? undefined : { name: 'Admin', permissions: ALL_PERMISSIONS },
          )
        ).status,
        403,
      );
    }
    assert.equal(
      (await request(`/staff/${ids.owner}`, 'PATCH', 'cashier', { name: 'Changed' })).status,
      403,
    );
    assert.equal(
      (await request(`/staff/${ids.owner}`, 'PATCH', undefined, { name: 'Changed' })).status,
      401,
    );
    assert.deepEqual(f.calls, []);
    assert.equal(
      (await request('/roles', 'POST', 'owner', { name: 'Admin', permissions: ALL_PERMISSIONS }))
        .status,
      201,
    );
    assert.equal(
      (await request(`/staff/${ids.owner}`, 'PATCH', 'owner', { name: 'Owner updated' })).status,
      200,
    );
  } finally {
    await app.close();
  }
});
