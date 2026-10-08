# Build from the repo root:  docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
# slow or flaky registry connections shouldn't fail the build
ENV npm_config_fetch_retries=5 npm_config_fetch_timeout=120000
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# every workspace manifest, or pnpm treats the lockfile as stale and resolves from scratch.
# --trust-lockfile: it was already checked against supply-chain policy on the dev machine and in CI
COPY apps/web/package.json apps/web/
COPY window/package.json window/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --trust-lockfile --filter api... --filter @pos/shared

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @pos/shared build && pnpm --filter api build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# apply pending migrations, then start
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main"]
