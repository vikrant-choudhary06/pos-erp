# Rizzoto inbuilt PMS — first working version

Implemented on 13 October 2026. This is a hotel operations module in the existing application, not a separate PMS service. It targets small independent hotels with a restaurant operating under the same outlet.

## Available workflows

- Open Settings → Hotel module, then Add hotel branch. Enable a hotel at an existing location, or owners can create a new location with name, branch code, city and state directly in this flow. Access follows existing business/outlet assignments. Restaurant-only businesses have no Hotel sidebar entry until a hotel is enabled.
- Create room types with capacity, nightly price before tax and an explicitly configured tax percentage. Add numbered rooms and floors. Rate changes apply to new bookings; existing bookings retain their agreed rate and tax snapshot.
- Reserve a specific room for 1–365 nights. Dates use the property's timezone and half-open intervals: departure day can be the next guest's arrival day. Simultaneous overlapping reservations are serialized by a property row lock. All PMS writes must go through the application API.
- Reception groups arrivals, current stays, departures due/overdue and all bookings, with guest/phone/room search, date selection and a Today shortcut. All bookings covers a 31-day window; overdue checked-in stays remain visible. The room calendar displays 14 days. Completed stays also remain visible when searching their departure date.
- Check in on the arrival day after housekeeping marks the room ready. Move a guest to a ready room or extend a stay when no reservation conflicts. Room moves keep the agreed rate and dirty the previous room.
- Record deposits/payments, extra charges, manager-authorised credits and refunds. Payment/refund entries record money already moved; they do not initiate or verify bank transactions. Repeated identical request IDs do not create duplicate entries.
- Charge an unpaid printed restaurant bill to a checked-in guest from POS → More → Charge to room. The guest must allow room charging. The restaurant order becomes `CHARGED`, ingredients are deducted once, and no POS payment is created. Guest checkout and room charging share the same property lock.
- Checkout posts nights used, with a minimum of one night, and requires a zero balance. Early departures shorten the recorded stay. Checkout marks the room dirty.
- Housekeeping receives room readiness and occupancy without guest names, phone numbers or accounts. Maintenance changes require hotel management permission; rooms with active bookings cannot be blocked.
- Close completed business days manually. Resolve arrivals/no-shows and overdue departures first. Each room night and daily closing is posted once, including repeated requests.
- Reports distinguish posted room charges, restaurant transfers, extras, credits, collections and refunds. Restaurant transfers are already restaurant revenue; do not add them again to combined revenue.
- Print a guest account statement. It is explicitly not a tax invoice; restaurant invoices remain separate.

## Permissions

Owners have full access. New businesses receive Hotel Manager, Receptionist, Cleaner and Night Auditor roles, as well as the existing Housekeeping role. Migration `20261013190000_hotel_staff_roles` adds missing hotel roles to existing active businesses. Existing roles with the same name, their permissions and staff assignments are preserved. Owners assign roles and outlets under Staff; the legacy Housekeeping role remains available.

| Role | Access |
| --- | --- |
| Hotel Manager | Hotel setup, reception, guest payments, refunds/credits, housekeeping, reports and daily closing; no staff administration or restaurant management |
| Receptionist | Reservations, check-in/out and guest payments; no refunds/credits, rate changes or daily closing |
| Cleaner | Room cleaning status and occupancy only; no guest details, accounts or payments |
| Night Auditor | Guest accounts, payments, reports and daily closing; no reservations/check-in changes, room setup or refunds/credits |

Reception needs `hotel.view`, `hotel.frontdesk` and `hotel.billing`. Housekeeping needs `hotel.housekeeping`. Hotel setup and credits/refunds require `hotel.manage`; daily closing requires `hotel.close_day`. Reports also require `reports.view`. POS room charging requires `bill.settle` and `hotel.billing`; the guest-selection UI also requires `hotel.view`.

## Hotel workspace usability — 14 October 2026

The hotel header provides a branch selector and branch setup without leaving the hotel workspace. Reception separates daily work into tabs with counts and search. Booking forms show essential fields first, with email and notes under optional details. Guest accounts emphasise the checkout balance; balance breakdown, cancellation/no-show actions and room changes are expandable. Restaurant navigation is collapsed while using hotel screens. Room setup includes guidance for types/rates, room numbers and staff assignments. Reception tabs support arrow keys, Home and End; mobile navigation wraps instead of hiding labels.

Branch setup uses the existing location and hotel APIs. If creating the location succeeds but enabling the hotel fails, the open form retains the saved location for retry; an unfinished location also remains available to enable later. The existing outlet/branch permission checks still apply. This phase does not add a consolidated multi-hotel owner dashboard or change hotel accounting rules.

## Database and operation

Apply `20261013170000_hotel_pms` before starting the updated API. Build `@pos/shared` and regenerate Prisma. Deploy API and web together because both recognise the new `CHARGED` order status. Older desktop/offline hub builds do not provide hotel operations.

The migration was applied only to the isolated `rizzoto_security` database during development. No shop database or deployed website was changed.

Hotel operations require the cloud connection. The restaurant's existing offline mode does not queue hotel reservations or room-charge transfers.

