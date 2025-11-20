# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=20
ARG APP_VARIANT=MYSQL-VERSION

FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache libc6-compat bash mariadb mariadb-client mariadb-server-utils dumb-init \
  && corepack enable
WORKDIR /app

FROM base AS deps
ARG APP_VARIANT
WORKDIR /app/${APP_VARIANT}
COPY ${APP_VARIANT}/package.json ./package.json
COPY ${APP_VARIANT}/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

FROM base AS builder
ARG APP_VARIANT
WORKDIR /app/${APP_VARIANT}
COPY --from=deps /app/${APP_VARIANT}/node_modules ./node_modules
COPY ${APP_VARIANT}/ .
RUN pnpm run build

FROM base AS runner
ARG APP_VARIANT
ENV APP_VARIANT=${APP_VARIANT}
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app/${APP_VARIANT}
COPY --from=builder /app/${APP_VARIANT}/public ./public
COPY --from=builder /app/${APP_VARIANT}/.next ./.next
COPY --from=builder /app/${APP_VARIANT}/package.json ./package.json
COPY --from=deps /app/${APP_VARIANT}/node_modules ./node_modules
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
