# syntax=docker/dockerfile:1
# Built from the repository root: docker build -f apps/frontend/Dockerfile .
FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/frontend ./apps/frontend
# The SDK is built too, not only the tokens. It resolves through its package
# `exports` to `dist/`, which does not exist in a fresh checkout — so a build
# that skipped it failed with "Can't resolve @botvy/sdk", which reads like a
# missing dependency rather than an unbuilt one.
RUN pnpm --filter @botvy/tokens build \
 && pnpm --filter @botvy/sdk build \
 && pnpm --filter @botvy/frontend build

FROM node:24-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/frontend/.next/standalone ./
COPY --from=build /repo/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /repo/apps/frontend/public ./apps/frontend/public

# Non-root, like the backend image. The standalone server writes nothing.
RUN addgroup -S botvy && adduser -S botvy -G botvy
USER botvy

EXPOSE 3000
# tini forwards signals, so a stop is a clean shutdown rather than a wait for
# the runtime to be killed.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/frontend/server.js"]
