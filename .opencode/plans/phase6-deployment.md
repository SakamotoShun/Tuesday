# Phase 6: Deployment Implementation Plan

## Summary

Transform Tuesday from a dev setup into a production-deployable single Docker container with embedded PostgreSQL, static file serving, backup/restore scripts, and comprehensive documentation.

**Approach chosen:** Bun runtime + source (not compiled binary) for reliability with migrations and WebSocket support.

---

## Task 1: Frontend Production Build (6.1)

### Files to modify:
- `frontend/vite.config.ts` - Add production build optimizations
- `frontend/src/App.tsx` - Add lazy loading for heavy components

### Files to create:
- `frontend/.env.production`
- `frontend/.env.example`

### Changes:

**`frontend/vite.config.ts`** - Add `build` section with:
```ts
build: {
  sourcemap: false,
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ["react", "react-dom", "react-router-dom"],
        query: ["@tanstack/react-query"],
        excalidraw: ["@excalidraw/excalidraw"],
        blocknote: ["@blocknote/core", "@blocknote/react", "@blocknote/shadcn"],
        calendar: ["@fullcalendar/core", "@fullcalendar/daygrid", "@fullcalendar/timegrid", "@fullcalendar/interaction", "@fullcalendar/react"],
        editor: ["yjs", "y-protocols"],
        dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
      },
    },
  },
},
```

**`frontend/src/App.tsx`** - Lazy load heavy pages:
```tsx
const WhiteboardEditorPage = lazy(() => import("@/pages/whiteboard-editor").then(m => ({ default: m.WhiteboardEditorPage })))
const DocPage = lazy(() => import("@/pages/doc-page").then(m => ({ default: m.DocPage })))
const MyCalendarPage = lazy(() => import("@/pages/my-calendar").then(m => ({ default: m.MyCalendarPage })))
const ChatPage = lazy(() => import("@/pages/chat").then(m => ({ default: m.ChatPage })))
```
- Wrap lazy routes with `<Suspense fallback={<LoadingSpinner />}>`
- Remove direct imports for those 4 pages

**`frontend/.env.production`**:
```
VITE_API_URL=
```

**`frontend/.env.example`**:
```
# API base URL - leave empty for same-origin (production Docker)
# Set to http://localhost:8080 for separate backend development
VITE_API_URL=
```

---

## Task 2: Backend Static File Serving (6.2)

### Files to create:
- `backend/src/middleware/static.ts`

### Files to modify:
- `backend/src/middleware/index.ts` - Export new middleware
- `backend/src/index.ts` - Mount static middleware, update 404 handler
- `backend/src/config.ts` - Add `staticDir` config option

### Changes:

**`backend/src/config.ts`** - Add to schema and loadConfig:
```ts
staticDir: z.string().optional() // empty/undefined = disabled
```
Add env var: `STATIC_DIR` (default: empty string for dev, `/app/static` for Docker)

**`backend/src/middleware/static.ts`**:
```ts
import { Context, Next } from 'hono';
import { config } from '../config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function serveStatic(c: Context, next: Next) {
  // Skip if static serving is disabled
  if (!config.staticDir) {
    await next();
    return;
  }

  const path = c.req.path;
  
  // Skip API routes and health check
  if (path.startsWith('/api/') || path === '/health') {
    await next();
    return;
  }

  // Try to serve the requested file
  const filePath = join(config.staticDir, path);
  if (path !== '/' && existsSync(filePath)) {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      // Long cache for hashed assets
      if (path.startsWith('/assets/')) {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
      return new Response(file);
    }
  }

  // SPA fallback - serve index.html
  const indexPath = join(config.staticDir, 'index.html');
  const indexFile = Bun.file(indexPath);
  if (await indexFile.exists()) {
    c.header('Cache-Control', 'no-cache');
    return new Response(indexFile, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  await next();
}
```

**`backend/src/index.ts`** - Add static middleware after API routes:
```ts
import { serveStatic } from './middleware/static';

// After routes mount:
app.use('*', serveStatic);

// Update 404 handler to only return JSON for /api/* paths
app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
  }
  // For non-API routes, static middleware should have handled it
  return c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
});
```

