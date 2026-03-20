FROM node:22-slim AS base
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter agentsy-worker...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/worker/node_modules apps/worker/node_modules
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules packages/db/node_modules
COPY . .
RUN pnpm --filter @agentsy/shared build && \
    pnpm --filter @agentsy/db build && \
    pnpm --filter agentsy-worker build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/worker/dist dist
COPY --from=builder /app/node_modules node_modules
CMD ["node", "dist/index.js"]
