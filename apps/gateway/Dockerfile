# Multi-stage build. The admin SPA (feature 004) will be built in its own
# stage and copied into this image's static dir — not yet, per YAGNI.
FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/gateway/package.json apps/gateway/
RUN pnpm install --frozen-lockfile

COPY apps/gateway ./apps/gateway
WORKDIR /repo/apps/gateway
RUN pnpm exec prisma generate && pnpm exec nest build

# Flatten pnpm's symlinked store into a plain node_modules the runner can
# resolve. A raw COPY of the workspace's symlink farm leaves the prisma CLI
# as a dangling link, which breaks `migrate deploy` at container start.
# node-linker=hoisted produces a real, self-contained directory tree.
RUN pnpm --filter @botvy/gateway deploy --prod --config.node-linker=hoisted /deploy \
  && cp -r /repo/apps/gateway/dist /deploy/dist \
  && cp -r /repo/apps/gateway/prisma /deploy/prisma \
  && cp -r /repo/apps/gateway/prompts /deploy/prompts

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
