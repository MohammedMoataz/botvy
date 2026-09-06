# One image, two roles. BOTVY_ROLE picks which at start, so the backend and the
# worker can never drift out of step: they are the same build, and a change to
# shared code reaches both or neither.

# ---------------------------------------------------------------- deps
FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /repo

# Only the manifests, so a change to source code does not invalidate the
# dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/tokens/package.json packages/tokens/

# --ignore-scripts: postinstall runs prisma generate, and the schema is not in
# this layer yet. It runs explicitly in the build stage, where it is.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------- build
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo/node_modules node_modules
COPY --from=deps /repo/apps/backend/node_modules apps/backend/node_modules
COPY . .
RUN pnpm --filter @botvy/backend exec prisma generate \
      --schema src/contexts/identity/infrastructure/prisma/schema.prisma \
 && pnpm --filter @botvy/backend exec nest build

# `pnpm deploy` flattens the workspace into a self-contained tree, which is what
# makes the runtime stage independent of the monorepo layout.
RUN pnpm --filter @botvy/backend deploy --prod --legacy /out \
 && cp -r apps/backend/dist /out/dist \
 && cp -r apps/backend/migrations /out/migrations \
 && cp -r apps/backend/src/contexts/identity/infrastructure/prisma /out/prisma

# ---------------------------------------------------------------- runtime
FROM node:24-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

ENV NODE_ENV=production
ENV BOTVY_ROLE=backend

COPY --from=build /out ./

# Non-root. The media volume is the only thing it writes.
RUN addgroup -S botvy && adduser -S botvy -G botvy \
 && mkdir -p /data/media && chown -R botvy:botvy /data/media /app
USER botvy

EXPOSE 8080 8081

# tini reaps zombies and forwards signals, so a stop is a clean shutdown rather
# than a ten-second wait for the runtime to be killed.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
