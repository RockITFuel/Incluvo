FROM oven/bun:1.2.21 AS base

# Prune monorepo for this app
FROM base AS pruner
RUN bun install -g turbo@2.9.6
WORKDIR /app
COPY . .
RUN turbo prune @incluvo/web --docker

# Install dependencies and build
FROM base AS builder
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/bun.lock ./bun.lock
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
RUN bun install --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN bunx turbo run build --filter=@incluvo/web

# Production runtime — Bun serves the built TanStack Start SPA (see serve.ts)
FROM base AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/dist ./dist
COPY apps/web/serve.ts ./serve.ts
EXPOSE 3000
CMD ["bun", "serve.ts"]
