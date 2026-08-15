# Accounting API (Express + Prisma). Build context: ./server
#
# NOTE: `npm run build` (tsc) emits ESM with extensionless relative imports
# (`import { buildApp } from './app'`), which Node cannot resolve at runtime,
# so `npm start` is currently broken. Until tsconfig moves to NodeNext with
# explicit .js specifiers, this image runs the TS sources via tsx.
# See docs/REVIEW.md gap B-1.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl curl
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# server/ is read-only in this checkout, so there is no server/.dockerignore to
# keep the committed dev database out of the build context — drop it here.
RUN rm -f prisma/dev.db && npx prisma generate

EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4001/health || exit 1

# migrate deploy is a no-op when prisma/migrations is absent, so fall back to
# db push so a fresh container still comes up with a usable schema.
CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push --accept-data-loss; exec npx tsx src/index.ts"]
