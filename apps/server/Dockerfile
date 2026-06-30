FROM oven/bun:1.2.21 AS base

FROM base AS pruner
RUN bun install -g turbo@2.9.6
WORKDIR /app
COPY . .
RUN turbo prune @incluvo/server --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --ignore-scripts
COPY --from=pruner /app/out/full/ .
RUN bunx turbo run build --filter=@incluvo/server

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Playwright stores browsers here; pin it so root-installed Chromium is
# discoverable by the non-root runtime user.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/packages/drizzle/drizzle ./drizzle
# CLP-style startup: migrate the DB (pgvector ext + Drizzle migrations + audit
# trigger) before booting the server. Copied before the chown so it's owned by
# the unprivileged runtime user.
COPY apps/server/startup.ts ./startup.ts

# Coachplan PDF rendering needs Chromium + its system libs (see coachplan/pdf.ts).
# Install as root, then drop privileges. --with-deps pulls the apt dependencies.
RUN bunx playwright install --with-deps chromium

# Run as an unprivileged user. Give it ownership of the app + browser cache.
RUN groupadd --system --gid 1001 incluvo \
	&& useradd --system --uid 1001 --gid incluvo --home-dir /app incluvo \
	&& chown -R incluvo:incluvo /app /ms-playwright
USER incluvo

EXPOSE 3210
CMD ["bun", "startup.ts"]
