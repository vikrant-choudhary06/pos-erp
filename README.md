# Rizzoto

Multi-tenant POS for restaurants, cafes and cloud kitchens: billing, KOTs, kitchen display,
menu, tables, stock, purchases, staff and reports.

An opt-in hotel module now adds rooms, reservations, check-in/out, guest accounts,
restaurant room charging, housekeeping and daily closing. Open Settings → Hotel module
to enable it for an outlet after applying the PMS migration. See
[PMS-IMPLEMENTATION.md](PMS-IMPLEMENTATION.md) for setup, permissions, tests and current scope.

```
apps/api        NestJS + Prisma (Postgres)
apps/web        Next.js: landing page, dashboard, POS, kitchen display
packages/shared bill maths, permissions, dates and the order engine, shared by all of them
window/         Windows app for the counter PC (Electron) with the shop's local hub
deploy/         Caddyfile for the production stack
```

## Running locally

Needs Node 22+, pnpm and Docker (or any Postgres).

```bash
pnpm install
pnpm db:up            # postgres on localhost:5434
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate
pnpm dev              # api on :4000, web on :3000
```

To use your own Postgres (local, Supabase, Neon), change `DATABASE_URL` in `apps/api/.env`
and run `pnpm db:migrate` again.

### Login codes in development

- `RESEND_API_KEY` empty: no email is sent, the code is printed in the API log.
- `DEV_LOGIN_CODE="111111"`: every code is `111111`. Handy for testing, refused in production.

## Checks

```bash
pnpm typecheck        # api + web
pnpm test             # bill/date tests, staff authorization and hub security regressions
pnpm e2e              # browser test: sign up -> menu -> POS order -> kitchen -> reports
```

`pnpm e2e` needs `pnpm dev` running with `DEV_LOGIN_CODE` set. The first run is slow because
the dev server compiles each page on first visit. CI (`.github/workflows/ci.yml`) runs all
three on every push against production builds.

## Rizzoto for Windows (counter PC)

`window/` builds the installer `Rizzoto-Setup-<version>.exe`. Install it on the PC at the billing counter. On first
start it asks for the web address of the account, then opens the POS full screen. It also runs
a small server (the hub) on port 7400 that the shop's tablets and the kitchen screen use
instead of the website. By default it accepts connections only from the counter PC.
For tablets, configure the HTTPS certificate and private key paths in desktop Settings;
settings then show an address such as `https://192.168.1.20:7400/pos`.

```bash
pnpm desktop          # run it from source against the cloud you enter
pnpm desktop:exe      # installer in window/release/
pnpm --filter window test   # tablets + kitchen through the hub with the internet cut
```

While the internet works, the hub just passes everything through to the cloud. When it
drops, the hub answers the POS and kitchen screens itself from its copy of the menu, open
orders and sessions, numbers new orders and bills as till D1 (register the counter under
Settings → POS devices once), and queues every change. When the connection is back the queue
is replayed in order and the cloud's copy takes over again. Bills and KOTs print silently to
the printers picked in the app's settings (Ctrl + , or the tray icon). Closing the window
keeps the hub running in the tray. Without a screen, `node window/dist/hub-cli.js --cloud
https://your-domain` runs only the hub (requires the encryption key below).

### Offline security and hub setup

- The cloud grants at most 12 hours of offline access, capped by the session's own expiry.
  Offline reads do not renew it. Sign-out blocks local access immediately and requires a
  fresh online sign-in. Remote account changes take effect when reconnected or when this
  allowance expires; a disconnected counter cannot learn about them instantly.
  Browser sign-out is also retried on reconnection, before a fresh login, to clear the old
  server cookie.
- Hub sign-out clears the cookie and cached identity, retains unsynced orders, and queues
  cloud session revocation after the pending changes have been replayed. Browser outbox
  entries replay only under their original user and business. Work saved before this
  identity tracking update is retained as "not synced" for manual review.
- Offline cached responses are session-scoped, and order, kitchen and event access checks
  the user's outlet assignments. Invalid quantities, payments, modifiers and metadata are
  rejected before saving or allocating bill numbers. Requests are limited to 200 KiB,
  with a 10-second body deadline and bounded concurrent connections.
