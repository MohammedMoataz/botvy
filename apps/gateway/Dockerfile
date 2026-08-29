# Multi-stage build: the admin SPA is built in its own stage and copied in
# beside dist/, so the gateway serves it at /admin and the whole system
# keeps to one public surface (constitution V).
FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/gateway/package.json apps/gateway/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile

COPY apps/gateway ./apps/gateway
COPY apps/admin ./apps/admin

# The SPA is built with the API on the same origin, so it needs no base URL
# and no CORS allowance in production.
WORKDIR /repo/apps/admin
RUN VITE_API_BASE_URL="" pnpm exec vite build

WORKDIR /repo/apps/gateway
RUN pnpm exec prisma generate && pnpm exec nest build

# Flatten pnpm's symlinked store into a plain node_modules the runner can
# resolve. A raw COPY of the workspace's symlink farm leaves the prisma CLI
# as a dangling link, which breaks `migrate deploy` at container start.
# node-linker=hoisted produces a real, self-contained directory tree.
RUN pnpm --filter @botvy/gateway deploy --prod --config.node-linker=hoisted /deploy \
  && cp -r /repo/apps/gateway/dist /deploy/dist \
  && cp -r /repo/apps/gateway/prisma /deploy/prisma \
  && cp -r /repo/apps/gateway/prompts /deploy/prompts \
  && cp -r /repo/apps/admin/dist /deploy/admin

FROM node:24-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /deploy ./

EXPOSE 8080
# Migrations are applied at container start so a fresh deployment on any
# machine converges the schema without a separate manual step
# (constitution: transferability + forward-only migrations).
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
