FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HUSKY=0
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS builder
RUN apt-get update && apt-get install -y \
    ca-certificates \
    openssl \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY . .
RUN pnpm install --frozen-lockfile

FROM builder AS web-runner
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NODE_ENV=production
ENV PORT=3000
RUN pnpm --filter web build
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]

FROM builder AS dashboard-runner
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NODE_ENV=production
ENV PORT=3002
RUN pnpm --filter dashboard build
EXPOSE 3002
CMD ["pnpm", "--filter", "dashboard", "start"]

FROM builder AS api-runner
ENV NODE_ENV=production
ENV PORT=3001
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api build
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/src/index.js"]
