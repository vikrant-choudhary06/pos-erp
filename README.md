# Rizzoto

Multi-tenant POS for restaurants, cafes and cloud kitchens: billing, KOTs, kitchen display,
menu, tables, stock, purchases, staff and reports.

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
pnpm test             # bill maths and date unit tests
pnpm e2e              # browser test: sign up -> menu -> POS order -> kitchen -> reports
```

`pnpm e2e` needs `pnpm dev` running with `DEV_LOGIN_CODE` set. The first run is slow because
the dev server compiles each page on first visit. CI (`.github/workflows/ci.yml`) runs all
three on every push against production builds.

## Rizzoto for Windows (counter PC)

`window/` builds the installer `Rizzoto-Setup-<version>.exe`. Install it on the PC at the billing counter. On first
start it asks for the web address of the account, then opens the POS full screen. It also runs
a small server (the hub) on port 7400 that the shop's tablets and the kitchen screen use
instead of the website: settings show the address to open, e.g. `http://192.168.1.20:7400/pos`.

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
https://your-domain` runs only the hub.

### Updates

Installed apps update themselves. They check every few hours, download a new version in the
background and install it the next time Rizzoto starts (or straight away from "Restart to
update" in the tray or settings). Nothing restarts on its own during service.

To ship one, bump `version` in `window/package.json` and push to `main`. CI builds the
installer and publishes it as a release on the public `rizzoto-releases` repo, which the apps
read from (the code repo stays private). Pushes that don't change the version publish nothing.

One-time setup in GitHub, on this repo (Settings → Secrets and variables → Actions):

- variable `RIZZOTO_UPDATE_REPO`: `owner/rizzoto-releases`
- secret `RELEASES_TOKEN`: a fine-grained token with Contents read and write on that repo only

Apps built without `RIZZOTO_UPDATE_REPO` (local builds) never check for updates.

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
