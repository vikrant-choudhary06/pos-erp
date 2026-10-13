# Security fixes 9–16: verification

Date: 13 October 2026

## Completed checks

- **17 API integration tests passed** against PostgreSQL 17 and the actual Nest API over HTTP. No services, authentication providers or database calls were mocked. The API generated random login codes; fixed development codes were disabled.
- Test businesses, staff, outlets, devices, customers, menu items, recipes, opening stock, orders, invoices and payments were created through normal application endpoints. These are persisted test records in an isolated database, not production customer records.
- **1 Windows integration test passed** using the actual Electron runtime, installed NSIS updater and Windows Authenticode verification. An unsigned executable was rejected, a Microsoft-signed executable was rejected for a different configured publisher, and the Microsoft-signed executable was accepted for the matching publisher.
- The installer configuration also passes the installed electron-builder 26.15.3 schema. Its publisher setting belongs under `win.signtoolOptions.publisherName`.
- Built `window/release/Rizzoto-Setup-0.1.1.exe` with the user's real self-signed `Rizzoto Local Test` certificate from the CurrentUser certificate store, with publishing disabled. Windows reports `Valid` for both the installer and packaged application on this computer. The actual Electron updater rejects this installer for another publisher and accepts it for `Rizzoto Local Test`.
- Follow-up certificate testing: **all 3 desktop integration tests and all 17 API integration tests passed**. The signed packaged application starts with an isolated profile, renders settings, reports version 0.1.1, uses context isolation with Node integration disabled, and decrypts Windows-encrypted data after a full process restart. The updater rejects a copy of the actual signed installer with its signed DOS stub modified. Existing running Rizzoto processes and business data were left untouched.
- The initial follow-up API attempt timed out during startup while desktop checks were also running. The startup allowance was increased to 90 seconds (setup hook: 120 seconds); the rerun completed all 17 checks in approximately 26 seconds.
- API build, desktop build, API/web/desktop TypeScript checks and `git diff --check` passed.
- All five database migrations, including the new password-lockout migration, applied successfully to the isolated database.

## Outcomes

| Issue | Verified behavior |
| --- | --- |
| 9 | Two competing ₹80 payments on a ₹100 bill produce one accepted payment. Retries save one payment, issue one invoice, count one customer visit and deduct ingredients once. Cash change remains correct. Payment IDs cannot be reused on another order. Competing debt settlements leave a nonnegative balance and one settlement audit entry. Payment/reopen/void races keep invoices, refunds, stock and customer credit consistent in the tested full-payment scenarios. |
| 10 | Ten concurrent wrong PIN requests from different IPs record five failures and lock the account. Correct PINs are refused during the lock. Expired locks clear on successful login; password login remains independent. |
| 11 | Assigned staff can update their own outlet. Updates to an unassigned outlet return 403 without changing it. Another business cannot update the outlet. |
| 12 | Assigned staff receive only customer orders from their allowed outlets. Owners retain access to their business's full customer history. Another business receives 404. |
| 13 | Eight concurrent correct OTP verifications create one session. Ten wrong requests record at most five attempts; the exhausted OTP cannot then be used correctly. |
| 14 | Authorized events arrive. Existing streams close after logout, outlet reassignment, expiry, user deactivation, outlet closure or device revocation. The five-connection limit applies across sessions for the same user, and disconnecting releases the slot. |
| 15 | Real Windows signature rejection and acceptance paths pass. Release builds require signing and a pinned publisher; custom HTTP update feeds are rejected. Missing or mismatched signature configuration keeps manual and automatic update checks disabled. |
| 16 | Concurrent password guesses across IPs persist five failures. Correct passwords are refused while locked, including after restarting the API. Expiry and password replacement restore login. |

## Deployment requirements and limits

Apply `20261013090000_password_lockout` before starting the updated API. Configure `RIZZOTO_UPDATE_PUBLISHER`, `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD` as documented in README before building signed releases. A locally trusted self-signed test installer was built and verified; no production signing certificate was available. Installation, automatic download and the complete upgrade cycle remain unverified. Missing signing credentials fail the installer build.

The suite runs locally and CI integration steps have been added; GitHub Actions itself was not executed here. This verification is not a production penetration test or a complete dependency audit.

The local test container is `rizzoto-security-postgres`, with database `rizzoto_security` on loopback port 55439. It is stopped after testing and retained for inspection. Existing business databases were not modified.

Re-run the API checks with `SECURITY_DATABASE_URL` pointing to that isolated database and `pnpm --filter api test:integration`. On Windows, run `pnpm --filter window test:integration` for the signature checks.
