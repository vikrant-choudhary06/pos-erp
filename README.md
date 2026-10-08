# Counter

Multi-tenant POS for restaurants, cafes and cloud kitchens: billing, KOTs, kitchen display,
menu, tables, stock, purchases, staff and reports.

```
apps/api        NestJS + Prisma (Postgres)
apps/web        Next.js: landing page, dashboard, POS, kitchen display
packages/shared bill maths, permissions, dates, constants shared by both
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
- **Audit.** Voids, discounts, item cancels, price changes, cash in/out and shift closes are
  written to `AuditLog`. Owners see them under Activity.

## Not built yet

Offline billing, SaaS subscriptions and payments, a platform admin panel, loyalty points,
QR ordering, Zomato/Swiggy, and attendance/payroll.
