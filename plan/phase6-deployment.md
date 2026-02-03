# Phase 6: Deployment - Implementation Plan

## Overview

This phase prepares the application for production deployment with Docker, documentation, and operational tooling.

**Estimated Total Effort:** 6-8 hours

---

## 6.1 Frontend Production Build

**Tasks:**
- [ ] Configure Vite for production build
- [ ] Set up environment variable handling (VITE_API_URL)
- [ ] Optimize bundle size (code splitting, tree shaking)
- [ ] Configure asset hashing for cache busting
- [ ] Test production build locally

**Files to update:**
```
frontend/vite.config.ts
frontend/.env.example
frontend/.env.production
```

**Estimated:** 1 hour

---

## 6.2 Backend Static File Serving

**Tasks:**
- [ ] Embed frontend build into Go binary
- [ ] Serve static files from embedded filesystem
- [ ] Configure SPA fallback (serve index.html for client routes)
- [ ] Set proper cache headers for assets

**Files to create/update:**
```
internal/server/static.go
cmd/server/main.go
```

**Estimated:** 1 hour

---

## 6.3 Multi-stage Dockerfile

**Tasks:**
- [ ] Update Dockerfile for frontend + backend build
- [ ] Stage 1: Build frontend (Node)
- [ ] Stage 2: Build backend (Go)
- [ ] Stage 3: Final image (Alpine)
- [ ] Optimize image size
- [ ] Test build locally

**Files to update:**
```
Dockerfile
```

**Estimated:** 1 hour

---

## 6.4 Docker Compose Finalization

**Tasks:**
- [ ] Finalize production docker-compose.yml
- [ ] Add health checks for all services
- [ ] Configure restart policies
- [ ] Set resource limits (optional)
- [ ] Create docker-compose.dev.yml for development
- [ ] Document volume mounts for persistence

**Files to update:**
```
docker-compose.yml
docker-compose.dev.yml
```

**Estimated:** 30 min

---

## 6.5 Database Backup & Restore

**Tasks:**
- [ ] Create backup script (pg_dump)
- [ ] Create restore script
- [ ] Document backup procedures
- [ ] Test backup and restore flow

**Files to create:**
```
scripts/backup.sh
scripts/restore.sh
```

**Estimated:** 30 min

---

## 6.6 CLI Commands

**Tasks:**
- [ ] Add `migrate` subcommand for manual migrations
- [ ] Add `seed` subcommand for initial data
- [ ] Add `create-admin` subcommand for first user setup
- [ ] Add `version` subcommand

**Files to create/update:**
```
cmd/server/main.go (add subcommands)
cmd/server/commands.go
```

**Estimated:** 1 hour

---

## 6.7 Environment Configuration

**Tasks:**
- [ ] Document all environment variables
- [ ] Create comprehensive .env.example
- [ ] Add validation for required variables
- [ ] Support for optional features (e.g., SMTP if added later)

**Files to update:**
```
.env.example
internal/config/config.go
```

**Estimated:** 30 min

---

## 6.8 README & Documentation

**Tasks:**
- [ ] Write comprehensive README.md
  - Project overview
  - Features list
  - Quick start guide
  - Configuration reference
  - Deployment instructions
- [ ] Create CONTRIBUTING.md (optional)
- [ ] Create CHANGELOG.md template
- [ ] Add screenshots to README

**Files to create:**
```
README.md
CONTRIBUTING.md
CHANGELOG.md
docs/deployment.md
docs/configuration.md
```

**Estimated:** 2 hours

---

## 6.9 Production Checklist

**Pre-deployment verification:**
- [ ] All environment variables documented
- [ ] Database migrations run successfully
- [ ] First admin user can be created
- [ ] Login/logout flow works
- [ ] Projects can be created and accessed
- [ ] All features functional
- [ ] No console errors in browser
- [ ] Security headers present
- [ ] HTTPS works (via reverse proxy)
- [ ] WebSocket connection works
- [ ] Backup/restore tested

**Estimated:** 1 hour

---

## Deployment Instructions (for README)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/workhub.git
cd workhub

# 2. Create environment file
cp .env.example .env
# Edit .env with your configuration

# 3. Start the application
docker compose up -d

# 4. Create first admin user (if registration disabled)
docker compose exec workhub ./workhub create-admin \
  --email admin@example.com \
  --password your-secure-password \
  --name "Admin User"

# 5. Access the application
# Point your reverse proxy to http://localhost:8080
# Or access directly at http://your-server:8080
```

---

## Reverse Proxy Examples

**Nginx Proxy Manager:**
- Point domain to server IP
- Set forward hostname: `workhub` (container name)
- Set forward port: `8080`
- Enable WebSocket support
- Enable SSL

**Caddy (Caddyfile):**
```
workhub.example.com {
    reverse_proxy localhost:8080
}
```

**Nginx:**
```nginx
server {
    listen 443 ssl http2;
    server_name workhub.example.com;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Completion Criteria

Phase 6 is complete when:
1. `docker compose up -d` starts the full application
2. Single Docker image contains frontend + backend
3. Admin user can be created via CLI
4. Application accessible via reverse proxy with HTTPS
5. Database can be backed up and restored
6. README provides clear deployment instructions
7. All configuration options documented
