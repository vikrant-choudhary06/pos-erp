const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hotelToday, hotelDate, hotelDateKey, addHotelDays } = require('@pos/shared');

// These scenarios use the running Nest API and real PostgreSQL records.
module.exports = async function pmsScenarios(
  t,
  { request, db, owner, outsider, outletA, outletB, staff, staffSession, billedOrder, ingredient },
) {
  const today = hotelToday('Asia/Kolkata');
  const day = (offset) => hotelDateKey(addHotelDays(hotelDate(today), offset));
  const property = (
    await request(
      owner,
      'POST',
      '/pms/properties',
      { outletId: outletA.id, name: 'Integration Hotel' },
      201,
    )
  ).data;
  const root = `/pms/${property.id}`;
  const type = (
    await request(
      owner,
      'POST',
      `${root}/room-types`,
      { name: 'Standard', capacity: 2, nightlyRate: 1000, taxPercent: 5 },
      201,
    )
  ).data;
  let roomNumber = 100;
  const room = async () =>
    (
      await request(
        owner,
        'POST',
        `${root}/rooms`,
        { roomTypeId: type.id, number: String(++roomNumber) },
        201,
      )
    ).data;
  const payload = (r, extra = {}) => ({
    id: randomUUID(),
    roomId: r.id,
    arrival: today,
    departure: day(1),
    guests: 1,
    guestName: 'Actual test guest',
    phone: '9876543210',
    ...extra,
  });
  const book = async (r, extra) =>
    (await request(owner, 'POST', `${root}/reservations`, payload(r, extra), 201)).data;
  const enter = async (stay) =>
    request(owner, 'POST', `${root}/reservations/${stay.id}/check-in`, undefined, 201);
  const payment = (amount, extra = {}) => ({
    id: randomUUID(),
    kind: 'PAYMENT',
    amount,
    description: 'Cash collected at reception',
    method: 'CASH',
    ...extra,
  });
  const account = (stay) => `${root}/reservations/${stay.id}`;

  await t.test('hotel access is scoped by business, outlet and role', async () => {
    await request(outsider, 'GET', `${root}/rooms`, undefined, 404);
    const person = await staff('Hotel housekeeper');
    const role = (
      await request(
        owner,
        'POST',
        '/roles',
        { name: 'Housekeeper integration', permissions: ['hotel.housekeeping'] },
        201,
      )
    ).data;
    await request(owner, 'PATCH', `/staff/${person.id}`, { roleId: role.id });
    const actor = await staffSession(person);
    await request(actor, 'GET', `${root}/rooms`);
    await request(actor, 'GET', `${root}/reservations?from=${today}&to=${day(1)}`, undefined, 403);
    const other = (
      await request(
        owner,
        'POST',
        '/pms/properties',
        { outletId: outletB.id, name: 'Airport Hotel' },
        201,
      )
    ).data;
    await request(actor, 'GET', `/pms/${other.id}/rooms`, undefined, 404);
    const r = await room();
    await request(actor, 'PATCH', `${root}/rooms/${r.id}/status`, { status: 'MAINTENANCE' }, 403);
    await request(actor, 'PATCH', `${root}/rooms/${r.id}/status`, { status: 'CLEANING' });
    await request(actor, 'PATCH', `${root}/rooms/${r.id}/status`, { status: 'READY' });
  });

  await t.test('concurrent overlapping reservations allocate one room once', async () => {
    const r = await room();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(owner, 'POST', `${root}/reservations`, payload(r), [201, 409]),
      ),
    );
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    assert.equal(await db.hotelReservation.count({ where: { roomId: r.id } }), 1);
    const first = results.find((result) => result.status === 201).data;
    await request(
      owner,
      'POST',
      `${root}/reservations`,
      payload(r, { arrival: day(1), departure: day(2) }),
      201,
    );
    assert.equal(first.estimatedBalance, 1050);
  });

  await t.test(
    'booking retries are idempotent and invalid dates/capacity are rejected',
    async () => {
      const r = await room();
      const body = payload(r);
      const results = await Promise.all([
        request(owner, 'POST', `${root}/reservations`, body, 201),
        request(owner, 'POST', `${root}/reservations`, body, 201),
      ]);
      assert.equal(results[0].data.id, results[1].data.id);
      await request(
        owner,
        'POST',
        `${root}/reservations`,
        { ...body, guestName: 'Different guest' },
        409,
      );
      await request(
        owner,
        'POST',
        `${root}/reservations`,
        payload(await room(), { arrival: '2026-02-30', departure: day(1) }),
        400,
      );
      await request(
        owner,
        'POST',
        `${root}/reservations`,
        payload(await room(), { departure: today }),
        400,
      );
      await request(
        owner,
        'POST',
        `${root}/reservations`,
        payload(await room(), { guests: 3 }),
        400,
      );
    },
  );

  await t.test(
    'existing reservations retain their agreed rates when a room type changes',
    async () => {
      const existing = await book(await room());
      await request(owner, 'PATCH', `${root}/room-types/${type.id}`, { nightlyRate: 1500 });
      const newer = await book(await room());
      assert.equal(Number(existing.nightlyRate), 1000);
      assert.equal(Number(newer.nightlyRate), 1500);
      assert.equal((await request(owner, 'GET', account(existing))).data.estimatedBalance, 1050);
      await request(owner, 'PATCH', `${root}/room-types/${type.id}`, { nightlyRate: 1000 });
    },
  );

  await t.test(
    'check-in requires housekeeping readiness; checkout requires settlement and dirties the room',
    async () => {
      const r = await room();
      const stay = await book(r);
      await request(owner, 'PATCH', `${root}/rooms/${r.id}/status`, { status: 'DIRTY' });
      await request(owner, 'POST', `${account(stay)}/check-in`, undefined, 400);
      await request(owner, 'PATCH', `${root}/rooms/${r.id}/status`, { status: 'READY' });
      await enter(stay);
      await enter(stay);
      await request(owner, 'POST', `${account(stay)}/check-out`, undefined, 400);
      await request(owner, 'POST', `${account(stay)}/entries`, payment(1050), 201);
      await request(owner, 'POST', `${account(stay)}/check-out`, undefined, 201);
      await request(owner, 'POST', `${account(stay)}/check-out`, undefined, 201);
      const current = (await request(owner, 'GET', account(stay))).data;
      assert.equal(current.status, 'CHECKED_OUT');
      assert.equal(current.balance, 0);
      assert.equal(current.entries.filter((entry) => entry.kind === 'ROOM').length, 1);
      assert.equal((await db.hotelRoom.findUniqueOrThrow({ where: { id: r.id } })).status, 'DIRTY');
    },
  );

  await t.test(
    'concurrent payments cannot overpay and identical payment retries create one entry',
    async () => {
      const stay = await book(await room());
      const duplicate = payment(100);
      await Promise.all([
        request(owner, 'POST', `${account(stay)}/entries`, duplicate, 201),
        request(owner, 'POST', `${account(stay)}/entries`, duplicate, 201),
      ]);
      assert.equal(await db.hotelFolioEntry.count({ where: { id: duplicate.id } }), 1);
      const results = await Promise.all([
        request(owner, 'POST', `${account(stay)}/entries`, payment(800), [201, 400]),
        request(owner, 'POST', `${account(stay)}/entries`, payment(800), [201, 400]),
      ]);
      assert.equal(results.filter((result) => result.status === 201).length, 1);
      assert.equal((await request(owner, 'GET', account(stay))).data.estimatedBalance, 150);
      await request(owner, 'POST', `${account(stay)}/entries`, { ...duplicate, amount: 200 }, 400);
      await request(
        owner,
        'POST',
        `${account(stay)}/entries`,
        payment(10, { method: 'CREDIT' }),
        400,
      );
    },
  );

  await t.test(
    'cancelled bookings release availability and refunds cannot exceed collected money',
    async () => {
      const r = await room();
      const stay = await book(r);
      await request(owner, 'POST', `${account(stay)}/entries`, payment(200), 201);
      await request(
        owner,
        'POST',
        `${account(stay)}/cancel`,
        { status: 'CANCELLED', reason: 'Guest cancelled before arrival' },
        201,
      );
      await book(r);
      await request(
        owner,
        'POST',
        `${account(stay)}/entries`,
        payment(201, { kind: 'REFUND', description: 'Refund to guest' }),
        400,
      );
      await request(
        owner,
        'POST',
        `${account(stay)}/entries`,
        payment(200, { kind: 'REFUND', description: 'Deposit refund' }),
        201,
      );
      assert.equal((await request(owner, 'GET', account(stay))).data.balance, 0);
    },
  );

  await t.test(
    'room moves dirty the original room and extensions reject another reservation',
    async () => {
      const original = await room(),
        destination = await room();
      const stay = await book(original);
      await enter(stay);
      await request(owner, 'PATCH', account(stay), { roomId: destination.id });
      assert.equal(
        (await db.hotelRoom.findUniqueOrThrow({ where: { id: original.id } })).status,
        'DIRTY',
      );
      await book(destination, { arrival: day(1), departure: day(2) });
      await request(owner, 'PATCH', account(stay), { departure: day(2) }, 409);
      assert.equal(
        (await request(owner, 'GET', account(stay))).data.departure.slice(0, 10),
        day(1),
      );
    },
  );

  await t.test('restaurant transfer is idempotent and is not a cash collection', async () => {
    const stay = await book(await room());
    await enter(stay);
    const order = await billedOrder();
    const stockBefore = (
      await db.outletStock.findFirstOrThrow({
        where: { outletId: outletA.id, inventoryItemId: ingredient.id },
      })
    ).quantity;
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(owner, 'POST', `/orders/${order.id}/charge-room`, { reservationId: stay.id }),
      ),
    );
    assert.ok(results.every((result) => result.data.status === 'CHARGED'));
    assert.equal(await db.hotelFolioEntry.count({ where: { orderId: order.id } }), 1);
    assert.equal(await db.payment.count({ where: { orderId: order.id } }), 0);
    const stockAfter = (
      await db.outletStock.findFirstOrThrow({
        where: { outletId: outletA.id, inventoryItemId: ingredient.id },
      })
    ).quantity;
    assert.equal(Number(stockBefore) - Number(stockAfter), 200);
    await request(
      owner,
      'POST',
      `/orders/${order.id}/payments`,
      { payments: [{ id: randomUUID(), method: 'CASH', amount: 100 }] },
      400,
    );
    await request(
      owner,
      'POST',
      `/orders/${order.id}/void`,
      { reason: 'Cannot bypass hotel account' },
      400,
    );
    const current = (await request(owner, 'GET', account(stay))).data;
    assert.equal(current.estimatedBalance, 1150);
    await request(owner, 'POST', `${account(stay)}/entries`, payment(1150), 201);
    await request(owner, 'POST', `${account(stay)}/check-out`, undefined, 201);
    const final = (await request(owner, 'GET', account(stay))).data;
    assert.equal(final.balance, 0);
  });

  await t.test(
    'room charges racing with checkout cannot leave a closed unpaid account',
    async () => {
      const stay = await book(await room());
      await enter(stay);
      await request(owner, 'POST', `${account(stay)}/entries`, payment(1050), 201);
      const order = await billedOrder();
      const results = await Promise.all([
        request(
          owner,
          'POST',
          `/orders/${order.id}/charge-room`,
          { reservationId: stay.id },
          [200, 400],
        ),
        request(owner, 'POST', `${account(stay)}/check-out`, undefined, [201, 400]),
      ]);
      assert.equal(results.filter((result) => result.status < 400).length, 1);
      const current = (await request(owner, 'GET', account(stay))).data;
      if (current.status === 'CHECKED_OUT') assert.equal(current.balance, 0);
      else assert.equal(current.checkoutBalance, 100);
    },
  );

  await t.test(
    'overdue checked-in guests remain visible and room charging can be disabled',
    async () => {
      const r = await room();
      const stay = await book(r);
      await enter(stay);
      await db.hotelReservation.update({
        where: { id: stay.id },
        data: { arrival: hotelDate(day(-2)), departure: hotelDate(day(-1)) },
      });
      const listed = (
        await request(owner, 'GET', `${root}/reservations?from=${today}&to=${day(1)}`)
      ).data;
      assert.ok(listed.some((item) => item.id === stay.id));
      const currentRooms = (await request(owner, 'GET', `${root}/rooms`)).data;
      assert.equal(currentRooms.find((item) => item.id === r.id).occupied, true);
      await request(owner, 'PATCH', account(stay), { departure: day(1), allowRoomCharges: false });
      const order = await billedOrder();
      await request(
        owner,
        'POST',
        `/orders/${order.id}/charge-room`,
        { reservationId: stay.id },
        400,
      );
      assert.equal(await db.hotelFolioEntry.count({ where: { orderId: order.id } }), 0);
    },
  );

  await t.test('daily closing posts each night once and cannot close a future day', async () => {
    const otherProperty = (
      await request(
        owner,
        'POST',
        '/pms/properties',
        {
          outletId: (
            await request(
              owner,
              'POST',
              '/outlets',
              { name: 'Night audit property', code: 'NIGHT', city: 'Indore', stateCode: '23' },
              201,
            )
          ).data.id,
          name: 'Night Audit Hotel',
        },
        201,
      )
    ).data;
    const otherRoot = `/pms/${otherProperty.id}`;
    const otherType = (
      await request(
        owner,
        'POST',
        `${otherRoot}/room-types`,
        { name: 'Audit room', capacity: 2, nightlyRate: 1000, taxPercent: 5 },
        201,
      )
    ).data;
    const r = (
      await request(
        owner,
        'POST',
        `${otherRoot}/rooms`,
        { roomTypeId: otherType.id, number: '1' },
        201,
      )
    ).data;
    const stay = (await request(owner, 'POST', `${otherRoot}/reservations`, payload(r), 201)).data;
    await request(owner, 'POST', `${otherRoot}/reservations/${stay.id}/check-in`, undefined, 201);
    // Exercise the previous business day using real persisted records; no clock/provider mocks.
    await db.hotelProperty.update({
      where: { id: otherProperty.id },
      data: { businessDate: hotelDate(day(-1)) },
    });
    await db.hotelReservation.update({
      where: { id: stay.id },
      data: { arrival: hotelDate(day(-1)) },
    });
    const results = await Promise.all([
      request(owner, 'POST', `${otherRoot}/close-day`, { date: day(-1) }, 201),
      request(owner, 'POST', `${otherRoot}/close-day`, { date: day(-1) }, 201),
    ]);
    assert.equal(results[0].data.id, results[1].data.id);
    assert.equal(
      await db.hotelFolioEntry.count({ where: { reservationId: stay.id, kind: 'ROOM' } }),
      1,
    );
    await request(owner, 'POST', `${otherRoot}/close-day`, { date: today }, 400);
    const report = (await request(owner, 'GET', `${otherRoot}/report?from=${day(-1)}&to=${day(1)}`))
      .data;
    assert.equal(report.roomRevenue, 1050);
    assert.equal(report.collected, 0);
  });
};
