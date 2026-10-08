# Build from the repo root:  docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN corepack enable
# slow or flaky registry connections shouldn't fail the build
ENV npm_config_fetch_retries=5 npm_config_fetch_timeout=120000
WORKDIR /app

FROM base AS build
# the API address is baked into the /api rewrite at build time
ARG API_URL=http://api:4000
ENV API_URL=$API_URL NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY window/package.json window/
# every workspace manifest, or pnpm treats the lockfile as stale and resolves from scratch.
# --trust-lockfile: it was already checked against supply-chain policy on the dev machine and in CI
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --trust-lockfile --filter web... --filter @pos/shared

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @pos/shared build && pnpm --filter web build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/web/server.js"]