- LAN access requires TLS. Supply a certificate trusted by Windows and every tablet,
  with SANs covering `localhost` and the counter's stable LAN IP. Set its PEM certificate
  and private key paths in Settings. Certificate verification remains enabled. Without
  a certificate the hub listens only on `127.0.0.1`; remote cloud URLs must use HTTPS.
  Test certificates in `window/test/fixtures` are public fixtures, never deployment keys.
- On Windows, Electron encrypts the entire hub store using OS-backed `safeStorage`.
  Existing plaintext `hub.json` files migrate on startup, preserving queues and counters.
  A decryption failure stops startup rather than resetting business data. Back up the
  store together with the means to decrypt it; it is tied to the operating-system user.
- A headless hub requires `RIZZOTO_HUB_KEY`: a persistent, randomly generated 32-byte key
  encoded as base64, supplied from an external secret store. Generate it once, retain it
  securely, and reuse it on every startup; do not save it beside the data or in Git.
  Storage uses authenticated AES-256-GCM. Add `--tls-cert <cert.pem> --tls-key <key.pem>`
  to enable HTTPS for tablets; without those options it remains local to the counter.

Deploy the API and web changes together so `/auth/me` supplies the offline expiry.
Existing cached identities without an expiry require a fresh online sign-in.

### Updates

