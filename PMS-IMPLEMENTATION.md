# Rizzoto inbuilt PMS — first working version

Implemented on 13 October 2026. This is a hotel operations module in the existing application, not a separate PMS service. It targets small independent hotels with a restaurant operating under the same outlet.

## Available workflows

- Enable a hotel for an existing outlet from Settings → Hotel module. Access follows existing business/outlet assignments. Restaurant-only businesses have no Hotel sidebar entry until a hotel is enabled.
- Create room types with capacity, nightly price before tax and an explicitly configured tax percentage. Add numbered rooms and floors. Rate changes apply to new bookings; existing bookings retain their agreed rate and tax snapshot.
- Reserve a specific room for 1–365 nights. Dates use the property's timezone and half-open intervals: departure day can be the next guest's arrival day. Simultaneous overlapping reservations are serialized by a property row lock. All PMS writes must go through the application API.
- Reception and a 14-day room calendar display bookings and checked-in guests. Overdue checked-in stays remain visible so reception can extend or resolve them.
- Check in on the arrival day after housekeeping marks the room ready. Move a guest to a ready room or extend a stay when no reservation conflicts. Room moves keep the agreed rate and dirty the previous room.
- Record deposits/payments, extra charges, manager-authorised credits and refunds. Payment/refund entries record money already moved; they do not initiate or verify bank transactions. Repeated identical request IDs do not create duplicate entries.
- Charge an unpaid printed restaurant bill to a checked-in guest from POS → More → Charge to room. The guest must allow room charging. The restaurant order becomes `CHARGED`, ingredients are deducted once, and no POS payment is created. Guest checkout and room charging share the same property lock.
- Checkout posts nights used, with a minimum of one night, and requires a zero balance. Early departures shorten the recorded stay. Checkout marks the room dirty.
- Housekeeping receives room readiness and occupancy without guest names, phone numbers or accounts. Maintenance changes require hotel management permission; rooms with active bookings cannot be blocked.
- Close completed business days manually. Resolve arrivals/no-shows and overdue departures first. Each room night and daily closing is posted once, including repeated requests.
- Reports distinguish posted room charges, restaurant transfers, extras, credits, collections and refunds. Restaurant transfers are already restaurant revenue; do not add them again to combined revenue.
- Print a guest account statement. It is explicitly not a tax invoice; restaurant invoices remain separate.

## Permissions

Owners have full access. Configure existing staff roles with the new Hotel permission group. New businesses also receive Receptionist and Housekeeping roles. Existing role records are not automatically widened.

Reception needs `hotel.view`, `hotel.frontdesk` and `hotel.billing`. Housekeeping needs `hotel.housekeeping`. Hotel setup and credits/refunds require `hotel.manage`; daily closing requires `hotel.close_day`. Reports also require `reports.view`. POS room charging requires `bill.settle` and `hotel.billing`; the guest-selection UI also requires `hotel.view`.

## Database and operation

Apply `20261013170000_hotel_pms` before starting the updated API. Build `@pos/shared` and regenerate Prisma. Deploy API and web together because both recognise the new `CHARGED` order status. Older desktop/offline hub builds do not provide hotel operations.

The migration was applied only to the isolated `rizzoto_security` database during development. No shop database or deployed website was changed.

Hotel operations require the cloud connection. The restaurant's existing offline mode does not queue hotel reservations or room-charge transfers.

## Verification

Completed checks: all 17 existing security scenarios and 12 PMS backend scenarios passed (the Node runner reports 30 passing tests including the PMS parent test). Workspace TypeScript checks, API build and web production build passed. A separate real Chrome run completed room setup → reservation → check-in → POS room transfer → combined payment → checkout. Desktop calendar and mobile housekeeping screenshots were visually inspected.

The integration suite starts the actual Nest API and uses PostgreSQL. It creates real persisted test businesses, rooms, guests, reservations, payments and restaurant orders. No API, database or payment-service mocks are used; these are test records, not production customer data.

```powershell
$env:SECURITY_DATABASE_URL = 'postgresql://security_test:security_test_local@127.0.0.1:55439/rizzoto_security'
pnpm --filter api test:integration
```

For browser verification, set `PMS_UI_TEST=1` before the same command. It starts Next.js on a temporary port and uses a real session from the test API. On this Windows computer it uses Chrome; on other environments set `E2E_CHANNEL` to an installed browser channel. It exercises room setup, reservation, check-in, POS room transfer, combined payment and checkout, then captures calendar and mobile housekeeping screenshots under `apps/web/test-results/pms`.

## Scope still to build before a full hotel launch

This version does not include room tax-invoice issuance, government guest reporting, identity-document storage, seasonal/occupancy/meal-plan pricing, unassigned room-type bookings, expiring holds, group/corporate accounts, booking-platform connections, direct website booking, guest messaging, housekeeping assignment, cross-outlet hotel charging, or offline hotel operations. Room-charge corrections currently use an authorised guest-account credit; transferred restaurant orders cannot be voided from the POS.

Complete hotel-specific accounting/tax workflows, backup/restore validation, production deployment and supervised hotel pilots before marketing this as a complete hotel PMS. Booking-platform connectivity remains a separate integration phase.
