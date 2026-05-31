# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

RUN npm install typescript ts-node --save-dev && \
    npx tsc -p tsconfig.json

# ── Stage 2: Production ───────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Migrations are applied on boot automatically: NODE_ENV=production triggers
# shouldRunMigrations() → migrationsRun:true in TypeORM. To skip (e.g. for a
# read-only diagnostic boot) set RUN_MIGRATIONS=false at the container level.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