Installed apps update themselves. They check every few hours, download a new version in the
background and install it the next time Rizzoto starts (or straight away from "Restart to
update" in the tray or settings). Nothing restarts on its own during service.

To ship one, bump `version` in `window/package.json` and push to `main`. CI builds the
installer and publishes it as a release on the public `rizzoto-releases` repo, which the apps
read from (the code repo stays private). Pushes that don't change the version publish nothing.

One-time setup in GitHub, on this repo (Settings → Secrets and variables → Actions):

- variable `RIZZOTO_UPDATE_REPO`: `owner/rizzoto-releases`
- variable `RIZZOTO_UPDATE_PUBLISHER`: the exact publisher from the Windows code signing certificate
- secret `WINDOWS_CSC_LINK`: the signing certificate supported by electron-builder (`CSC_LINK`)
- secret `WINDOWS_CSC_KEY_PASSWORD`: its password (`CSC_KEY_PASSWORD`)
- secret `RELEASES_TOKEN`: a fine-grained token with Contents read and write on that repo only

Apps built without `RIZZOTO_UPDATE_REPO` (local builds) never check for updates.
Installer builds require code signing. Missing credentials fail the build rather than
producing an unsigned installer. Update-enabled builds pin the certificate publisher,
verify downloaded installers, and use the HTTPS GitHub release feed. The desktop CI job
runs on pushes to `main` when an update repository is configured.

### Security integration tests

Use a separate local PostgreSQL database named `rizzoto_security`, apply migrations with
`DATABASE_URL` pointing to it, then set `SECURITY_DATABASE_URL` to that same URL and run
`pnpm --filter api test:integration`. The suite starts the real API and creates businesses,
staff, devices, menu items, bills, payments and customer credit through HTTP. It tests
concurrent requests and queries the actual database; no mocked services or storage are
used. Test records remain in that disposable database for inspection.
On Windows, `pnpm --filter window test:integration` also runs the real Electron updater
against unsigned executables and an actual Microsoft-signed Windows executable. It checks
rejection of unsigned files and other publishers, and acceptance of a matching publisher.
The suite also validates the installer YAML against the installed electron-builder schema.
To test an existing signed installer as well, set `RIZZOTO_TEST_SIGNED_INSTALLER` to its
absolute path and `RIZZOTO_TEST_SIGNED_PUBLISHER` to its exact certificate publisher
before running the Windows integration tests. Its certificate must be trusted locally.
Set `RIZZOTO_TEST_PACKAGED_EXE` to the absolute path of the signed 0.1.1 application
to also test packaged startup, isolated settings and Windows encryption after restart.
This uses a temporary profile and does not change the installed app's data.

For a local test build with a code signing certificate already in `Cert:\CurrentUser\My`,
run these commands in `window` (keep self-signed test certificates out of release CI):

```powershell
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Where-Object Subject -eq 'CN=Rizzoto Local Test' |
  Sort-Object NotAfter -Descending | Select-Object -First 1
if (!$cert -or !$cert.HasPrivateKey) { throw 'Test signing certificate with private key not found' }
$env:RIZZOTO_UPDATE_PUBLISHER = 'Rizzoto Local Test'
$env:RIZZOTO_UPDATE_REPO = ''
Remove-Item Env:\CSC_LINK,Env:\CSC_KEY_PASSWORD,Env:\WIN_CSC_LINK,Env:\WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
node build.mjs
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
pnpm exec electron-builder --win --publish never "--config.win.signtoolOptions.certificateSha1=$($cert.Thumbprint)"
```

Password and PIN failures lock the account after five attempts for five minutes. The
counters are stored in PostgreSQL and survive API restarts. Changing that credential
clears its lockout. Apply the new migration before starting the updated API.

## Deploying

One server with Docker. Point your domain at it, then:

```bash
cp .env.production.example .env.production   # fill it in
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Caddy gets an HTTPS certificate on its own. Migrations run when the API container starts.
Only ports 80 and 443 are exposed. To use Supabase or Neon, set `DATABASE_URL` and remove
the `postgres` service.

Back up the database daily, for example:

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U pos pos | gzip > backup-$(date +%F).sql.gz
```

### Website on Cloudflare

The web app can also run on Cloudflare Workers (through the OpenNext adapter) while the API
and Postgres stay on a server. Every page is static, so the Worker mostly serves files and
forwards `/api/*` to the API.

1. Host the API somewhere with Postgres (the Docker setup above without the `web` service, or
   any Node host). Set its `WEB_URL` to the site's address, e.g. `https://rizzoto.in`, or the
   API will refuse writes from the site.
2. In GitHub → Settings → Secrets and variables → Actions add the secrets
   `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers") and `CLOUDFLARE_ACCOUNT_ID`,
   and the variable `API_URL` (the API's public address). `API_URL` is baked in at build time.
3. Push to `main`. `.github/workflows/deploy-web.yml` builds and deploys the `rizzoto-web`
   Worker. Then add your domain under the Worker's Settings → Domains & Routes.

By hand, from Linux, macOS or WSL (the build needs symlinks, which Windows blocks):

```bash
npx wrangler login
API_URL=https://api.rizzoto.in pnpm --filter web cf:build
pnpm --filter web cf:deploy
```

`pnpm --filter web cf:preview` runs the built Worker locally on port 8787.

## How things fit together

- **Sign in.** Owners use email + a 6 digit code. A new email goes through onboarding, which
  creates the business, first outlet, default roles and GST 5% / 18% tax groups. Staff use
  business code + employee ID + password, or a PIN on a shared till (Settings → POS devices).
- **Sessions** are random tokens stored hashed, sent as an httpOnly cookie. The web app proxies
  `/api/*` to the API so the cookie stays first-party. Writes from other origins are rejected.
- **Permissions** live in `packages/shared/src/permissions.ts`. The API checks them with
  `@Can()`, and staff only see the outlets they're assigned to.
- **Orders.** Items are saved with a snapshot of their name, price and tax, so later menu
  changes never alter old bills. Totals come from `calculateBill` in `packages/shared`, the
  same code the POS uses for its preview. Invoice numbers are gap-free per outlet and financial
  year (`IND01/26-27/00001`). A printed bill can be reopened by a manager, which cancels that
  invoice and keeps it on record.
- **Stock.** Every change is a row in `StockMovement`. Dishes with a recipe deduct ingredients
  when the order is paid, and voids put them back.
- **Live screens.** Tills and the kitchen display listen to server-sent events
  (`/api/events`). This is in-memory, so it works for one API instance. Running several needs
  Redis pub/sub in `EventsService`.
- **Offline billing.** A browser set up as a till (Settings → POS devices) keeps working
  without internet. Orders, KOTs, bills and payments are saved in the browser (IndexedDB,
  `apps/web/src/offline`) and every change is queued. When the connection returns the queue is
  replayed in order through the normal API. Offline orders and bills carry the till's code
  (`D1-12`, `IND01/26-27/D1-00004`) so they never clash with server numbers. Anything the
  server refuses shows up as "not synced" on the till. Needs a connection: opening a shift,
  reopening a bill, voiding after the KOT, credit sales, PIN switching. For several tablets
  sharing orders offline, use the counter PC app above; the same order engine
  (`packages/shared/src/order-engine.ts`) runs there.
- **Audit.** Voids, discounts, item cancels, price changes, cash in/out and shift closes are
  written to `AuditLog`. Owners see them under Activity.

## Not built yet

Several tills sharing orders while offline (needs a local hub), SaaS subscriptions and payments, a platform admin panel, loyalty points,
QR ordering, Zomato/Swiggy, and attendance/payroll.