**`backend/src/middleware/index.ts`** - Add export:
```ts
export { serveStatic } from './static';
```

---

## Task 3: Process Management (6.4)

### Files to create:
- `supervisord.conf`
- `entrypoint.sh`

**`supervisord.conf`**:
```ini
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:postgresql]
command=/usr/lib/postgresql/16/bin/postgres -D /app/data/postgres
user=postgres
autostart=true
autorestart=true
priority=10
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:tuesday]
command=/usr/local/bin/bun run /app/backend/src/index.ts
directory=/app/backend
autostart=true
autorestart=true
priority=20
startsecs=5
startretries=3
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",STATIC_DIR="/app/static"
```

**`entrypoint.sh`**:
```bash
#!/bin/bash
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
PG_DATA="$DATA_DIR/postgres"

# Initialize PostgreSQL if needed
if [ ! -d "$PG_DATA" ]; then
    echo "Initializing PostgreSQL..."
    mkdir -p "$PG_DATA"
    chown postgres:postgres "$PG_DATA"
    su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PG_DATA"

    # Configure PostgreSQL for local connections
    echo "host all all 127.0.0.1/32 trust" >> "$PG_DATA/pg_hba.conf"
    echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA/postgresql.conf"

    # Start PostgreSQL temporarily to create database
    su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w start"
    su postgres -c "createuser tuesday"
    su postgres -c "createdb -O tuesday tuesday"
    su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w stop"
fi

# Ensure correct ownership
chown -R postgres:postgres "$PG_DATA"

# Generate session secret if not exists
SECRET_FILE="$DATA_DIR/.session_secret"
if [ ! -f "$SECRET_FILE" ]; then
    echo "Generating session secret..."
    openssl rand -base64 32 > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
fi

export SESSION_SECRET=$(cat "$SECRET_FILE")
export DATABASE_URL="${DATABASE_URL:-postgresql://tuesday:tuesday@localhost:5432/tuesday}"

# Create uploads directory
mkdir -p "$DATA_DIR/uploads"

# Execute command (supervisord)
exec "$@"
```

---

## Task 4: Multi-stage Dockerfile (6.3)

### Files to create:
- Root `Dockerfile`

