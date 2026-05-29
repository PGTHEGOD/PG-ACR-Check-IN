# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=20
ARG APP_VARIANT=MYSQL-VERSION

# Pin pnpm explicitly: corepack's default (pnpm 11.x) requires a newer Node than
# the v20 base image and crashes with ERR_UNKNOWN_BUILTIN_MODULE. 9.15.4 reads
# lockfileVersion 9.0 and is fully compatible with Node 20.
ARG PNPM_VERSION=9.15.4
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate
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
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app/${APP_VARIANT}
COPY --from=builder /app/${APP_VARIANT}/public ./public
COPY --from=builder /app/${APP_VARIANT}/.next ./.next
COPY --from=builder /app/${APP_VARIANT}/package.json ./package.json
COPY --from=deps /app/${APP_VARIANT}/node_modules ./node_modules
EXPOSE 3000
CMD ["pnpm", "start"]
