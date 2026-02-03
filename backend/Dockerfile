# Use Bun as base image
FROM oven/bun:1-slim AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Production image
FROM base AS runner

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Run migrations and start server
CMD bun run src/db/migrate.ts && bun run src/index.ts