```dockerfile
# Stage 1: Build frontend
FROM oven/bun:1 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile
COPY frontend/ .
RUN bun run build

# Stage 2: Install backend dependencies
FROM oven/bun:1 AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile --production

# Stage 3: Production image
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Install PostgreSQL 16, supervisord, and utilities
RUN apt-get update && \
    apt-get install -y wget gnupg2 lsb-release curl openssl && \
    echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    apt-get update && \
    apt-get install -y postgresql-16 supervisor && \
    rm -rf /var/lib/apt/lists/*

# Install Bun runtime
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Create app directory structure
WORKDIR /app

# Copy backend source and dependencies
COPY backend/src /app/backend/src
COPY backend/package.json backend/tsconfig.json /app/backend/
COPY --from=backend-deps /app/backend/node_modules /app/backend/node_modules

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /app/static

# Copy configuration files
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh

# Set permissions
RUN chmod +x /app/entrypoint.sh && \
    mkdir -p /app/data /var/log/supervisor

EXPOSE 8080
VOLUME /app/data

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

---

## Task 5: Docker Compose (6.5)

### Files to create:
- Root `docker-compose.yml`
- Root `docker-compose.dev.yml`

**`docker-compose.yml`** (production):
```yaml
services:
  tuesday:
    image: tuesday:latest
    build: .
    container_name: tuesday
    ports:
      - "${TUESDAY_PORT:-8080}:8080"
    volumes:
      - tuesday_data:/app/data
    environment:
      - TUESDAY_BASE_URL=${TUESDAY_BASE_URL:-http://localhost:8080}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  tuesday_data:
```

**`docker-compose.dev.yml`** (development):
```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: tuesday-dev-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: tuesday
      POSTGRES_PASSWORD: tuesday
      POSTGRES_DB: tuesday
    ports:
      - "5432:5432"
    volumes:
      - dev_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tuesday -d tuesday"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  dev_postgres_data:
```

---

## Task 6: Backup & Restore Scripts (6.6)

### Files to create:
- `scripts/backup.sh`
- `scripts/restore.sh`

Content follows the plan specification exactly (pg_dump with gzip, timestamped files, restore with confirmation prompt and .gz handling).

---

## Task 7: Environment Configuration (6.7)

### Files to create:
- Root `.env.example`

### Files to modify:
- `backend/src/config.ts` - Add `staticDir` and `baseUrl` fields

**Root `.env.example`**:
```env
# Tuesday Configuration
# Copy this file to .env and adjust values

# ─── Server ───────────────────────────────────────────
TUESDAY_PORT=8080
TUESDAY_BASE_URL=http://localhost:8080

# ─── Database ─────────────────────────────────────────
# Auto-configured for embedded PostgreSQL in Docker
DATABASE_URL=postgresql://tuesday:tuesday@localhost:5432/tuesday

# ─── Security ─────────────────────────────────────────
# Auto-generated on first run if not set
# SESSION_SECRET=your-secure-random-string-min-32-chars

# Session duration in hours (default: 24)
SESSION_DURATION_HOURS=24

# ─── Features ─────────────────────────────────────────
# Allow public registration (default: false, users must be invited)
# TUESDAY_ALLOW_REGISTRATION=false

# Enable rate limiting (default: true)
RATE_LIMIT_ENABLED=true

# ─── File Uploads ─────────────────────────────────────
UPLOAD_MAX_SIZE_MB=10
# UPLOAD_STORAGE_PATH=/app/data/uploads
# UPLOAD_ALLOWED_TYPES=image/*,application/pdf,text/plain,text/markdown
# UPLOAD_PENDING_TTL_MINUTES=30

# ─── CORS ─────────────────────────────────────────────
# Not needed when using Docker (same-origin)
# Set only for separate frontend/backend development
# CORS_ORIGIN=http://localhost:3000

# ─── Advanced ─────────────────────────────────────────
# DATA_DIR=/app/data
# STATIC_DIR=/app/static
# DELETED_MESSAGE_FILE_RETENTION_DAYS=30
```

---

## Task 8: Documentation (6.8)

### Files to create:
- `docs/deployment.md` - Docker deployment, reverse proxy (Nginx/Caddy), SSL
- `docs/configuration.md` - All environment variables reference
- `docs/upgrade.md` - Version upgrade process, rollback
- `docs/backup.md` - Backup/restore procedures
- `CHANGELOG.md` - Template for release notes

### Files to modify:
- `README.md` - Project overview, quick start, features, links to docs

---

## Task 9: Housekeeping

### Files to modify:
- `.gitignore` - Add: `tuesday` (binary), `backups/`, `*.sql.gz`, `.env.production`, `/app/data/`

---

## Implementation Order

1. Task 1: Frontend production build (vite.config.ts, App.tsx lazy loading, .env files)
2. Task 2: Backend static file serving (static.ts, index.ts, config.ts)
3. Task 3: Process management (supervisord.conf, entrypoint.sh)
4. Task 4: Multi-stage Dockerfile
5. Task 5: Docker Compose files
6. Task 6: Backup/restore scripts
7. Task 7: Environment configuration
8. Task 8: Documentation
9. Task 9: Housekeeping (.gitignore)
10. Docker build and test

## Key Design Decisions

1. **Bun runtime (not compiled)** - Avoids migration file embedding issues and WebSocket compatibility concerns
2. **Logs to stdout/stderr** - Docker best practice, works with `docker logs`
3. **Health check uses /health** - Simple endpoint already exists, no auth needed
4. **SPA fallback in middleware** - Serves index.html for client-side routes, skips /api/* paths
5. **Session secret auto-generation** - Stored in volume, persists across container restarts
6. **CORS optional in production** - Same-origin when frontend served from same container