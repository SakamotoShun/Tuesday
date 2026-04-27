# =============================================================================
# Tuesday - Production Docker Image
# Multi-stage build: frontend build -> compiled backend -> all-in-one container
# =============================================================================

# Stage 1: Build frontend
FROM oven/bun:1.3.9-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ .
RUN bun run build

# Stage 2: Build compiled backend binary
FROM oven/bun:1.3.9-slim AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile
COPY backend/ ./
RUN bun run build

# Stage 3: Production image with PostgreSQL + supervisord
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive

# Install PostgreSQL 16, supervisord, and required utilities
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl openssl ca-certificates gnupg2 lsb-release supervisor && \
    install -d /etc/apt/keyrings && \
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg && \
    chmod a+r /etc/apt/keyrings/postgresql.gpg && \
    apt-get update && \
    apt-get install -y --no-install-recommends postgresql-16 && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin tuesday

# Create app directory structure
WORKDIR /app

# Copy compiled backend binary and runtime assets
COPY --from=backend-builder /app/backend/tuesday /app/tuesday
COPY --from=backend-builder /app/backend/src/db/migrations /app/migrations

# Copy frontend production build
COPY --from=frontend-builder /app/frontend/dist /app/static

# Copy process management configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh

# Set permissions and create required directories
RUN chmod +x /app/entrypoint.sh && \
    chmod +x /app/tuesday && \
    mkdir -p /app/data /var/log/supervisor /app/static /app/migrations && \
    chown -R tuesday:tuesday /app/static /app/migrations /app/tuesday

EXPOSE 8080
VOLUME /app/data

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