Desktop 0.1.2 was built with the current security fixes and signed using the local `Rizzoto Local Test` certificate. All three desktop integration tests passed against the actual installer and packaged application, including startup, encrypted data after restart and signature rejection checks. This is a test installer with automatic updates disabled; the self-signed certificate is not generally trusted on other PCs. PMS still needs the updated cloud API, database migration and web deployment.

## Verification

Completed checks: all 17 existing security scenarios and 12 PMS backend scenarios passed (the Node runner reports 30 passing tests including the PMS parent test). Workspace TypeScript checks, API build and web production build passed. A separate real Chrome run completed room setup → reservation → check-in → POS room transfer → combined payment → checkout. Desktop calendar and mobile housekeeping screenshots were visually inspected.

Hotel staff role follow-up: all 32 API integration tests passed, including default-role permissions through real staff logins and migration reruns against PostgreSQL. Missing roles were added without duplicates and an existing customised Receptionist role remained unchanged. Workspace TypeScript checks also passed.

UI simplification follow-up: all 33 integration checks passed with real Chrome, Nest and PostgreSQL. The browser workflow covers room setup, booking/check-in, actual POS room charging, payment/checkout, search, mobile overflow, creating an additional hotel branch, switching branches and keyboard tabs. A backend assertion verifies completed stays remain visible on their departure date. Updated desktop/mobile screenshots were visually inspected; workspace TypeScript checks and the web production build passed. These checks used isolated test records; no deployment or production-data change was performed.

The integration suite starts the actual Nest API and uses PostgreSQL. It creates real persisted test businesses, rooms, guests, reservations, payments and restaurant orders. No API, database or payment-service mocks are used; these are test records, not production customer data.

```powershell
$env:SECURITY_DATABASE_URL = 'postgresql://security_test:security_test_local@127.0.0.1:55439/rizzoto_security'
pnpm --filter api test:integration
```

For browser verification, set `PMS_UI_TEST=1` before the same command. It starts Next.js on a temporary port and uses a real session from the test API. On this Windows computer it uses Chrome; on other environments set `E2E_CHANNEL` to an installed browser channel. It exercises room setup, reservation, check-in, POS room transfer, combined payment and checkout, then captures calendar and mobile housekeeping screenshots under `apps/web/test-results/pms`.

## POS Hotel tab and sign-in recovery — 14 October 2026

POS now offers Restaurant and Hotel tabs. Owners can create hotel branches, add room types/rates and rooms, manage reception, housekeeping and reports, and open staff management within `/pos`. Switching tabs preserves the restaurant order pane and the selected hotel view. Hotel-only staff do not fetch the restaurant menu or subscribe to restaurant events; existing permission checks still apply.

Sign-in requests now have a one-minute network/body deadline, persistent error messages and recovery controls. Successful authentication clears the previous React Query cache before navigation. Account and POS loading failures expose retry controls instead of an indefinite spinner.

All 33 real API/PMS integration checks and all 36 desktop security regressions passed. The Chrome workflow covers a real browser network disconnect and reconnection, rejection of an incorrect random OTP followed by successful authentication, recovery from a previously unauthorized account query, room creation through the POS Hotel tab, restaurant room charging, settlement/checkout, branch creation without leaving `/pos`, and mobile layout checks. Records were persisted in isolated PostgreSQL; no production guest data or mocked API/database responses were used. The browser test origin uses `localhost` consistently with Next's development proxy. Desktop and mobile POS hotel screenshots were inspected.

Live backend and website health endpoints answered successfully, and the live email step reached OTP entry. Live sign-in after OTP remains pending owner verification; local passing tests alone do not establish the cause of the reported production stall.

## Dashboard navigation follow-up — 14 October 2026

Hotel remains under the existing `/dashboard/hotel` routes and uses the same sidebar as Orders, Reports and Menu. Opening Hotel no longer collapses the other dashboard sections into a separate restaurant workspace. The Hotel entry is visible to authorized users before a branch has been configured. The embedded POS Hotel flow is retained; no legacy route was deleted.

All 16 PMS/API/browser checks passed against isolated PostgreSQL and Chrome. The browser navigated from Orders through the Hotel sidebar link, checked `/dashboard/hotel` and the active link, refreshed the page, verified the other dashboard links remain visible, and navigated to Menu and back. Existing booking, payment, checkout, branch setup and mobile checks also passed. Web TypeScript and diff checks passed.

## Scope still to build before a full hotel launch

This version does not include room tax-invoice issuance, government guest reporting, identity-document storage, seasonal/occupancy/meal-plan pricing, unassigned room-type bookings, expiring holds, group/corporate accounts, booking-platform connections, direct website booking, guest messaging, housekeeping assignment, cross-outlet hotel charging, or offline hotel operations. Room-charge corrections currently use an authorised guest-account credit; transferred restaurant orders cannot be voided from the POS.

Complete hotel-specific accounting/tax workflows, backup/restore validation, production deployment and supervised hotel pilots before marketing this as a complete hotel PMS. Booking-platform connectivity remains a separate integration phase.
