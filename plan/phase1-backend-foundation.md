# Phase 1: Backend Foundation - Implementation Plan

## Overview

This phase establishes the core backend infrastructure: Go project structure, PostgreSQL database, authentication system, and essential middleware.

**Estimated Total Effort:** 7-10 hours

---

## 1.1 Project Scaffolding

**Tasks:**
- [ ] Initialize Go module (`go mod init`)
- [ ] Create folder structure per architecture.md
- [ ] Set up basic `cmd/server/main.go` entry point
- [ ] Create `Dockerfile` (multi-stage build)
- [ ] Create `docker-compose.yml` for development
- [ ] Create `.env.example` with required variables
- [ ] Add `.gitignore`

**Files to create:**
```
cmd/server/main.go
internal/config/config.go
Dockerfile
docker-compose.yml
docker-compose.dev.yml
.env.example
.gitignore
go.mod
```

**Estimated:** 30 min

---

## 1.2 Database Setup

**Tasks:**
- [ ] Set up PostgreSQL connection using pgx
- [ ] Configure connection pooling
- [ ] Set up golang-migrate for migrations
- [ ] Create initial migration with core tables:
  - `users`
  - `sessions`
  - `settings`
  - `projects`
  - `project_members`
  - `project_statuses`
- [ ] Add seed data for default settings and statuses

**Files to create:**
```
internal/database/postgres.go
internal/database/migrations/001_initial.up.sql
internal/database/migrations/001_initial.down.sql
```

**Estimated:** 1-2 hours

---

## 1.3 Core Models

**Tasks:**
- [ ] Define User model
- [ ] Define Session model
- [ ] Define Project model
- [ ] Define ProjectMember model
- [ ] Define ProjectStatus model
- [ ] Define Settings model

**Files to create:**
```
internal/model/user.go
internal/model/session.go
internal/model/project.go
internal/model/settings.go
```

**Estimated:** 30 min

---

## 1.4 Repository Layer

**Tasks:**
- [ ] Create base repository pattern (interface + implementation)
- [ ] Implement UserRepository (CRUD, FindByEmail)
- [ ] Implement SessionRepository (Create, Get, Delete, DeleteExpired)
- [ ] Implement SettingsRepository (Get, Set)

**Files to create:**
```
internal/repository/repository.go
internal/repository/user.go
internal/repository/session.go
internal/repository/settings.go
```

**Estimated:** 1-2 hours

---

## 1.5 Authentication Service

**Tasks:**
- [ ] Implement password hashing (bcrypt)
- [ ] Implement session generation (crypto/rand)
- [ ] Implement AuthService:
  - `Register(email, password, name)`
  - `Login(email, password)` 
  - `Logout(sessionId)`
  - `ValidateSession(sessionId)`
  - `GetCurrentUser(sessionId)`

**Files to create:**
```
internal/pkg/password/password.go
internal/service/auth.go
```

**Estimated:** 1 hour

---

## 1.6 HTTP Server & Middleware

**Tasks:**
- [ ] Set up Chi router
- [ ] Implement middleware:
  - Recovery (panic handling)
  - Logging (request/response logging)
  - CORS
  - Security headers
  - Auth (session validation, set user context)
  - Rate limiting (auth endpoints)
- [ ] Create standard response helpers (JSON success/error)

**Files to create:**
```
internal/server/server.go
internal/server/routes.go
internal/middleware/recovery.go
internal/middleware/logging.go
internal/middleware/cors.go
internal/middleware/security.go
internal/middleware/auth.go
internal/middleware/ratelimit.go
internal/pkg/response/response.go
```

**Estimated:** 1-2 hours

---

## 1.7 Auth Handlers

**Tasks:**
- [ ] POST `/api/v1/auth/register` - Create account (if enabled)
- [ ] POST `/api/v1/auth/login` - Email/password login
- [ ] POST `/api/v1/auth/logout` - Invalidate session
- [ ] GET `/api/v1/auth/me` - Get current user

**Files to create:**
```
internal/handler/auth.go
```

**Estimated:** 1 hour

---

## 1.8 Testing & Verification

**Tasks:**
- [ ] Manual test: docker compose up starts successfully
- [ ] Manual test: Database migrations run
- [ ] Manual test: Register new user via API
- [ ] Manual test: Login returns session cookie
- [ ] Manual test: `/auth/me` returns user data
- [ ] Manual test: Logout invalidates session

**Estimated:** 30 min

---

## Dependencies (Go Modules)

```
github.com/go-chi/chi/v5          # HTTP router
github.com/jackc/pgx/v5           # PostgreSQL driver
github.com/golang-migrate/migrate/v4  # Database migrations
golang.org/x/crypto               # bcrypt for password hashing
github.com/google/uuid            # UUID generation
github.com/joho/godotenv          # .env file loading (dev)
```

---

## Completion Criteria

Phase 1 is complete when:
1. `docker compose up` starts the backend and database
2. Migrations create all core tables
3. A user can register (if enabled) or be seeded
4. A user can login and receive a session cookie
5. Authenticated requests to `/api/v1/auth/me` return user data
6. Logout invalidates the session
