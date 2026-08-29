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

FROM node:24-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/apps/gateway/node_modules ./node_modules
COPY --from=builder /repo/apps/gateway/dist ./dist
COPY --from=builder /repo/apps/gateway/prisma ./prisma
COPY --from=builder /repo/apps/gateway/prompts ./prompts
COPY --from=builder /repo/apps/gateway/package.json ./package.json

EXPOSE 8080
# Migrations are applied at container start so a fresh deployment on any
# machine converges the schema without a separate manual step
# (constitution: transferability + forward-only migrations).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
