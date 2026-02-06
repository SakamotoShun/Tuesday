# =============================================================================
# Tuesday - Production Docker Image
# Multi-stage build: frontend build -> backend deps -> all-in-one container
# =============================================================================

# Stage 1: Build frontend
FROM oven/bun:1 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ .
RUN bun run build

# Stage 2: Install backend production dependencies
FROM oven/bun:1 AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 3: Production image with PostgreSQL + supervisord
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Install PostgreSQL 16, supervisord, and required utilities
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        wget gnupg2 lsb-release curl openssl ca-certificates unzip && \
    echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    apt-get update && \
    apt-get install -y --no-install-recommends postgresql-16 supervisor && \
    rm -rf /var/lib/apt/lists/*

# Install Bun runtime
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Create app directory structure
WORKDIR /app

# Copy backend source and production dependencies
COPY backend/src /app/backend/src
COPY backend/package.json backend/tsconfig.json /app/backend/
COPY --from=backend-deps /app/backend/node_modules /app/backend/node_modules

# Copy frontend production build
COPY --from=frontend-builder /app/frontend/dist /app/static

# Copy process management configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh

# Set permissions and create required directories
RUN chmod +x /app/entrypoint.sh && \
    mkdir -p /app/data /var/log/supervisor

EXPOSE 8080
VOLUME /app/data

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
