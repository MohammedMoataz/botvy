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
# No `--legacy`: that flag belongs to pnpm 10, and this repository pins 9.15.
#
# The prompt templates live in `ai/prompts`, outside this package, so **this cp
# is the only reason the image has them.** `pnpm deploy` copies the package
# tree; it has no idea the templates exist. They are the intent extractor's
# grammar and the prompt assembler's input, so an image without them throws on
# the first chat turn while every local test passes.
#
# Copied **contents-into-directory** (`prompts/.`) so the result is
# `/out/prompts/*.md` and not a nested `/out/prompts/prompts/`. The loader walks
# up from `/app/dist/shared/templates` and finds `/app/prompts` at the third hop.
RUN pnpm --filter @botvy/backend deploy --prod /out \
 && cp -r apps/backend/dist /out/dist \
 && mkdir -p /out/prompts \
 && cp -r ai/prompts/. /out/prompts/ \
 && cp -r apps/backend/migrations /out/migrations \
 && cp apps/backend/migrate-mongo-config.cjs /out/ \
 && cp -r apps/backend/src/contexts/identity/infrastructure/prisma /out/prisma

# Generated *again*, inside /out, and this is not belt-and-braces.
#
# `prisma generate` writes its client into the `@prisma/client` package in the
# pnpm store, and `pnpm deploy` builds /out a fresh pruned `node_modules` that
# does not carry it - so the runtime image shipped the stub whose only job is to
# throw `@prisma/client did not initialize yet`. The application could not
# construct `PrismaService`, so it could not start, in either role.
#
# It was invisible for two phases because nothing had ever booted this image:
# unit tests never build one, and the gate that would have caught it was the
# thing waiting on a working image. The first boot found it in eight seconds.
RUN cd /out && node_modules/.bin/prisma generate --schema prisma/schema.prisma

# ---------------------------------------------------------------- runtime
FROM node:24-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

ENV NODE_ENV=production
ENV BOTVY_ROLE=backend

COPY --from=build /out ./

# Non-root, and /app is deliberately *not* chowned: `chown -R` over it rewrote
# every file into a second layer, roughly doubling the image and costing minutes
# on every build. The application only reads its own code, and root-owned
# world-readable files are what it needs for that - not being able to modify its
# own dist is a small bonus rather than a cost. The media volume is the only
# thing it writes.
RUN addgroup -S botvy && adduser -S botvy -G botvy \
 && mkdir -p /data/media && chown botvy:botvy /data/media
USER botvy

EXPOSE 8080 8081

# tini reaps zombies and forwards signals, so a stop is a clean shutdown rather
# than a ten-second wait for the runtime to be killed.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
