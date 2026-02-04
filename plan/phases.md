# Tuesday - Development Phases

> **Tuesday** - A free next step up to Basecamp, Mattermost, Notion, and Monday.

This document outlines the complete development roadmap for Tuesday, including detailed tasks, success criteria, and testing strategies for each phase.

## Overview

| Phase | Name | Estimated Hours | Focus |
|-------|------|-----------------|-------|
| 1 | Backend Foundation | 7-10 | Project setup, database, authentication |
| 2 | Core Features | 12-16 | Projects, Docs, Tasks APIs |
| 3 | Frontend Foundation | 10-14 | React setup, routing, auth UI |
| 4 | Feature Completion | 20-28 | Full UI for all features |
| 5 | Real-time & Polish | 16-22 | WebSocket, chat, notifications |
| 6 | Deployment | 6-8 | Docker, documentation |

**Total Estimated Effort:** 71-98 hours

### Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun 1.x |
| Backend Framework | Hono |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 (embedded) |
| Validation | Zod |
| Frontend | React 18 + TypeScript + Vite |
| UI Components | shadcn/ui (Nova style, Stone theme) |
| State Management | TanStack Query + Zustand |
| Icons | Phosphor Icons |
| Real-time | WebSockets |

---

## Phase 1: Backend Foundation ✅ COMPLETED

### Overview

This phase establishes the core backend infrastructure: Bun project structure, PostgreSQL database with Drizzle ORM, authentication system, and essential middleware.

**Estimated Effort:** 7-10 hours
**Actual Effort:** Completed
**Status:** ✅ All success criteria verified

---

### 1.1 Project Scaffolding ✅

**Tasks:**
- [x] Initialize Bun project with `bun init`
- [x] Create folder structure per architecture.md
- [x] Set up `src/index.ts` entry point with Hono
- [x] Create `Dockerfile` (multi-stage build)
- [x] Create `docker-compose.yml` for development
- [x] Create `.env.example` with required variables
- [x] Add `.gitignore`
- [x] Configure TypeScript (`tsconfig.json`)

**Files to create:**
```
backend/
├── src/
│   └── index.ts
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── Dockerfile
└── docker-compose.yml
```

**Estimated:** 30-45 min

---

### 1.2 Database Setup ✅

**Tasks:**
- [x] Install Drizzle ORM and PostgreSQL driver (`drizzle-orm`, `postgres`)
- [x] Install Drizzle Kit for migrations (`drizzle-kit`)
- [x] Create database client connection (`src/db/client.ts`)
- [x] Configure connection pooling
- [x] Create Drizzle config (`drizzle.config.ts`)
- [x] Define initial schema with core tables:
  - `users`
  - `sessions`
  - `settings`
  - `projects`
  - `project_members`
  - `project_statuses`
- [x] Generate and run initial migration
- [x] Add seed data for default statuses

**Files to create:**
```
backend/
├── src/
│   └── db/
│       ├── client.ts
│       ├── schema.ts
│       └── migrations/
│           └── 0001_initial.sql
├── drizzle.config.ts
```

**Estimated:** 1.5-2 hours

---

### 1.3 Core Models & Types ✅

**Tasks:**
- [x] Define Zod schemas for validation
- [x] Create TypeScript types inferred from Drizzle schema
- [x] Define User types and enums (role: admin | member)
- [x] Define Session types
- [x] Define Project types and enums
- [x] Define ProjectMember types (role: owner | member)
- [x] Define Settings types

**Files to create:**
```
backend/src/
├── types/
│   ├── index.ts
│   ├── user.ts
│   ├── project.ts
│   └── settings.ts
└── utils/
    └── validation.ts
```

**Estimated:** 30-45 min

---

### 1.4 Repository Layer ✅

**Tasks:**
- [x] Create base repository pattern with Drizzle
- [x] Implement UserRepository
  - `findById(id: string)`
  - `findByEmail(email: string)`
  - `create(data: NewUser)`
  - `update(id: string, data: Partial<User>)`
  - `delete(id: string)`
- [x] Implement SessionRepository
  - `create(data: NewSession)`
  - `findById(id: string)`
  - `findByIdWithUser(id: string)`
  - `delete(id: string)`
  - `deleteExpired()`
  - `deleteByUserId(userId: string)`
- [x] Implement SettingsRepository
  - `get(key: string)`
  - `set(key: string, value: unknown)`
  - `getAll()`

**Files to create:**
```
backend/src/repositories/
├── index.ts
├── user.ts
├── session.ts
└── settings.ts
```

**Estimated:** 1.5-2 hours

---

### 1.5 Authentication Service ✅

**Tasks:**
- [x] Install bcryptjs for password hashing
- [x] Create password utility (hash, verify) with cost factor 12
- [x] Create session ID generator (32 bytes crypto random)
- [x] Implement AuthService:
  - `register(email, password, name, role?)` - Create new user
  - `login(email, password, ip, userAgent)` - Authenticate and create session
  - `logout(sessionId)` - Invalidate session
  - `validateSession(sessionId)` - Check session validity, return user
  - `getCurrentUser(sessionId)` - Get user from session
- [x] Implement session expiry check (24 hours default)

**Files to create:**
```
backend/src/
├── utils/
│   └── password.ts
├── services/
│   ├── index.ts
│   └── auth.ts
```

**Estimated:** 1-1.5 hours

---

### 1.6 HTTP Server & Middleware ✅

**Tasks:**
- [x] Set up Hono app with base configuration
- [x] Implement middleware:
  - **Recovery** - Panic/error handling
  - **Logging** - Request/response logging
  - **CORS** - Cross-origin configuration
  - **Security Headers** - X-Content-Type-Options, X-Frame-Options, CSP, etc.
  - **Auth** - Session validation, set user in context
  - **Rate Limiting** - For auth endpoints (5 req/min per IP)
- [x] Create standard response helpers:
  - `success(data, meta?)` - Standard success response
  - `error(code, message, details?)` - Standard error response
- [x] Create context helpers for accessing current user

**Files to create:**
```
backend/src/
├── middleware/
│   ├── index.ts
│   ├── recovery.ts
│   ├── logging.ts
│   ├── cors.ts
│   ├── security.ts
│   ├── auth.ts
│   └── ratelimit.ts
├── utils/
│   └── response.ts
└── index.ts (update with middleware)
```

**Estimated:** 1.5-2 hours

---

### 1.7 Auth Routes ✅

**Tasks:**
- [x] Create auth router with Hono
- [x] Implement endpoints:
  - `POST /api/v1/auth/register` - Create account (validate input, check if registration enabled)
  - `POST /api/v1/auth/login` - Email/password login, set HTTP-only cookie
  - `POST /api/v1/auth/logout` - Invalidate session, clear cookie
  - `GET /api/v1/auth/me` - Get current authenticated user
- [x] Implement cookie settings:
  - `httpOnly: true`
  - `secure: true` (in production)
  - `sameSite: 'Strict'`
  - `path: '/'`
  - `maxAge: 86400` (24 hours)
- [x] Wire routes to main app

**Files to create:**
```
backend/src/
├── routes/
│   ├── index.ts
│   └── auth.ts
```

**Estimated:** 1-1.5 hours

---

### 1.8 First-Time Setup ✅

**Tasks:**
- [x] Implement setup status check
- [x] Create setup endpoints:
  - `GET /api/v1/setup/status` - Returns `{ initialized: boolean }`
  - `POST /api/v1/setup/complete` - Create admin user + workspace name
- [x] Setup endpoint security:
  - Returns 403 if any users exist
  - Rate limited (10 req/min per IP)
  - No authentication required
- [x] Atomic transaction for setup completion

**Files to create:**
```
backend/src/
├── routes/
│   └── setup.ts
├── services/
│   └── setup.ts
```

**Estimated:** 45 min - 1 hour

---

### Success Criteria ✅ ALL VERIFIED

Phase 1 is complete when ALL of the following are verified:

| # | Criterion | Verification Method | Status |
|---|-----------|---------------------|--------|
| 1.1 | `bun run dev` starts the backend server without errors | Manual: Run command, check console output | ✅ |
| 1.2 | Database migrations run successfully on startup | Manual: Check logs for migration success | ✅ |
| 1.3 | `GET /api/v1/setup/status` returns `{ "data": { "initialized": false } }` on fresh DB | Manual: curl or API client | ✅ |
| 1.4 | `POST /api/v1/setup/complete` creates admin user and sets workspace name | Manual: API call, verify DB records | ✅ |
| 1.5 | `GET /api/v1/setup/status` returns `{ "data": { "initialized": true } }` after setup | Manual: curl or API client | ✅ |
| 1.6 | `POST /api/v1/setup/complete` returns 403 after initial setup | Manual: Try setup again | ✅ |
| 1.7 | `POST /api/v1/auth/login` with valid credentials returns 200 and sets session cookie | Manual: API call, check cookies | ✅ |
| 1.8 | `POST /api/v1/auth/login` with invalid credentials returns 401 | Manual: API call with wrong password | ✅ |
| 1.9 | `GET /api/v1/auth/me` with valid session returns user data | Manual: API call with session cookie | ✅ |
| 1.10 | `GET /api/v1/auth/me` without session returns 401 | Manual: API call without cookie | ✅ |
| 1.11 | `POST /api/v1/auth/logout` invalidates session | Manual: Logout, then try /auth/me | ✅ |
| 1.12 | Security headers present on all responses | Manual: Check response headers | ✅ |
| 1.13 | Rate limiting blocks excessive auth requests | Manual: Send 6+ login requests quickly | ✅ |
| 1.14 | All unit tests pass | Automated: `bun test` | ✅ |
| 1.15 | All integration tests pass | Automated: `bun test:integration` | ⏳ (manual verification done) |

---

### Testing Strategy

#### Unit Tests

**Test Files to Create:**
```
backend/src/
├── utils/
│   └── password.test.ts
├── services/
│   └── auth.test.ts
├── repositories/
│   ├── user.test.ts
│   ├── session.test.ts
│   └── settings.test.ts
```

**Coverage Targets:**
- `utils/password.ts` - 100% coverage
- `services/auth.ts` - 90%+ coverage
- `repositories/*.ts` - 80%+ coverage

**Unit Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `password.test.ts` | should hash password | Verify bcrypt hash is generated |
| `password.test.ts` | should verify correct password | Verify matching password returns true |
| `password.test.ts` | should reject incorrect password | Verify wrong password returns false |
| `password.test.ts` | should generate unique hashes | Same password produces different hashes |
| `auth.test.ts` | should create user on register | Verify user created with hashed password |
| `auth.test.ts` | should reject duplicate email | Verify error on existing email |
| `auth.test.ts` | should create session on login | Verify session record created |
| `auth.test.ts` | should reject invalid credentials | Verify error on wrong password |
| `auth.test.ts` | should reject disabled user | Verify disabled users cannot login |
| `auth.test.ts` | should delete session on logout | Verify session removed from DB |
| `auth.test.ts` | should validate active session | Verify valid session returns user |
| `auth.test.ts` | should reject expired session | Verify expired sessions are invalid |

**Commands:**
```bash
# Run all unit tests
bun test

# Run specific test file
bun test src/services/auth.test.ts

# Run tests with coverage
bun test --coverage

# Run tests in watch mode
bun test --watch
```

---

#### Integration Tests

**Test Files to Create:**
```
backend/src/
├── routes/
│   ├── auth.integration.test.ts
│   └── setup.integration.test.ts
```

**Integration Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `setup.integration.test.ts` | GET /setup/status returns initialized: false | Fresh database check |
| `setup.integration.test.ts` | POST /setup/complete creates admin | Full setup flow |
| `setup.integration.test.ts` | POST /setup/complete returns 403 after setup | Prevent duplicate setup |
| `setup.integration.test.ts` | Setup is rate limited | Verify 429 after excessive requests |
| `auth.integration.test.ts` | POST /auth/register creates user | Full registration flow |
| `auth.integration.test.ts` | POST /auth/register validates input | Check validation errors |
| `auth.integration.test.ts` | POST /auth/login returns session cookie | Full login flow |
| `auth.integration.test.ts` | POST /auth/login rejects invalid credentials | Error handling |
| `auth.integration.test.ts` | GET /auth/me returns current user | Authenticated request |
| `auth.integration.test.ts` | GET /auth/me returns 401 without session | Unauthenticated request |
| `auth.integration.test.ts` | POST /auth/logout clears session | Full logout flow |
| `auth.integration.test.ts` | Auth endpoints are rate limited | Verify 429 response |

**Commands:**
```bash
# Run integration tests (requires test database)
bun test:integration

# Run specific integration test
bun test src/routes/auth.integration.test.ts
```

---

#### Manual Verification Checklist ✅ ALL VERIFIED

Before marking Phase 1 complete, manually verify each item:

**Setup Flow:**
- [x] Start fresh with empty database
- [x] `GET /api/v1/setup/status` returns `initialized: false`
- [x] Complete setup wizard with admin credentials
- [x] `GET /api/v1/setup/status` returns `initialized: true`
- [x] Attempting setup again returns 403 Forbidden

**Authentication Flow:**
- [x] Login with admin credentials succeeds
- [x] Response includes `Set-Cookie` header with `session_id`
- [x] Cookie has `HttpOnly`, `Secure`, `SameSite=Strict` flags
- [x] `GET /api/v1/auth/me` returns user data with cookie
- [x] `GET /api/v1/auth/me` returns 401 without cookie
- [x] Logout clears the session cookie
- [x] After logout, `/auth/me` returns 401

**Security Verification:**
- [x] Check response headers include:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Content-Security-Policy: ...`
- [x] Send 6 rapid login requests - verify 429 rate limit response
- [x] Password is stored as bcrypt hash (check database directly)
- [x] Session ID is 32+ bytes of random data

**Database Verification:**
- [x] `users` table exists with correct schema
- [x] `sessions` table exists with correct schema
- [x] `settings` table exists with correct schema
- [x] `project_statuses` table has default seed data
- [x] Foreign key constraints are enforced

---

#### Test Environment Setup

**docker-compose.test.yml:**
```yaml
version: '3.8'
services:
  test-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: tuesday_test
      POSTGRES_PASSWORD: test_password
      POSTGRES_DB: tuesday_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data
```

**Test Environment Variables (.env.test):**
```env
DATABASE_URL=postgresql://tuesday_test:test_password@localhost:5433/tuesday_test
SESSION_SECRET=test-secret-key-do-not-use-in-production
NODE_ENV=test
```

**Commands:**
```bash
# Start test database
docker compose -f docker-compose.test.yml up -d

# Run all tests
bun test

# Run with coverage report
bun test --coverage

# Stop test database
docker compose -f docker-compose.test.yml down
```

---

### Dependencies

**Production:**
```json
{
  "dependencies": {
    "hono": "^4.x",
    "drizzle-orm": "^0.30.x",
    "postgres": "^3.x",
    "bcryptjs": "^2.x",
    "zod": "^3.x"
  }
}
```

**Development:**
```json
{
  "devDependencies": {
    "drizzle-kit": "^0.21.x",
    "@types/bcryptjs": "^2.x",
    "typescript": "^5.x"
  }
}
```

---

### Estimated Timeline

| Task | Hours | Cumulative |
|------|-------|------------|
| 1.1 Project Scaffolding | 0.5-0.75 | 0.5-0.75 |
| 1.2 Database Setup | 1.5-2 | 2-2.75 |
| 1.3 Core Models & Types | 0.5-0.75 | 2.5-3.5 |
| 1.4 Repository Layer | 1.5-2 | 4-5.5 |
| 1.5 Authentication Service | 1-1.5 | 5-7 |
| 1.6 HTTP Server & Middleware | 1.5-2 | 6.5-9 |
| 1.7 Auth Routes | 1-1.5 | 7.5-10.5 |
| 1.8 First-Time Setup | 0.75-1 | 8.25-11.5 |
| Testing & Verification | 1-1.5 | **9.25-13** |

**Note:** Actual time may vary based on familiarity with the stack.

---

*Continue to [Phase 2: Core Features](#phase-2-core-features) after all Phase 1 criteria are met.*

---

## Phase 2: Core Features ✅ COMPLETED

### Overview

This phase implements the core domain features: Projects, Docs, and Tasks with full CRUD operations and access control. This forms the backbone of Tuesday's project management capabilities.

**Estimated Effort:** 12-16 hours
**Actual Effort:** Completed
**Status:** ✅ All success criteria verified

---

### 2.1 Project Repository & Service ✅

**Tasks:**
- [x] Create ProjectRepository
  - `findById(id: string)`
  - `findByUserId(userId: string)` - Projects where user is member
  - `findAll()` - Admin only
  - `create(data: NewProject)`
  - `update(id: string, data: Partial<Project>)`
  - `delete(id: string)`
- [x] Create ProjectMemberRepository
  - `findByProjectId(projectId: string)`
  - `findByUserId(userId: string)`
  - `findMembership(projectId: string, userId: string)`
  - `addMember(projectId: string, userId: string, role: string)`
  - `updateRole(projectId: string, userId: string, role: string)`
  - `removeMember(projectId: string, userId: string)`
- [x] Create ProjectStatusRepository
  - `findAll()`
  - `findById(id: string)`
  - `create(data: NewProjectStatus)`
  - `update(id: string, data: Partial<ProjectStatus>)`
  - `delete(id: string)`
  - `reorder(ids: string[])`
- [x] Create ProjectService with business logic
  - Access control filtering (members only see their projects)
  - Validation rules (name required, valid status, etc.)
  - Automatic owner assignment on creation

**Files to create:**
```
backend/src/repositories/
├── project.ts
├── projectMember.ts
└── projectStatus.ts

backend/src/services/
└── project.ts
```

**Estimated:** 2-3 hours

---

### 2.2 Project Middleware ✅

**Tasks:**
- [x] Create `requireProjectMember` middleware
  - Extract project ID from URL params
  - Check if current user is a member of the project
  - Return 403 if not a member (unless admin)
  - Add project to request context
- [x] Create `requireProjectOwner` middleware
  - Extends member check
  - Verifies user has "owner" role on project
  - Return 403 if not owner
- [x] Create `requireAdmin` middleware
  - Check if current user has admin role
  - Return 403 if not admin

**Files to create:**
```
backend/src/middleware/
├── project.ts
└── admin.ts
```

**Estimated:** 1 hour

---

### 2.3 Project Routes ✅

**Tasks:**
- [x] Create project router with Hono
- [x] Implement endpoints:
  - `GET /api/v1/projects` - List user's projects (filtered by membership)
  - `POST /api/v1/projects` - Create project (user becomes owner)
  - `GET /api/v1/projects/:id` - Get project details (requires membership)
  - `PATCH /api/v1/projects/:id` - Update project (owner only)
  - `DELETE /api/v1/projects/:id` - Delete project (owner only)
- [x] Implement member management endpoints:
  - `GET /api/v1/projects/:id/members` - List project members
  - `POST /api/v1/projects/:id/members` - Add member (owner only)
  - `PATCH /api/v1/projects/:id/members/:userId` - Update member role (owner only)
  - `DELETE /api/v1/projects/:id/members/:userId` - Remove member (owner only)
- [x] Wire routes to main app with appropriate middleware

**Files to create:**
```
backend/src/routes/
└── projects.ts
```

**Estimated:** 2-3 hours

---

### 2.4 Document Schema & Repository ✅

**Tasks:**
- [x] Add docs table to database schema
  - `id` (uuid, primary key)
  - `project_id` (uuid, nullable - null for personal docs)
  - `parent_id` (uuid, nullable - for nested docs)
  - `title` (string)
  - `content_md` (text)
  - `properties` (jsonb - custom properties)
  - `is_database` (boolean - Notion-style database)
  - `schema` (jsonb - property schema for database docs)
  - `created_by` (uuid, foreign key to users)
  - `created_at`, `updated_at` (timestamps)
- [x] Generate migration for docs table
- [x] Create DocRepository
  - `findById(id: string)`
  - `findByProjectId(projectId: string)`
  - `findPersonalDocs(userId: string)`
  - `findChildren(parentId: string)`
  - `create(data: NewDoc)`
  - `update(id: string, data: Partial<Doc>)`
  - `delete(id: string)`
- [x] Create DocService with business logic
  - Support personal docs (null project_id)
  - Support database docs (is_database=true, schema field)
  - Properties JSONB handling

**Files to create:**
```
backend/src/db/
└── migrations/
    └── 0002_docs.sql

backend/src/repositories/
└── doc.ts

backend/src/services/
└── doc.ts
```

**Estimated:** 2 hours

---

### 2.5 Document Routes ✅

**Tasks:**
- [x] Create docs router with Hono
- [x] Implement project doc endpoints:
  - `GET /api/v1/projects/:id/docs` - List project docs
  - `POST /api/v1/projects/:id/docs` - Create doc in project
- [x] Implement individual doc endpoints:
  - `GET /api/v1/docs/:id` - Get doc with content
  - `PATCH /api/v1/docs/:id` - Update doc
  - `DELETE /api/v1/docs/:id` - Delete doc
- [x] Implement personal doc endpoints:
  - `GET /api/v1/docs/personal` - List personal docs
  - `POST /api/v1/docs/personal` - Create personal doc
- [x] Apply project membership middleware to project doc routes

**Files to create:**
```
backend/src/routes/
└── docs.ts
```

**Estimated:** 2 hours

---

### 2.6 Task Schema & Repository ✅

**Tasks:**
- [x] Add tasks and task_statuses tables to database schema
  - **task_statuses:** id, name, color, sort_order, is_default
  - **tasks:** id, project_id, title, description_md, status_id, start_date, due_date, sort_order, created_by, created_at, updated_at
  - **task_assignees:** task_id, user_id (junction table)
- [x] Generate migration for tasks tables
- [x] Seed default task statuses (Backlog, To Do, In Progress, Review, Done)
- [x] Create TaskRepository
  - `findById(id: string)`
  - `findByProjectId(projectId: string, filters?)`
  - `findByAssignee(userId: string)`
  - `create(data: NewTask)`
  - `update(id: string, data: Partial<Task>)`
  - `updateStatus(id: string, statusId: string)`
  - `updateSortOrder(id: string, sortOrder: number)`
  - `delete(id: string)`
- [x] Create TaskAssigneeRepository
  - `findByTaskId(taskId: string)`
  - `setAssignees(taskId: string, userIds: string[])`
- [x] Create TaskStatusRepository (similar to ProjectStatusRepository)
- [x] Create TaskService with business logic
  - Assignee management (many-to-many)
  - Kanban ordering (sort_order field)
  - Status transitions

**Files to create:**
```
backend/src/db/
└── migrations/
    └── 0003_tasks.sql

backend/src/repositories/
├── task.ts
├── taskAssignee.ts
└── taskStatus.ts

backend/src/services/
└── task.ts
```

**Estimated:** 2-2.5 hours

---

### 2.7 Task Routes ✅

**Tasks:**
- [x] Create tasks router with Hono
- [x] Implement project task endpoints:
  - `GET /api/v1/projects/:id/tasks` - List project tasks (with status/assignee filters)
  - `POST /api/v1/projects/:id/tasks` - Create task in project
- [x] Implement individual task endpoints:
  - `GET /api/v1/tasks/:id` - Get task details
  - `PATCH /api/v1/tasks/:id` - Update task
  - `DELETE /api/v1/tasks/:id` - Delete task
  - `PATCH /api/v1/tasks/:id/status` - Update task status (kanban move)
  - `PATCH /api/v1/tasks/:id/assignees` - Update assignees
  - `PATCH /api/v1/tasks/:id/order` - Update sort order
- [x] Implement cross-project task endpoint:
  - `GET /api/v1/tasks/my` - List user's tasks across all projects
- [x] Apply project membership middleware

**Files to create:**
```
backend/src/routes/
└── tasks.ts
```

**Estimated:** 2 hours

---

### 2.8 Admin Status Management ✅

**Tasks:**
- [x] Create admin router with Hono
- [x] Implement project status endpoints:
  - `GET /api/v1/admin/statuses/project` - List project statuses
  - `POST /api/v1/admin/statuses/project` - Create status
  - `PATCH /api/v1/admin/statuses/project/:id` - Update status
  - `DELETE /api/v1/admin/statuses/project/:id` - Delete status
  - `POST /api/v1/admin/statuses/project/reorder` - Reorder statuses
- [x] Implement task status endpoints (same pattern)
- [x] Apply admin middleware to all admin routes

**Files to create:**
```
backend/src/routes/
└── admin.ts
```

**Estimated:** 1-1.5 hours

---

### Success Criteria ✅ ALL VERIFIED

Phase 2 is complete when ALL of the following are verified:

| # | Criterion | Verification Method | Status |
|---|-----------|---------------------|--------|
| 2.1 | User can create a new project and becomes owner | API: POST /projects, verify owner in DB | ✅ |
| 2.2 | Project list only shows projects where user is member | API: GET /projects as different users | ✅ |
| 2.3 | Admin can see all projects | API: GET /projects as admin | ✅ |
| 2.4 | Project owner can add/remove members | API: POST/DELETE /projects/:id/members | ✅ |
| 2.5 | Non-member gets 403 when accessing project | API: GET /projects/:id as non-member | ✅ |
| 2.6 | Project owner can update project details | API: PATCH /projects/:id as owner | ✅ |
| 2.7 | Non-owner gets 403 when updating project | API: PATCH /projects/:id as member | ✅ |
| 2.8 | Docs can be created within a project | API: POST /projects/:id/docs | ✅ |
| 2.9 | Personal docs can be created (no project) | API: POST /docs/personal | ✅ |
| 2.10 | Doc content can be updated | API: PATCH /docs/:id | ✅ |
| 2.11 | Database docs support custom schema | API: Create doc with is_database=true | ✅ |
| 2.12 | Tasks can be created with assignees | API: POST /projects/:id/tasks | ✅ |
| 2.13 | Task status can be updated (kanban) | API: PATCH /tasks/:id/status | ✅ |
| 2.14 | Task assignees can be modified | API: PATCH /tasks/:id/assignees | ✅ |
| 2.15 | /tasks/my returns tasks across all user's projects | API: GET /tasks/my | ✅ |
| 2.16 | Admin can manage project statuses | API: CRUD /admin/statuses/project | ✅ |
| 2.17 | Admin can manage task statuses | API: CRUD /admin/statuses/task | ✅ |
| 2.18 | All unit tests pass | Automated: `bun test` | ✅ |
| 2.19 | All integration tests pass | Automated: `bun test:integration` | ✅ |

---

### Testing Strategy

#### Unit Tests ✅

**Test Files Created:**
```
backend/src/
├── repositories/
│   ├── project.test.ts
│   ├── projectMember.test.ts
│   ├── doc.test.ts
│   ├── task.test.ts
│   └── taskAssignee.test.ts
├── services/
│   ├── project.test.ts ✅
│   ├── doc.test.ts ✅
│   └── task.test.ts ✅
└── middleware/
    └── project.test.ts
```

**Coverage Targets:**
- `services/*.ts` - 90%+ coverage
- `repositories/*.ts` - 80%+ coverage
- `middleware/project.ts` - 100% coverage

**Unit Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `project.test.ts` | should create project with owner | Verify owner membership created |
| `project.test.ts` | should filter projects by membership | Non-members excluded |
| `project.test.ts` | should allow admin to see all | Admin bypass |
| `projectMember.test.ts` | should add member to project | Member record created |
| `projectMember.test.ts` | should prevent duplicate membership | Error on existing member |
| `projectMember.test.ts` | should update member role | Role changed correctly |
| `doc.test.ts` | should create project doc | Doc with project_id |
| `doc.test.ts` | should create personal doc | Doc with null project_id |
| `doc.test.ts` | should support nested docs | Parent-child relationship |
| `doc.test.ts` | should handle database schema | is_database with schema |
| `task.test.ts` | should create task with status | Default status assigned |
| `task.test.ts` | should update task status | Status change recorded |
| `task.test.ts` | should manage assignees | Add/remove assignees |
| `task.test.ts` | should update sort order | Kanban reordering |
| `middleware/project.test.ts` | should allow project member | Request proceeds |
| `middleware/project.test.ts` | should reject non-member | 403 returned |
| `middleware/project.test.ts` | should allow admin | Admin bypass works |

**Commands:**
```bash
# Run Phase 2 unit tests
bun test src/services/project.test.ts
bun test src/services/doc.test.ts
bun test src/services/task.test.ts

# Run all tests
bun test
```

---

#### Integration Tests ✅

**Test Files Created:**
```
backend/src/routes/
├── projects.integration.test.ts ✅
├── docs.integration.test.ts ✅
├── tasks.integration.test.ts ✅
└── admin.integration.test.ts ✅
```

**Integration Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `projects.integration.test.ts` | POST /projects creates project | Full creation flow |
| `projects.integration.test.ts` | GET /projects filters by membership | Access control works |
| `projects.integration.test.ts` | PATCH /projects/:id requires owner | Authorization check |
| `projects.integration.test.ts` | Member management CRUD | Add/update/remove members |
| `docs.integration.test.ts` | Project doc CRUD | Create/read/update/delete |
| `docs.integration.test.ts` | Personal doc CRUD | No project_id docs |
| `docs.integration.test.ts` | Database doc with schema | Custom properties |
| `tasks.integration.test.ts` | Task CRUD with assignees | Full task lifecycle |
| `tasks.integration.test.ts` | Status update (kanban) | Move between columns |
| `tasks.integration.test.ts` | GET /tasks/my cross-project | Aggregated view |
| `admin.integration.test.ts` | Status CRUD requires admin | Authorization check |
| `admin.integration.test.ts` | Status reordering | Sort order update |

**Commands:**
```bash
# Run integration tests
bun test:integration

# Run specific test file
bun test src/routes/projects.integration.test.ts
```

---

#### Manual Verification Checklist

**Project Management:**
- [ ] Create a new project - verify creator is owner
- [ ] List projects as owner - project appears
- [ ] List projects as non-member - project not visible
- [ ] Add a member to project - member can now see project
- [ ] Change member role from member to owner
- [ ] Remove member from project - member can no longer see project
- [ ] Update project name as owner - succeeds
- [ ] Update project as member (non-owner) - returns 403
- [ ] Delete project as owner - succeeds
- [ ] Delete project as non-owner - returns 403

**Document Management:**
- [ ] Create doc in project - succeeds for members
- [ ] Create doc in project as non-member - returns 403
- [ ] Create personal doc - succeeds, has null project_id
- [ ] Update doc content - markdown saved correctly
- [ ] Create database doc with schema - schema stored in JSONB
- [ ] Create nested doc (with parent_id) - hierarchy works
- [ ] Delete doc - removes from database

**Task Management:**
- [ ] Create task with title and description
- [ ] Create task with assignees - junction records created
- [ ] Update task status (simulate kanban drag) - status changes
- [ ] Update task sort order - order changes
- [ ] View "My Tasks" - shows tasks from all member projects
- [ ] Filter tasks by status - correct filtering
- [ ] Filter tasks by assignee - correct filtering

**Admin Functions:**
- [ ] List project statuses as admin
- [ ] Create new project status
- [ ] Update status name/color
- [ ] Reorder statuses
- [ ] Delete unused status
- [ ] Same operations for task statuses
- [ ] Non-admin gets 403 on admin endpoints

---

### Database Migrations

**Migration 0002_docs.sql:**
```sql
CREATE TABLE docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES docs(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_md TEXT DEFAULT '',
  properties JSONB DEFAULT '{}',
  is_database BOOLEAN DEFAULT FALSE,
  schema JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_docs_project ON docs(project_id);
CREATE INDEX idx_docs_parent ON docs(parent_id);
CREATE INDEX idx_docs_created_by ON docs(created_by);
```

**Migration 0003_tasks.sql:**
```sql
CREATE TABLE task_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  color VARCHAR(20) DEFAULT '#gray',
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description_md TEXT DEFAULT '',
  status_id UUID REFERENCES task_statuses(id),
  start_date DATE,
  due_date DATE,
  sort_order INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status_id);
CREATE INDEX idx_task_assignees_user ON task_assignees(user_id);

-- Seed default task statuses
INSERT INTO task_statuses (name, color, sort_order, is_default) VALUES
  ('Backlog', '#6b7280', 0, TRUE),
  ('To Do', '#3b82f6', 1, FALSE),
  ('In Progress', '#f59e0b', 2, FALSE),
  ('Review', '#8b5cf6', 3, FALSE),
  ('Done', '#10b981', 4, FALSE);
```

---

### Estimated Timeline

| Task | Hours | Cumulative |
|------|-------|------------|
| 2.1 Project Repository & Service | 2-3 | 2-3 |
| 2.2 Project Middleware | 1 | 3-4 |
| 2.3 Project Routes | 2-3 | 5-7 |
| 2.4 Document Schema & Repository | 2 | 7-9 |
| 2.5 Document Routes | 2 | 9-11 |
| 2.6 Task Schema & Repository | 2-2.5 | 11-13.5 |
| 2.7 Task Routes | 2 | 13-15.5 |
| 2.8 Admin Status Management | 1-1.5 | 14-17 |
| Testing & Verification | 1.5-2 | **15.5-19** |

---

*Continue to [Phase 3: Frontend Foundation](#phase-3-frontend-foundation) after all Phase 2 criteria are met.*

---

## Phase 3: Frontend Foundation ✅ COMPLETED

### Overview

This phase establishes the React frontend with authentication, routing, state management, and basic project views. The goal is to create a solid foundation with shadcn/ui components that all future features will build upon.

**Estimated Effort:** 10-14 hours
**Actual Effort:** Completed
**Status:** ✅ All success criteria verified

**Prerequisites:** Phase 2 complete with all backend APIs functional.

---

### 3.1 Project Scaffolding ✅

**Tasks:**
- [x] Initialize Vite + React + TypeScript project with Bun
- [x] Configure path aliases (`@/components`, `@/hooks`, `@/lib`, etc.)
- [x] Set up folder structure per architecture.md
- [x] Install and configure Tailwind CSS
- [x] Initialize shadcn/ui with Nova style and Stone theme
- [x] Install Phosphor Icons
- [x] Configure Inter font
- [x] Set up ESLint + Prettier

**Commands:**
```bash
cd frontend
bun create vite . --template react-ts
bun install
bun install -D tailwindcss postcss autoprefixer
bunx tailwindcss init -p
bunx --bun shadcn@latest init
```

**Files to create:**
```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   └── vite-env.d.ts
├── components.json          # shadcn config
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

**Estimated:** 1-1.5 hours

---

### 3.2 shadcn/ui Core Components ✅

**Tasks:**
- [x] Install essential shadcn components:
  - `button`, `input`, `label`, `card`
  - `dialog`, `dropdown-menu`, `avatar`
  - `form`, `toast`, `sonner`
  - `separator`, `skeleton`, `badge`
  - `tabs`, `tooltip`
- [x] Configure component theming (Stone color palette)
- [x] Set up toast/notification provider

**Commands:**
```bash
bunx --bun shadcn@latest add button input label card
bunx --bun shadcn@latest add dialog dropdown-menu avatar
bunx --bun shadcn@latest add form toast sonner
bunx --bun shadcn@latest add separator skeleton badge tabs tooltip
```

**Files created:**
```
frontend/src/components/ui/
├── button.tsx
├── input.tsx
├── label.tsx
├── card.tsx
├── dialog.tsx
├── dropdown-menu.tsx
├── avatar.tsx
├── form.tsx
├── toast.tsx
├── sonner.tsx
├── separator.tsx
├── skeleton.tsx
├── badge.tsx
├── tabs.tsx
└── tooltip.tsx
```

**Estimated:** 30-45 min

---

### 3.3 API Client Layer ✅

**Tasks:**
- [x] Create fetch-based API client with credentials
- [x] Set up request/response interceptors
- [x] Handle 401 responses (redirect to login)
- [x] Handle network errors gracefully
- [x] Create typed API functions:
  - `api.setup.getStatus()`
  - `api.setup.complete(data)`
  - `api.auth.login(email, password)`
  - `api.auth.logout()`
  - `api.auth.register(data)`
  - `api.auth.me()`
  - `api.projects.list()`
  - `api.projects.get(id)`
  - `api.projects.create(data)`
  - `api.projects.update(id, data)`
  - `api.projects.delete(id)`

**Files to create:**
```
frontend/src/
├── api/
│   ├── client.ts            # Base fetch wrapper
│   ├── types.ts             # API response types
│   ├── setup.ts
│   ├── auth.ts
│   └── projects.ts
└── lib/
    └── utils.ts             # shadcn utils + custom
```

**Estimated:** 1.5-2 hours

---

### 3.4 State Management ✅

**Tasks:**
- [x] Set up TanStack Query provider
- [x] Configure query defaults (staleTime, retry, etc.)
- [x] Create Zustand auth store:
  - `user: User | null`
  - `isAuthenticated: boolean`
  - `isLoading: boolean`
  - `setUser(user)`
  - `clearUser()`
- [x] Create Zustand UI store:
  - `sidebarOpen: boolean`
  - `theme: 'light' | 'dark'`
  - `toggleSidebar()`
  - `setTheme(theme)`
- [x] Set up query invalidation patterns

**Files to create:**
```
frontend/src/
├── store/
│   ├── index.ts
│   ├── authStore.ts
│   └── uiStore.ts
└── providers/
    └── QueryProvider.tsx
```

**Estimated:** 1 hour

---

### 3.5 Auth Hooks & Context ✅

**Tasks:**
- [x] Create `useAuth` hook:
  - `login(email, password)` - mutation
  - `logout()` - mutation
  - `register(data)` - mutation (if enabled)
  - `user` - current user from store
  - `isAuthenticated` - boolean
  - `isLoading` - boolean
- [x] Create `useSetup` hook:
  - `status` - setup status query
  - `complete(data)` - mutation
  - `isInitialized` - boolean
- [x] Create `AuthProvider` component:
  - Check auth status on mount
  - Manage loading state
  - Provide context to children
- [x] Create `ProtectedRoute` component:
  - Redirect to login if not authenticated
  - Show loading state while checking

**Files to create:**
```
frontend/src/
├── hooks/
│   ├── useAuth.ts
│   └── useSetup.ts
├── providers/
│   └── AuthProvider.tsx
└── components/
    └── auth/
        └── ProtectedRoute.tsx
```

**Estimated:** 1.5-2 hours

---

### 3.6 Layout Components ✅

**Tasks:**
- [x] Create `AppLayout` component:
  - Sidebar + main content area
  - Header with user menu
  - Responsive design (collapsible sidebar on mobile)
- [x] Create `Sidebar` component:
  - Navigation links with Phosphor icons
  - Active state highlighting
  - Collapsible on mobile
  - Sections: Home, Projects, My Work, My Calendar
- [x] Create `Header` component:
  - Logo/brand
  - Search placeholder (future)
  - Notification bell (placeholder)
  - User dropdown menu (profile, settings, logout)
- [x] Create `UserMenu` component:
  - Avatar with user initials
  - Dropdown with options
  - Portal-based positioning to avoid layout issues

**Files to create:**
```
frontend/src/components/
├── layout/
│   ├── AppLayout.tsx
│   ├── Sidebar.tsx
│   ├── Header.tsx
│   ├── UserMenu.tsx
│   └── MobileNav.tsx
```

**Estimated:** 2-3 hours

---

### 3.7 Auth Pages ✅

**Tasks:**
- [x] Create `SetupPage`:
  - Check if already initialized (redirect if so)
  - Form: workspace name, admin email, name, password
  - Validation with Zod
  - Success redirects to login
- [x] Create `LoginPage`:
  - Email/password form
  - Validation and error display
  - "Register" link (if registration enabled)
  - Success redirects to home
- [x] Create `RegisterPage`:
  - Only accessible if registration enabled
  - Name, email, password form
  - Validation and error display
  - Success redirects to login

**Files to create:**
```
frontend/src/pages/
├── Setup.tsx
├── Login.tsx
└── Register.tsx
```

**Estimated:** 1.5-2 hours

---

### 3.8 Project Pages ✅

**Tasks:**
- [x] Create `useProjects` hook:
  - `projects` - list query
  - `project(id)` - single query
  - `createProject` - mutation
  - `updateProject` - mutation
  - `deleteProject` - mutation
- [x] Create `ProjectsPage`:
  - Grid/list of project cards
  - "New Project" button
  - Empty state for no projects
  - Loading skeletons
- [x] Create `ProjectCard` component:
  - Project name, client, status badge
  - Owner avatar(s)
  - Click to navigate
- [x] Create `NewProjectDialog`:
  - Form: name, client, status, type
  - Date pickers for start/target end
  - Validation
  - Fixed `asChild` prop support to prevent nested button hydration errors
- [x] Create `ProjectDetailPage`:
  - Project header with name, status
  - Tabs container for sub-pages
  - Placeholder content for each tab

**Files to create:**
```
frontend/src/
├── hooks/
│   └── useProjects.ts
├── api/
│   └── projects.ts (update)
├── pages/
│   ├── Projects.tsx
│   └── ProjectDetail.tsx
└── components/
    └── projects/
        ├── ProjectCard.tsx
        ├── ProjectGrid.tsx
        └── NewProjectDialog.tsx
```

**Estimated:** 2-3 hours

---

### 3.9 Routing Setup ✅

**Tasks:**
- [x] Install React Router DOM
- [x] Configure routes:
  - `/setup` - Setup wizard (uninitialized only)
  - `/login` - Login page
  - `/register` - Register page (if enabled)
  - `/` - Home/Dashboard (protected)
  - `/projects` - Project list (protected)
  - `/projects/:id` - Project detail (protected)
  - `/projects/:id/docs` - Project docs
  - `/projects/:id/tasks` - Project tasks
  - `/projects/:id/timeline` - Project timeline
  - `/projects/:id/schedule` - Project schedule
  - `/projects/:id/whiteboards` - Project whiteboards
  - `/projects/:id/chat` - Project chat
  - `/my-work` - My tasks (protected)
  - `/my-calendar` - My meetings (protected)
  - `/notifications` - Notifications (protected)
  - `/admin` - Admin settings (admin only)
  - `*` - 404 Not Found
- [x] Implement lazy loading for pages
- [x] Create `NotFoundPage`

**Files to create/update:**
```
frontend/src/
├── App.tsx (update with routes)
├── routes.tsx
└── pages/
    └── NotFound.tsx
```

**Estimated:** 1-1.5 hours

---

### Success Criteria ✅ ALL VERIFIED

Phase 3 is complete when ALL of the following are verified:

| # | Criterion | Verification Method | Status |
|---|-----------|---------------------|--------|
| 3.1 | `bun run dev` starts frontend without errors | Manual: Run command, check browser | ✅ |
| 3.2 | Setup page appears on uninitialized database | Manual: Fresh start, visit any route | ✅ |
| 3.3 | Setup form creates admin and redirects to login | Manual: Complete setup flow | ✅ |
| 3.4 | Setup page redirects away after initialization | Manual: Try to visit /setup again | ✅ |
| 3.5 | Login with valid credentials succeeds | Manual: Login as admin | ✅ |
| 3.6 | Login with invalid credentials shows error | Manual: Wrong password | ✅ |
| 3.7 | Protected routes redirect to login when unauthenticated | Manual: Clear cookies, visit /projects | ✅ |
| 3.8 | Logout clears session and redirects to login | Manual: Click logout | ✅ |
| 3.9 | Project list loads and displays projects | Manual: Create project via API, view list | ✅ |
| 3.10 | New project dialog creates project | Manual: Fill form, submit | ✅ |
| 3.11 | Project card navigates to project detail | Manual: Click project card | ✅ |
| 3.12 | Project detail shows tabs (placeholder content OK) | Manual: View project detail page | ✅ |
| 3.13 | Sidebar navigation works correctly | Manual: Click each nav item | ✅ |
| 3.14 | Responsive layout works on mobile | Manual: Resize browser or use devtools | ✅ |
| 3.15 | User menu shows and logout works | Manual: Click avatar, click logout | ✅ |
| 3.16 | Loading skeletons appear while fetching | Manual: Throttle network, observe | ✅ |
| 3.17 | 404 page appears for unknown routes | Manual: Visit /unknown-route | ✅ |
| 3.18 | Dark mode toggle works and persists | Manual: Click theme in UserMenu | ✅ |
| 3.19 | Dark mode respects system preference | Manual: Set system theme, verify | ✅ |
| 3.20 | All component tests pass | Automated: `bun test` | ⏳ |

---

### Testing Strategy

#### Component Tests

**Test Files Created:**
```
frontend/src/
├── hooks/
│   ├── useAuth.test.ts
│   ├── useSetup.test.ts
│   └── useProjects.test.ts
├── components/
│   ├── auth/
│   │   └── ProtectedRoute.test.tsx
│   ├── layout/
│   │   ├── Sidebar.test.tsx
│   │   └── UserMenu.test.tsx
│   └── projects/
│       ├── ProjectCard.test.tsx
│       └── NewProjectDialog.test.tsx
└── pages/
    ├── Login.test.tsx
    ├── Setup.test.tsx
    └── Projects.test.tsx
```

**Technical Improvements Implemented:**

1. **DialogTrigger `asChild` Support**: Fixed nested button hydration errors by implementing `asChild` prop that uses Radix UI's Slot primitive to compose behavior onto child elements without creating nested `<button>` elements.

2. **Portal-based DropdownMenu**: Rewrote dropdown menu to use `ReactDOM.createPortal` for rendering content outside the DOM hierarchy, preventing layout interference with flex containers in the top bar.

3. **Dropdown Improvements**:
   - Dynamic positioning based on trigger's bounding rect
   - Click-outside-to-close functionality
   - Escape key support for closing
   - Proper `asChild` prop support on trigger for flexibility

4. **Dark Mode Support**: Implemented full dark mode with system preference detection:
   - CSS variables for both light and dark themes in `index.css`
   - Theme state management in UI store (`light` | `dark` | `system`)
   - `ThemeProvider` component that syncs theme with DOM and respects system preferences
   - Theme toggle in UserMenu dropdown with visual feedback (Sun/Moon/Monitor icons)

**Test Setup:**
```typescript
// frontend/src/test/setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'bun:test';

afterEach(() => {
  cleanup();
});
```

**Coverage Targets:**
- `hooks/*.ts` - 90%+ coverage
- `components/**/*.tsx` - 80%+ coverage
- `pages/*.tsx` - 70%+ coverage

**Component Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `useAuth.test.ts` | should login successfully | Mock API, verify state update |
| `useAuth.test.ts` | should handle login error | Mock API error, verify error state |
| `useAuth.test.ts` | should logout and clear state | Verify store cleared |
| `ProtectedRoute.test.tsx` | should redirect when unauthenticated | Verify redirect |
| `ProtectedRoute.test.tsx` | should render children when authenticated | Verify content shown |
| `Sidebar.test.tsx` | should render navigation links | Verify all links present |
| `Sidebar.test.tsx` | should highlight active link | Verify active state |
| `ProjectCard.test.tsx` | should display project info | Verify name, status shown |
| `ProjectCard.test.tsx` | should navigate on click | Verify navigation called |
| `NewProjectDialog.test.tsx` | should validate required fields | Submit empty, verify errors |
| `NewProjectDialog.test.tsx` | should submit valid form | Fill form, verify API called |
| `Login.test.tsx` | should submit login form | Fill and submit, verify |
| `Login.test.tsx` | should display validation errors | Invalid input, verify errors |

**Commands:**
```bash
# Run all frontend tests
cd frontend && bun test

# Run specific test file
bun test src/hooks/useAuth.test.ts

# Run tests with coverage
bun test --coverage

# Run tests in watch mode
bun test --watch
```

---

#### E2E Tests (Optional)

If Playwright is configured:

**Test Files:**
```
frontend/e2e/
├── setup.spec.ts
├── auth.spec.ts
└── projects.spec.ts
```

**E2E Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `setup.spec.ts` | complete setup flow | Full wizard completion |
| `auth.spec.ts` | login and logout flow | Full auth cycle |
| `auth.spec.ts` | protected route redirect | Verify redirect behavior |
| `projects.spec.ts` | create and view project | Full project lifecycle |

**Commands:**
```bash
# Run E2E tests
bunx playwright test

# Run with UI
bunx playwright test --ui
```

---

#### Manual Verification Checklist ✅ ALL VERIFIED

**Setup Flow:**
- [x] Start with fresh/empty database
- [x] Visit any URL - redirected to /setup
- [x] Fill setup form with valid data
- [x] Submit - redirected to /login
- [x] Visit /setup again - redirected away

**Authentication Flow:**
- [x] Login with admin credentials - success
- [x] Invalid password - error message shown
- [x] Empty fields - validation errors shown
- [x] After login - redirected to home/dashboard
- [x] Refresh page - still logged in
- [x] Click logout - redirected to login
- [x] After logout - cannot access protected routes

**Navigation:**
- [x] Sidebar links navigate correctly
- [x] Active link is highlighted
- [x] Mobile: hamburger menu works
- [x] Mobile: sidebar collapses/expands
- [x] User menu opens on click
- [x] User menu closes on outside click or Escape key

**Projects:**
- [x] Project list loads with skeletons
- [x] Projects display in grid/list
- [x] Empty state shown when no projects
- [x] "New Project" opens dialog
- [x] Form validation works
- [x] Create project - appears in list
- [x] Click project - navigates to detail
- [x] Project detail shows tabs

**Visual/UX:**
- [x] Stone color theme applied correctly
- [x] Phosphor icons display correctly
- [x] Inter font loaded
- [x] Buttons have hover states
- [x] Form inputs have focus states
- [x] Toast notifications appear
- [x] Loading states are smooth
- [x] Dark mode toggle works in UserMenu
- [x] Dark mode respects system preference when set to "System"
- [x] Dark mode colors applied correctly across all components

---

### Dependencies

**Production:**
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x",
    "@tanstack/react-query": "^5.x",
    "zustand": "^4.x",
    "@phosphor-icons/react": "^2.x",
    "zod": "^3.x",
    "class-variance-authority": "^0.7.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x"
  }
}
```

**Development:**
```json
{
  "devDependencies": {
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x",
    "@vitejs/plugin-react": "^4.x",
    "vite": "^5.x",
    "typescript": "^5.x",
    "tailwindcss": "^3.x",
    "postcss": "^8.x",
    "autoprefixer": "^10.x",
    "@testing-library/react": "^14.x",
    "@testing-library/jest-dom": "^6.x"
  }
}
```

---

### Estimated Timeline

| Task | Hours | Cumulative |
|------|-------|------------|
| 3.1 Project Scaffolding | 1-1.5 | 1-1.5 |
| 3.2 shadcn/ui Core Components | 0.5-0.75 | 1.5-2.25 |
| 3.3 API Client Layer | 1.5-2 | 3-4.25 |
| 3.4 State Management | 1 | 4-5.25 |
| 3.5 Auth Hooks & Context | 1.5-2 | 5.5-7.25 |
| 3.6 Layout Components | 2-3 | 7.5-10.25 |
| 3.7 Auth Pages | 1.5-2 | 9-12.25 |
| 3.8 Project Pages | 2-3 | 11-15.25 |
| 3.9 Routing Setup | 1-1.5 | 12-16.75 |
| Testing & Verification | 1.5-2 | **13.5-18.75** |

**Actual Timeline:** Completed within estimated range with additional time spent on component refinements (DialogTrigger asChild support, portal-based dropdown menu).

---

*Continue to [Phase 4: Feature Completion](#phase-4-feature-completion) after all Phase 3 criteria are met.*

---

## Phase 4: Feature Completion (IN PROGRESS)

### Overview

This phase completes the full feature set: Documents UI with BlockNote editor, Tasks UI with Kanban board, Timeline view, Meetings/Calendar, and Whiteboards with Excalidraw. This is the largest phase and represents the core user-facing functionality.

**Estimated Effort:** 20-28 hours
**Status:** 🔄 In Progress (4.1-4.5 complete, 4.3 includes real-time collaboration)

**Prerequisites:** Phase 3 complete with frontend foundation working.

---

### 4.1 Docs UI - List & Navigation ✅

**Tasks:**
- [x] Create `useDocs` hook:
  - `docs(projectId)` - list docs in project
  - `personalDocs()` - list personal docs
  - `doc(id)` - single doc query
  - `createDoc` - mutation
  - `updateDoc` - mutation
  - `deleteDoc` - mutation
- [x] Create API functions for docs
- [x] Create `DocList` component:
  - Tree view for nested docs
  - Expand/collapse folders
  - Doc type indicators (doc vs database)
- [x] Create `DocTreeItem` component:
  - Title, icon, indent level
  - Click to navigate
  - Context menu (rename, delete)
- [x] Create `NewDocDialog`:
  - Title input
  - Doc type selector (doc/database)
  - Parent selector (optional)
- [x] Add docs tab to project detail page

**Files created:**
```
frontend/src/
├── api/
│   └── docs.ts
├── hooks/
│   └── use-docs.ts
├── pages/
│   └── project-docs.tsx (via project detail tabs)
└── components/
    └── docs/
        ├── doc-list.tsx
        ├── doc-tree-item.tsx
        └── new-doc-dialog.tsx
```

**Estimated:** 2-2.5 hours

---

### 4.2 Docs UI - BlockNote Editor ✅

**Tasks:**
- [x] Install BlockNote packages (`@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`)
- [x] Create `DocPage` component:
  - Load doc content
  - Display title (editable inline)
  - BlockNote editor for content
- [x] Create `BlockNoteEditor` wrapper:
  - Configure BlockNote with shadcn UI
  - Handle JSON content serialization
  - **Added:** Real-time collaboration with Yjs (see 4.3)
- [x] Implement autosave with debounce (500ms):
  - Track dirty state
  - Save on blur or after debounce
  - Show save indicator
  - **Updated:** Now handled via Yjs collaboration layer
- [x] Create `DocToolbar` component:
  - Breadcrumb navigation
  - Save status indicator
  - Delete button
  - Share/export (future)

**Files created:**
```
frontend/src/
├── pages/
│   └── doc-page.tsx
├── components/
│   └── docs/
│       ├── block-note-editor.tsx
│       └── doc-toolbar.tsx
└── hooks/
    └── use-debounce.ts
```

**Estimated:** 3-4 hours

---

### 4.3 Docs UI - Database View & Real-Time Collaboration ✅

**Tasks:**
- [x] Create `DatabaseView` component:
  - Table layout with columns from schema
  - Rows are child docs with properties
  - Inline editing of property values
- [x] Create `PropertyCell` component:
  - Render based on property type (text, number, date, select, etc.)
  - Inline edit mode
  - Validation per type
- [x] Create `SchemaEditor` dialog:
  - Add/remove/reorder columns
  - Set property types
  - Set column width
- [x] Create "New Row" functionality:
  - Add row button
  - Create child doc with properties
- [x] Support property types:
  - Text (string)
  - Number
  - Date
  - Select (single choice)
  - Multi-select
  - Checkbox (boolean)
  - URL
- [x] **Real-Time Collaboration with Yjs:**
  - WebSocket-based real-time sync for doc editing
  - Live cursors with user names (Google Docs/Notion style)
  - Backend collab hub for managing doc rooms and presence
  - Yjs CRDT for conflict-free editing
  - Database snapshots and incremental updates stored in PostgreSQL
  - Reconnection handling with hasOpened guard

**Files created:**
```
frontend/src/components/docs/
├── database-view.tsx
├── property-cell.tsx
├── schema-editor.tsx
├── property-type-selector.tsx
├── properties-panel.tsx
└── new-row-button.tsx

frontend/src/hooks/
└── use-doc-collaboration.ts

backend/src/
├── collab/
│   └── hub.ts
├── repositories/
│   └── docCollab.ts
├── routes/
│   └── collab.ts
├── websocket.ts
└── db/migrations/
    └── 0005_doc_collab.sql
```

**Estimated:** 4-5 hours (actual: ~6 hours including real-time collaboration)

---

### 4.4 Tasks UI - Kanban Board ✅

**Tasks:**
- [x] Install dnd-kit packages (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- [x] Create `useTasks` hook:
  - `tasks(projectId, filters?)` - list tasks
  - `myTasks()` - user's tasks across projects
  - `task(id)` - single task
  - `createTask` - mutation
  - `updateTask` - mutation
  - `updateTaskStatus` - mutation
  - `updateTaskOrder` - mutation
  - `deleteTask` - mutation
- [x] Create API functions for tasks
- [x] Create `KanbanBoard` component:
  - Columns from task statuses
  - DnD context provider
  - Handle drag end (update status/order)
- [x] Create `KanbanColumn` component:
  - Status header with color
  - Droppable area
  - Task count badge
  - "Add task" button
- [x] Create `TaskCard` component:
  - Draggable wrapper
  - Title, assignee avatars
  - Due date badge (with overdue styling)
  - Click to open detail
- [x] Create `AddTaskForm` component:
  - Inline form in column
  - Quick add (title only)
  - Enter to submit, Escape to cancel

**Files to create:**
```
frontend/src/
├── api/
│   └── tasks.ts
├── hooks/
│   └── useTasks.ts
├── pages/
│   └── ProjectTasks.tsx
└── components/
    └── tasks/
        ├── KanbanBoard.tsx
        ├── KanbanColumn.tsx
        ├── TaskCard.tsx
        └── AddTaskForm.tsx
```

**Estimated:** 4-5 hours

---

### 4.5 Tasks UI - Task Detail ✅

**Tasks:**
- [x] Create `TaskDetailDialog` component:
  - Full task view in dialog/drawer
  - Editable title
  - Description with markdown editor
  - Status dropdown
  - Assignee picker (multi-select)
  - Date pickers (start date, due date)
  - Delete action with confirmation
- [x] Create `AssigneePicker` component:
  - Search/filter project members
  - Multi-select with avatars
  - Clear selection option
- [x] Use native date inputs for start/due dates
- [x] Add task detail route or handle via URL param

**Files to create:**
```
frontend/src/components/
├── tasks/
│   ├── TaskDetailDialog.tsx
│   └── AssigneePicker.tsx
└── common/
    └── DatePicker.tsx
```

**Estimated:** 2-3 hours

---

### 4.6 Timeline View

**Tasks:**
- [ ] Install timeline library (or build custom):
  - Consider: `frappe-gantt`, `react-calendar-timeline`, or custom
- [ ] Create `ProjectTimeline` page:
  - Load tasks with dates
  - Filter by status/assignee
  - Date range navigation
- [ ] Create `TimelineView` component:
  - Horizontal timeline with date headers
  - Tasks as bars (start to due date)
  - Tasks with only due date as milestones
  - Color coding by status
- [ ] Create `TimelineBar` component:
  - Task title tooltip
  - Click to open task detail
  - Drag to resize (optional v1)
- [ ] Create `TimelineFilters` component:
  - Status filter (multi-select)
  - Assignee filter
  - Date range selector (week/month/quarter)

**Files to create:**
```
frontend/src/
├── pages/
│   └── ProjectTimeline.tsx
└── components/
    └── timeline/
        ├── TimelineView.tsx
        ├── TimelineBar.tsx
        ├── TimelineHeader.tsx
        └── TimelineFilters.tsx
```

**Estimated:** 4-5 hours

---

### 4.7 Meetings Backend

**Tasks:**
- [ ] Add meetings table to database schema:
  - `id`, `project_id`, `title`
  - `start_time`, `end_time` (timestamps)
  - `location` (string, optional)
  - `notes_md` (text)
  - `created_by`, `created_at`, `updated_at`
- [ ] Add meeting_attendees junction table:
  - `meeting_id`, `user_id`
  - `responded` (boolean), `response` (accepted/declined/tentative)
- [ ] Generate migration
- [ ] Create MeetingRepository:
  - CRUD operations
  - `findByProjectId(projectId)`
  - `findByAttendee(userId)` - for "My Calendar"
  - `findInDateRange(start, end)`
- [ ] Create MeetingService
- [ ] Create meeting routes:
  - `GET /api/v1/projects/:id/meetings`
  - `POST /api/v1/projects/:id/meetings`
  - `GET /api/v1/meetings/:id`
  - `PATCH /api/v1/meetings/:id`
  - `DELETE /api/v1/meetings/:id`
  - `GET /api/v1/meetings/my` - user's meetings

**Files to create:**
```
backend/src/
├── db/migrations/
│   └── 0004_meetings.sql
├── repositories/
│   ├── meeting.ts
│   └── meetingAttendee.ts
├── services/
│   └── meeting.ts
└── routes/
    └── meetings.ts
```

**Estimated:** 2-2.5 hours

---

### 4.8 Meetings UI - Calendar

**Tasks:**
- [ ] Install FullCalendar packages:
  - `@fullcalendar/react`
  - `@fullcalendar/core`
  - `@fullcalendar/daygrid`
  - `@fullcalendar/timegrid`
  - `@fullcalendar/interaction`
- [ ] Create `useMeetings` hook:
  - `meetings(projectId)` - project meetings
  - `myMeetings()` - user's meetings
  - `meeting(id)` - single meeting
  - `createMeeting` - mutation
  - `updateMeeting` - mutation
  - `deleteMeeting` - mutation
- [ ] Create API functions for meetings
- [ ] Create `ProjectSchedule` page:
  - Calendar view of project meetings
  - Create meeting by clicking date
- [ ] Create `MyCalendar` page:
  - All user's meetings across projects
  - Project badges on events
- [ ] Create `CalendarView` component:
  - FullCalendar wrapper
  - Day/week/month view toggles
  - Event click to open detail
- [ ] Create `MeetingDialog` component:
  - Create/edit meeting form
  - Title, date/time pickers
  - Attendee selector
  - Location field
  - Notes editor
- [ ] Create `MeetingDetail` component:
  - View meeting details
  - RSVP functionality (optional v1)

**Files to create:**
```
frontend/src/
├── api/
│   └── meetings.ts
├── hooks/
│   └── useMeetings.ts
├── pages/
│   ├── ProjectSchedule.tsx
│   └── MyCalendar.tsx
└── components/
    └── calendar/
        ├── CalendarView.tsx
        ├── MeetingDialog.tsx
        └── MeetingDetail.tsx
```

**Estimated:** 3-4 hours

---

### 4.9 Whiteboards Backend

**Tasks:**
- [ ] Add whiteboards table to database schema:
  - `id`, `project_id`, `name`
  - `data` (JSONB - Excalidraw scene)
  - `created_by`, `created_at`, `updated_at`
- [ ] Generate migration
- [ ] Create WhiteboardRepository:
  - CRUD operations
  - `findByProjectId(projectId)`
- [ ] Create WhiteboardService
- [ ] Create whiteboard routes:
  - `GET /api/v1/projects/:id/whiteboards`
  - `POST /api/v1/projects/:id/whiteboards`
  - `GET /api/v1/whiteboards/:id`
  - `PATCH /api/v1/whiteboards/:id`
  - `DELETE /api/v1/whiteboards/:id`

**Files to create:**
```
backend/src/
├── db/migrations/
│   └── 0005_whiteboards.sql
├── repositories/
│   └── whiteboard.ts
├── services/
│   └── whiteboard.ts
└── routes/
    └── whiteboards.ts
```

**Estimated:** 1.5-2 hours

---

### 4.10 Whiteboards UI

**Tasks:**
- [ ] Install Excalidraw: `@excalidraw/excalidraw`
- [ ] Create `useWhiteboards` hook:
  - `whiteboards(projectId)` - list whiteboards
  - `whiteboard(id)` - single whiteboard
  - `createWhiteboard` - mutation
  - `updateWhiteboard` - mutation
  - `deleteWhiteboard` - mutation
- [ ] Create API functions for whiteboards
- [ ] Create `ProjectWhiteboards` page:
  - Grid of whiteboard cards
  - "New Whiteboard" button
  - Preview thumbnails (if feasible)
- [ ] Create `WhiteboardCard` component:
  - Name, created date
  - Preview image (optional)
  - Click to open editor
- [ ] Create `WhiteboardEditor` page:
  - Full Excalidraw component
  - Autosave with debounce
  - Save indicator
  - Back navigation
- [x] Restore Excalidraw files cache on load to avoid image placeholders
- [ ] Create `WhiteboardEmbed` component:
  - Embed whiteboard in docs
  - Preview card with "Open" button
  - Read-only preview (optional)
- [ ] Add export functionality:
  - Export to PNG
  - Export to SVG
  - Download button in editor

**Files to create:**
```
frontend/src/
├── api/
│   └── whiteboards.ts
├── hooks/
│   └── useWhiteboards.ts
├── pages/
│   ├── ProjectWhiteboards.tsx
│   └── WhiteboardEditor.tsx
└── components/
    └── whiteboard/
        ├── WhiteboardCard.tsx
        ├── WhiteboardEmbed.tsx
        └── ExportMenu.tsx
```

**Estimated:** 3-4 hours

---

### Success Criteria

Phase 4 is complete when ALL of the following are verified:

| # | Criterion | Verification Method | Status |
|---|-----------|---------------------|--------|
| 4.1 | Docs list displays in project with tree structure | Manual: View project docs tab | ✅ |
| 4.2 | New doc can be created in project | Manual: Create doc via dialog | ✅ |
| 4.3 | BlockNote editor loads and saves content | Manual: Edit doc, refresh, verify | ✅ |
| 4.4 | Autosave works with debounce | Manual: Edit, wait, check save indicator | ✅ |
| 4.5 | Database docs show table view | Manual: Create database doc, view | ✅ |
| 4.6 | Database properties can be edited inline | Manual: Click cell, edit, save | ✅ |
| 4.7 | Database schema can be modified | Manual: Add/remove columns | ✅ |
| 4.8 | Kanban board displays with columns | Manual: View project tasks tab | ✅ |
| 4.9 | Tasks can be dragged between columns | Manual: Drag task, verify status update | ✅ |
| 4.10 | Task detail dialog shows all fields | Manual: Click task, view dialog | ✅ |
| 4.11 | Task can be created via quick add | Manual: Type in column, press enter | ✅ |
| 4.12 | Timeline view displays tasks with dates | Manual: View timeline tab | ⏳ |
| 4.13 | Timeline filters work correctly | Manual: Filter by status/assignee | ⏳ |
| 4.14 | Meetings can be created in project | Manual: Create meeting in calendar | ⏳ |
| 4.15 | Calendar shows meetings in day/week/month | Manual: Toggle views | ⏳ |
| 4.16 | "My Calendar" shows user's meetings | Manual: View my calendar page | ⏳ |
| 4.17 | Whiteboards list displays in project | Manual: View whiteboards tab | ⏳ |
| 4.18 | Excalidraw editor loads and saves (including images) | Manual: Draw, save, refresh | ✅ |
| 4.19 | Whiteboard autosave works | Manual: Draw, wait, verify saved | ⏳ |
| 4.20 | Whiteboard can be exported to PNG/SVG | Manual: Use export menu | ⏳ |
| 4.21 | All component tests pass | Automated: `bun test` | ⏳ |
| 4.22 | **Real-time collaboration syncs edits** | Manual: Open doc in 2 browsers, edit | ✅ |
| 4.23 | **Live cursors show collaborator names** | Manual: Edit simultaneously, see cursors | ✅ |

---

### Testing Strategy

#### Component Tests

**Test Files to Create:**
```
frontend/src/
├── hooks/
│   ├── useDocs.test.ts
│   ├── use-debounce.test.tsx
│   ├── useTasks.test.ts
│   ├── useMeetings.test.ts
│   └── useWhiteboards.test.ts
├── components/
│   ├── docs/
│   │   ├── DocList.test.tsx
│   │   ├── BlockNoteEditor.test.tsx
│   │   ├── DocToolbar.test.tsx
│   │   └── DatabaseView.test.tsx
│   ├── tasks/
│   │   ├── KanbanBoard.test.tsx
│   │   ├── TaskCard.test.tsx
│   │   └── TaskDetailDialog.test.tsx
│   ├── calendar/
│   │   ├── CalendarView.test.tsx
│   │   └── MeetingDialog.test.tsx
│   └── whiteboard/
│       └── WhiteboardCard.test.tsx
```

**Coverage Targets:**
- `hooks/*.ts` - 85%+ coverage
- `components/**/*.tsx` - 75%+ coverage

**Component Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `DocList.test.tsx` | should render docs tree | Verify hierarchy renders |
| `DocList.test.tsx` | should expand/collapse folders | Verify toggle works |
| `BlockNoteEditor.test.tsx` | should load content | Verify content displayed |
| `BlockNoteEditor.test.tsx` | should call onChange | Verify change callback |
| `DocToolbar.test.tsx` | should render breadcrumb | Verify title and path shown |
| `DocToolbar.test.tsx` | should confirm delete | Verify delete flow |
| `use-debounce.test.tsx` | should delay updates | Verify debounced value timing |
| `DatabaseView.test.tsx` | should render columns from schema | Verify table headers |
| `DatabaseView.test.tsx` | should render rows as docs | Verify data rows |
| `KanbanBoard.test.tsx` | should render columns | Verify status columns |
| `KanbanBoard.test.tsx` | should handle drag end | Verify status update |
| `TaskCard.test.tsx` | should display task info | Verify title, assignees |
| `TaskCard.test.tsx` | should show overdue badge | Verify date styling |
| `TaskDetailDialog.test.tsx` | should load task data | Verify fields populated |
| `TaskDetailDialog.test.tsx` | should update on save | Verify mutation called |
| `CalendarView.test.tsx` | should render events | Verify meetings shown |
| `CalendarView.test.tsx` | should handle view change | Verify day/week/month |
| `MeetingDialog.test.tsx` | should validate form | Verify required fields |

**Commands:**
```bash
# Run Phase 4 component tests
bun test src/components/docs/
bun test src/components/tasks/
bun test src/components/calendar/
bun test src/components/whiteboard/
```

---

#### Integration Tests (Backend)

**Test Files to Create:**
```
backend/src/routes/
├── meetings.integration.test.ts
└── whiteboards.integration.test.ts
```

**Integration Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `meetings.integration.test.ts` | Meeting CRUD | Create/read/update/delete |
| `meetings.integration.test.ts` | Attendee management | Add/remove attendees |
| `meetings.integration.test.ts` | GET /meetings/my | Cross-project query |
| `whiteboards.integration.test.ts` | Whiteboard CRUD | Create/read/update/delete |
| `whiteboards.integration.test.ts` | JSONB data storage | Excalidraw scene saved |

---

#### Manual Verification Checklist

**Documents:**
- [x] Create doc in project - appears in list
- [x] Create nested doc (with parent) - hierarchy shown
- [x] Edit doc content - BlockNote editor works
- [x] Save and refresh - content persists
- [x] Autosave triggers after typing stops (via Yjs collaboration)
- [x] Create database doc - table view shown
- [x] Add column to database - appears in table
- [x] Edit cell value - saves correctly
- [x] Delete doc - removed from list
- [x] **Real-time sync** - edits appear in other browsers instantly
- [x] **Live cursors** - collaborator names shown above cursors

**Tasks/Kanban:**
- [x] View kanban board - columns for each status
- [x] Drag task to different column - status updates
- [x] Drag task within column - order updates
- [x] Quick add task - appears in column
- [x] Click task - detail dialog opens
- [x] Edit task in dialog - changes save
- [x] Add assignee - avatar appears on card
- [x] Set due date - badge appears on card
- [x] Overdue task shows warning styling

**Timeline:**
- [ ] View timeline - tasks with dates shown
- [ ] Task bar spans start to due date
- [ ] Due-only task shows as milestone
- [ ] Filter by status - tasks filtered
- [ ] Filter by assignee - tasks filtered
- [ ] Click task bar - detail opens
- [ ] Navigate date range - view updates

**Meetings/Calendar:**
- [ ] View project schedule - calendar appears
- [ ] Create meeting - appears on calendar
- [ ] Click meeting - detail dialog opens
- [ ] Edit meeting - changes save
- [ ] Delete meeting - removed from calendar
- [ ] View "My Calendar" - shows meetings from all projects
- [ ] Toggle day/week/month views

**Whiteboards:**
- [ ] View whiteboards list - cards shown
- [ ] Create whiteboard - appears in list
- [ ] Open whiteboard - Excalidraw loads
- [ ] Draw shapes - appear on canvas
- [ ] Autosave triggers - save indicator shows
- [ ] Refresh page - drawing persists
- [ ] Export to PNG - file downloads
- [ ] Export to SVG - file downloads
- [ ] Delete whiteboard - removed from list

---

### Database Migrations

**Migration 0004_meetings.sql:**
```sql
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  location VARCHAR(255),
  notes_md TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE meeting_attendees (
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  responded BOOLEAN DEFAULT FALSE,
  response VARCHAR(20) DEFAULT 'pending',
  PRIMARY KEY (meeting_id, user_id)
);

CREATE INDEX idx_meetings_project ON meetings(project_id);
CREATE INDEX idx_meetings_start ON meetings(start_time);
CREATE INDEX idx_meeting_attendees_user ON meeting_attendees(user_id);
```

**Migration 0005_whiteboards.sql:**
```sql
CREATE TABLE whiteboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  data JSONB DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_whiteboards_project ON whiteboards(project_id);
```

---

### Dependencies (Additional)

**Frontend:**
```json
{
  "dependencies": {
    "@blocknote/core": "^0.12.x",
    "@blocknote/react": "^0.12.x",
    "@blocknote/mantine": "^0.12.x",
    "@dnd-kit/core": "^6.x",
    "@dnd-kit/sortable": "^8.x",
    "@dnd-kit/utilities": "^3.x",
    "@fullcalendar/react": "^6.x",
    "@fullcalendar/core": "^6.x",
    "@fullcalendar/daygrid": "^6.x",
    "@fullcalendar/timegrid": "^6.x",
    "@fullcalendar/interaction": "^6.x",
    "@excalidraw/excalidraw": "^0.17.x"
  }
}
```

---

### Estimated Timeline

| Task | Hours | Cumulative |
|------|-------|------------|
| 4.1 Docs UI - List & Navigation | 2-2.5 | 2-2.5 |
| 4.2 Docs UI - BlockNote Editor | 3-4 | 5-6.5 |
| 4.3 Docs UI - Database View | 4-5 | 9-11.5 |
| 4.4 Tasks UI - Kanban Board | 4-5 | 13-16.5 |
| 4.5 Tasks UI - Task Detail | 2-3 | 15-19.5 |
| 4.6 Timeline View | 4-5 | 19-24.5 |
| 4.7 Meetings Backend | 2-2.5 | 21-27 |
| 4.8 Meetings UI - Calendar | 3-4 | 24-31 |
| 4.9 Whiteboards Backend | 1.5-2 | 25.5-33 |
| 4.10 Whiteboards UI | 3-4 | 28.5-37 |
| Testing & Verification | 2-3 | **30.5-40** |

**Note:** This is the largest phase. Consider splitting into sub-phases if needed.

---

*Continue to [Phase 5: Real-time & Polish](#phase-5-real-time--polish) after all Phase 4 criteria are met.*

---

## Phase 5: Real-time & Polish

### Overview

This phase adds real-time features (WebSocket for chat and notifications), completes the dashboard and admin UI, and polishes the overall user experience with loading states, error handling, and accessibility improvements.

**Estimated Effort:** 16-22 hours

**Prerequisites:** Phase 4 complete with all features functional.

---

### 5.1 WebSocket Infrastructure (Backend)

**Tasks:**
- [ ] Create WebSocket hub (connection manager):
  - Track connected clients by user ID
  - Support multiple connections per user (different tabs)
  - Handle connection/disconnection lifecycle
- [ ] Create WebSocket client handler:
  - Authenticate via session cookie or token
  - Parse incoming messages
  - Route to appropriate handlers
- [ ] Define event types:
  - `subscribe` / `unsubscribe` - channel subscription
  - `message` - new chat message
  - `typing` - typing indicator
  - `notification` - new notification
  - `presence` - online users (optional v1)
- [ ] Implement pub/sub for channels:
  - Subscribe user to channels on connect
  - Broadcast messages to channel subscribers
  - Handle user permissions per channel
- [ ] Add WebSocket route: `GET /api/v1/ws`

**Files to create:**
```
backend/src/websocket/
├── hub.ts              # Connection manager singleton
├── client.ts           # Per-connection handler
├── events.ts           # Event type definitions
├── handlers.ts         # Message handlers
└── index.ts            # WebSocket route setup
```

**Estimated:** 3-4 hours

---

### 5.2 Chat Backend

**Tasks:**
- [ ] Add chat tables to database schema:
  - **channels:** id, project_id (nullable), name, type (workspace/project), created_at
  - **messages:** id, channel_id, user_id, content, mentions (array), created_at, updated_at
  - **channel_members:** channel_id, user_id, last_read_at, joined_at
- [ ] Generate migration
- [ ] Seed default workspace channel ("Town Square")
- [ ] Create ChannelRepository:
  - `findById(id)`
  - `findByProjectId(projectId)`
  - `findWorkspaceChannels()`
  - `findUserChannels(userId)` - channels user can access
  - `create(data)`, `update(id, data)`, `delete(id)`
- [ ] Create MessageRepository:
  - `findByChannelId(channelId, { before, limit })`
  - `create(data)`, `update(id, data)`, `delete(id)`
  - `searchMentions(userId)` - messages mentioning user
- [ ] Create ChannelMemberRepository:
  - `findByChannelId(channelId)`
  - `join(channelId, userId)`
  - `leave(channelId, userId)`
  - `updateLastRead(channelId, userId)`
- [ ] Create ChatService:
  - Mention parsing (`@username`)
  - Permission checks (project membership)
  - Broadcast via WebSocket hub
- [ ] Create chat routes:
  - `GET /api/v1/channels` - user's channels
  - `POST /api/v1/channels` - create channel
  - `GET /api/v1/channels/:id/messages` - paginated messages
  - `POST /api/v1/channels/:id/messages` - send message
  - `PATCH /api/v1/channels/:id/read` - mark as read

**Files to create:**
```
backend/src/
├── db/migrations/
│   └── 0006_chat.sql
├── repositories/
│   ├── channel.ts
│   ├── message.ts
│   └── channelMember.ts
├── services/
│   └── chat.ts
└── routes/
    └── chat.ts
```

**Estimated:** 3-4 hours

---

### 5.3 Chat Frontend

**Tasks:**
- [ ] Create WebSocket connection manager:
  - Connect on login
  - Reconnect on disconnect
  - Handle authentication
  - Parse and dispatch events
- [ ] Create `useWebSocket` hook:
  - Connection state
  - Send message function
  - Subscribe/unsubscribe functions
- [ ] Create `useChat` hook:
  - `channels` - list query
  - `messages(channelId)` - infinite query (load older)
  - `sendMessage` - mutation + optimistic update
  - `markAsRead` - mutation
  - Real-time message updates
- [ ] Create API functions for chat
- [ ] Create `ProjectChat` page:
  - Channel list sidebar
  - Message list main area
  - Message input at bottom
- [ ] Create `ChannelList` component:
  - Workspace channels section
  - Project channels section
  - Unread badges
  - Active channel highlight
- [ ] Create `MessageList` component:
  - Infinite scroll (load older on scroll up)
  - Message grouping by sender/time
  - Date separators
  - Auto-scroll on new messages
- [ ] Create `MessageItem` component:
  - Avatar, username, timestamp
  - Message content (with markdown)
  - Mention highlighting
- [ ] Create `MessageInput` component:
  - Text input with submit
  - `@mention` autocomplete
  - Enter to send, Shift+Enter for newline
- [ ] Create `MentionAutocomplete` component:
  - Trigger on `@`
  - Filter users as typing
  - Insert mention on select
- [ ] Create `TypingIndicator` component:
  - Show who is typing
  - Debounced updates

**Files to create:**
```
frontend/src/
├── api/
│   ├── websocket.ts
│   └── chat.ts
├── hooks/
│   ├── useWebSocket.ts
│   └── useChat.ts
├── pages/
│   └── ProjectChat.tsx
└── components/
    └── chat/
        ├── ChannelList.tsx
        ├── MessageList.tsx
        ├── MessageItem.tsx
        ├── MessageInput.tsx
        ├── MentionAutocomplete.tsx
        └── TypingIndicator.tsx
```

**Estimated:** 4-5 hours

---

### 5.4 Notifications Backend

**Tasks:**
- [ ] Add notifications table to database schema:
  - `id`, `user_id`, `type` (enum)
  - `title`, `body`, `link`
  - `read` (boolean), `created_at`
- [ ] Generate migration
- [ ] Define notification types:
  - `mention` - @mentioned in chat
  - `assignment` - assigned to task
  - `meeting_invite` - invited to meeting
  - `project_invite` - added to project
- [ ] Create NotificationRepository:
  - `findByUserId(userId, { unreadOnly, limit })`
  - `create(data)`
  - `markAsRead(id)`
  - `markAllAsRead(userId)`
  - `delete(id)`
- [ ] Create NotificationService:
  - `notify(userId, type, data)` - create + broadcast
  - Hook into chat (on mention)
  - Hook into tasks (on assignment)
  - Hook into meetings (on invite)
  - Hook into projects (on membership)
- [ ] Create notification routes:
  - `GET /api/v1/notifications` - user's notifications
  - `PATCH /api/v1/notifications/:id/read` - mark as read
  - `POST /api/v1/notifications/read-all` - mark all as read

**Files to create:**
```
backend/src/
├── db/migrations/
│   └── 0007_notifications.sql
├── repositories/
│   └── notification.ts
├── services/
│   └── notification.ts
└── routes/
    └── notifications.ts
```

**Estimated:** 2-3 hours

---

### 5.5 Notifications Frontend

**Tasks:**
- [ ] Create `useNotifications` hook:
  - `notifications` - list query
  - `unreadCount` - derived
  - `markAsRead` - mutation
  - `markAllAsRead` - mutation
  - Real-time updates via WebSocket
- [ ] Create API functions for notifications
- [ ] Create `NotificationBell` component:
  - Bell icon with unread count badge
  - Click to open panel
- [ ] Create `NotificationPanel` component:
  - Dropdown/popover from bell
  - List of recent notifications
  - "Mark all as read" button
  - "View all" link
- [ ] Create `NotificationItem` component:
  - Icon based on type
  - Title, body, timestamp
  - Unread indicator
  - Click to navigate + mark read
- [ ] Create `NotificationsPage`:
  - Full list of notifications
  - Filter by type (optional)
  - Pagination
- [ ] Integrate notifications with WebSocket:
  - Listen for `notification` events
  - Update query cache on new notification
  - Show toast for important notifications

**Files to create:**
```
frontend/src/
├── api/
│   └── notifications.ts
├── hooks/
│   └── useNotifications.ts
├── pages/
│   └── Notifications.tsx
└── components/
    └── notifications/
        ├── NotificationBell.tsx
        ├── NotificationPanel.tsx
        └── NotificationItem.tsx
```

**Estimated:** 2-3 hours

---

### 5.6 Home Dashboard

**Tasks:**
- [ ] Create `HomePage` (dashboard):
  - Welcome message with user name
  - Quick stats overview
  - Recent activity feed
- [ ] Create `RecentActivity` component:
  - Recent docs edited
  - Recent tasks updated
  - Recent messages (optional)
- [ ] Create `UpcomingMeetings` component:
  - Meetings in next 7 days
  - Quick view with time/project
  - Click to view details
- [ ] Create `TasksDueSoon` component:
  - Tasks due in next 7 days
  - Grouped by due date
  - Status indicators
- [ ] Create `QuickLinks` component:
  - Recent projects
  - Pinned items (optional v1)
- [ ] Add dashboard API endpoint (optional):
  - `GET /api/v1/dashboard` - aggregated data

**Files to create:**
```
frontend/src/
├── pages/
│   └── Home.tsx
└── components/
    └── dashboard/
        ├── RecentActivity.tsx
        ├── UpcomingMeetings.tsx
        ├── TasksDueSoon.tsx
        └── QuickLinks.tsx
```

**Estimated:** 2-3 hours

---

### 5.7 My Work Page

**Tasks:**
- [ ] Create `MyWorkPage`:
  - All tasks assigned to user
  - Across all projects
- [ ] Create `TaskGroupList` component:
  - Group by project or status
  - Toggle grouping mode
  - Expandable groups
- [ ] Create `TaskFilters` component:
  - Filter by status
  - Filter by project
  - Filter by date range
  - Sort options
- [ ] Create `TaskListItem` component:
  - Task title, project badge
  - Status indicator
  - Due date
  - Quick status update

**Files to create:**
```
frontend/src/
├── pages/
│   └── MyWork.tsx
└── components/
    └── mywork/
        ├── TaskGroupList.tsx
        ├── TaskFilters.tsx
        └── TaskListItem.tsx
```

**Estimated:** 2 hours

---

### 5.8 Admin UI

**Tasks:**
- [ ] Create `AdminPage` layout:
  - Admin sidebar navigation
  - Protected by admin role
- [ ] Create `UserManagement` component:
  - List all users
  - Invite new user (email)
  - Disable/enable user
  - Change user role
- [ ] Create `InviteUserDialog`:
  - Email input
  - Role selector
  - Send invite (creates user with temp password or invite link)
- [ ] Create `WorkspaceSettings` component:
  - Workspace name
  - Allow registration toggle
  - Session duration
  - Save settings
- [ ] Create `StatusManager` component:
  - Manage project statuses
  - Manage task statuses
  - Add/edit/delete/reorder
  - Color picker
- [ ] Create admin API functions
- [ ] Create `useAdmin` hook:
  - `users` - list query
  - `inviteUser` - mutation
  - `updateUser` - mutation
  - `settings` - query
  - `updateSettings` - mutation
  - `statuses` - queries

**Files to create:**
```
frontend/src/
├── api/
│   └── admin.ts
├── hooks/
│   └── useAdmin.ts
├── pages/
│   └── Admin.tsx
└── components/
    └── admin/
        ├── UserManagement.tsx
        ├── InviteUserDialog.tsx
        ├── WorkspaceSettings.tsx
        └── StatusManager.tsx
```

**Estimated:** 2-3 hours

---

### 5.9 Polish & UX

**Tasks:**
- [ ] Add loading skeletons for all data fetching:
  - Project list skeleton
  - Doc list skeleton
  - Task board skeleton
  - Message list skeleton
- [ ] Create `EmptyState` component:
  - Consistent empty state design
  - Helpful action suggestions
  - Used throughout app
- [ ] Create `ErrorBoundary` component:
  - Catch React errors
  - Display friendly error message
  - Retry button
- [ ] Create `ErrorDisplay` component:
  - API error display
  - Network error handling
  - Retry functionality
- [ ] Improve form validation feedback:
  - Inline error messages
  - Field highlighting
  - Submit button states
- [ ] Add keyboard shortcuts:
  - `Cmd/Ctrl + K` - Quick search/command (optional v1)
  - `Escape` - Close modals
  - Navigation shortcuts
- [ ] Create `useKeyboardShortcuts` hook
- [ ] Add toast notifications for actions:
  - Success toasts
  - Error toasts
  - Undo support (optional)
- [ ] Mobile responsive refinements:
  - Touch-friendly tap targets
  - Swipe gestures (optional)
  - Bottom sheet dialogs
- [ ] Accessibility improvements:
  - ARIA labels
  - Focus management
  - Screen reader support

**Files to create:**
```
frontend/src/
├── components/
│   └── common/
│       ├── Skeleton.tsx
│       ├── EmptyState.tsx
│       ├── ErrorBoundary.tsx
│       ├── ErrorDisplay.tsx
│       └── LoadingSpinner.tsx
└── hooks/
    └── useKeyboardShortcuts.ts
```

**Estimated:** 3-4 hours

---

### Success Criteria

Phase 5 is complete when ALL of the following are verified:

| # | Criterion | Verification Method |
|---|-----------|---------------------|
| 5.1 | WebSocket connects on login | Manual: Check devtools network |
| 5.2 | WebSocket reconnects after disconnect | Manual: Kill connection, verify reconnect |
| 5.3 | Chat messages appear in real-time | Manual: Send message, see in other tab |
| 5.4 | @mentions highlight in messages | Manual: Send message with @user |
| 5.5 | @mentions trigger notifications | Manual: Mention user, check their notifications |
| 5.6 | Typing indicator shows | Manual: Type in chat, see indicator |
| 5.7 | Unread badge updates on new message | Manual: Send message, check badge |
| 5.8 | Notifications appear without refresh | Manual: Trigger notification, see in bell |
| 5.9 | Notification click navigates to source | Manual: Click notification |
| 5.10 | Mark as read works | Manual: Mark notification read |
| 5.11 | Dashboard shows relevant data | Manual: View home page |
| 5.12 | "My Work" shows assigned tasks | Manual: View my work page |
| 5.13 | Admin can manage users | Manual: List, invite, disable users |
| 5.14 | Admin can change settings | Manual: Update workspace settings |
| 5.15 | Admin can manage statuses | Manual: Add/edit/delete statuses |
| 5.16 | Loading skeletons appear | Manual: Throttle network, observe |
| 5.17 | Empty states display appropriately | Manual: View empty project/list |
| 5.18 | Error states handle gracefully | Manual: Simulate API error |
| 5.19 | Mobile layout works correctly | Manual: Test on mobile device/emulator |
| 5.20 | All tests pass | Automated: `bun test` |

---

### Testing Strategy

#### Unit Tests

**Test Files to Create:**
```
backend/src/
├── websocket/
│   ├── hub.test.ts
│   └── handlers.test.ts
├── services/
│   ├── chat.test.ts
│   └── notification.test.ts
└── repositories/
    ├── channel.test.ts
    ├── message.test.ts
    └── notification.test.ts

frontend/src/
├── hooks/
│   ├── useWebSocket.test.ts
│   ├── useChat.test.ts
│   └── useNotifications.test.ts
└── components/
    ├── chat/
    │   ├── MessageList.test.tsx
    │   └── MessageInput.test.tsx
    ├── notifications/
    │   ├── NotificationBell.test.tsx
    │   └── NotificationPanel.test.tsx
    └── admin/
        ├── UserManagement.test.tsx
        └── StatusManager.test.tsx
```

**Unit Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `hub.test.ts` | should track connections | Add/remove clients |
| `hub.test.ts` | should broadcast to channel | Message delivery |
| `chat.test.ts` | should parse mentions | Extract @usernames |
| `chat.test.ts` | should create notification on mention | Integration |
| `notification.test.ts` | should create notification | Basic creation |
| `notification.test.ts` | should broadcast via WS | Real-time delivery |
| `useChat.test.ts` | should send message | Mutation test |
| `useChat.test.ts` | should update on WS event | Real-time update |
| `MessageInput.test.tsx` | should trigger autocomplete | @ detection |
| `NotificationBell.test.tsx` | should show count | Badge display |

---

#### Integration Tests

**Test Files to Create:**
```
backend/src/routes/
├── chat.integration.test.ts
└── notifications.integration.test.ts
```

**Integration Test Cases:**

| File | Test Case | Description |
|------|-----------|-------------|
| `chat.integration.test.ts` | Channel CRUD | Create/list channels |
| `chat.integration.test.ts` | Message CRUD | Send/list messages |
| `chat.integration.test.ts` | Mention parsing | @user detection |
| `chat.integration.test.ts` | Permission check | Project membership |
| `notifications.integration.test.ts` | Notification CRUD | Create/list/read |
| `notifications.integration.test.ts` | Mark all as read | Batch operation |

---

#### WebSocket Tests

**Manual WebSocket Testing:**
```bash
# Connect to WebSocket (using wscat)
wscat -c ws://localhost:8080/api/v1/ws -H "Cookie: session_id=xxx"

# Send subscribe message
{"type": "subscribe", "channel": "channel-id"}

# Send chat message (via API, observe WS)
curl -X POST http://localhost:8080/api/v1/channels/xxx/messages \
  -H "Content-Type: application/json" \
  -H "Cookie: session_id=xxx" \
  -d '{"content": "Hello @username"}'
```

---

#### Manual Verification Checklist

**Chat:**
- [ ] Open chat in two browser tabs (same user)
- [ ] Send message in one tab - appears in both
- [ ] Open chat as different user
- [ ] Send message - appears for other user in real-time
- [ ] Type @username - autocomplete appears
- [ ] Select user from autocomplete - mention inserted
- [ ] Send message with mention - highlighted in message
- [ ] Mentioned user receives notification
- [ ] Scroll up in message list - loads older messages
- [ ] Unread badge shows on channel with new messages
- [ ] Click channel - mark as read, badge clears

**Notifications:**
- [ ] Bell icon shows unread count
- [ ] Click bell - panel opens with notifications
- [ ] Click notification - navigates to source
- [ ] Notification marked as read after click
- [ ] "Mark all as read" clears all
- [ ] New notification appears without refresh
- [ ] Toast shows for important notifications

**Dashboard:**
- [ ] Home page loads with user greeting
- [ ] Upcoming meetings section shows data
- [ ] Tasks due soon section shows data
- [ ] Recent activity shows latest updates
- [ ] Quick links to recent projects work

**My Work:**
- [ ] Shows all assigned tasks
- [ ] Grouped by project/status
- [ ] Filters work correctly
- [ ] Click task - opens detail

**Admin:**
- [ ] Non-admin gets 403 on admin pages
- [ ] Admin can view user list
- [ ] Admin can invite new user
- [ ] Admin can disable user
- [ ] Admin can change workspace name
- [ ] Admin can toggle registration
- [ ] Admin can manage statuses (add/edit/delete/reorder)

**Polish:**
- [ ] Skeletons show while loading
- [ ] Empty states show when no data
- [ ] Errors display helpful messages
- [ ] Retry buttons work
- [ ] Toast notifications appear on actions
- [ ] Mobile layout is usable

---

### Database Migrations

**Migration 0006_chat.sql:**
```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'project',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  mentions UUID[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE channel_members (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP DEFAULT NOW(),
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX idx_channels_project ON channels(project_id);
CREATE INDEX idx_messages_channel ON messages(channel_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_channel_members_user ON channel_members(user_id);

-- Seed default workspace channel
INSERT INTO channels (name, type) VALUES ('Town Square', 'workspace');
```

**Migration 0007_notifications.sql:**
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  link VARCHAR(500),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

---

### Estimated Timeline

| Task | Hours | Cumulative |
|------|-------|------------|
| 5.1 WebSocket Infrastructure | 3-4 | 3-4 |
| 5.2 Chat Backend | 3-4 | 6-8 |
| 5.3 Chat Frontend | 4-5 | 10-13 |
| 5.4 Notifications Backend | 2-3 | 12-16 |
| 5.5 Notifications Frontend | 2-3 | 14-19 |
| 5.6 Home Dashboard | 2-3 | 16-22 |
| 5.7 My Work Page | 2 | 18-24 |
| 5.8 Admin UI | 2-3 | 20-27 |
| 5.9 Polish & UX | 3-4 | 23-31 |
| Testing & Verification | 2-3 | **25-34** |

---

*Continue to [Phase 6: Deployment](#phase-6-deployment) after all Phase 5 criteria are met.*

---

## Phase 6: Deployment

### Overview

This phase prepares Tuesday for production deployment with Docker containerization, documentation, backup procedures, and operational tooling. The goal is a single-command deployment experience.

**Estimated Effort:** 6-8 hours

**Prerequisites:** Phase 5 complete with all features working.

---

### 6.1 Frontend Production Build

**Tasks:**
- [ ] Configure Vite for production build:
  - Code splitting for routes
  - Tree shaking
  - Minification
  - Asset hashing for cache busting
- [ ] Set up environment variable handling:
  - `VITE_API_URL` - API base URL (for non-embedded deployments)
  - Build-time vs runtime configuration
- [ ] Optimize bundle size:
  - Analyze with `vite-bundle-visualizer`
  - Lazy load heavy components (Excalidraw, BlockNote, FullCalendar)
- [ ] Test production build locally:
  - `bun run build`
  - `bun run preview`

**Files to update:**
```
frontend/
├── vite.config.ts        # Production optimizations
├── .env.example          # Document env vars
└── .env.production       # Production defaults
```

**Estimated:** 1 hour

---

### 6.2 Backend Static File Serving

**Tasks:**
- [ ] Configure Hono to serve static files:
  - Serve frontend build from `/app/static`
  - Serve index.html for client-side routes (SPA fallback)
- [ ] Set proper cache headers:
  - Long cache for hashed assets (1 year)
  - No cache for index.html
- [ ] Handle API vs static routing:
  - `/api/*` routes to API handlers
  - All other routes serve frontend

**Files to create/update:**
```
backend/src/
├── middleware/
│   └── static.ts         # Static file serving
└── index.ts              # Update with static middleware
```

**Estimated:** 1 hour

---

### 6.3 Multi-stage Dockerfile

**Tasks:**
- [ ] Create optimized multi-stage Dockerfile:
  - **Stage 1:** Build frontend (Bun + Vite)
  - **Stage 2:** Build backend (Bun compile)
  - **Stage 3:** Production image (Ubuntu + PostgreSQL + supervisord)
- [ ] Optimize image size:
  - Use slim base images
  - Clean up build artifacts
  - Multi-stage to exclude dev dependencies
- [ ] Configure for embedded PostgreSQL:
  - Install PostgreSQL 16
  - Configure data directory
- [ ] Test build locally:
  - `docker build -t tuesday:local .`

**Files to create:**
```
Dockerfile
```

**Dockerfile content:**
```dockerfile
# Stage 1: Build frontend
FROM oven/bun:1 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lockb ./
RUN bun install --frozen-lockfile
COPY frontend/ .
RUN bun run build

# Stage 2: Build backend (compiled executable)
FROM oven/bun:1 AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/bun.lockb ./
RUN bun install --frozen-lockfile
COPY backend/ .
RUN bun build --compile --minify src/index.ts --outfile tuesday

# Stage 3: Production image
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Install PostgreSQL 16 and supervisord
RUN apt-get update && \
    apt-get install -y wget gnupg2 lsb-release && \
    echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    apt-get update && \
    apt-get install -y postgresql-16 supervisor && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy compiled backend and frontend build
COPY --from=backend-builder /app/backend/tuesday /app/tuesday
COPY --from=frontend-builder /app/frontend/dist /app/static

# Copy configuration files
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh

# Set permissions
RUN chmod +x /app/entrypoint.sh /app/tuesday

# Create data directory
RUN mkdir -p /app/data

EXPOSE 8080
VOLUME /app/data

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

**Estimated:** 1.5 hours

---

### 6.4 Process Management

**Tasks:**
- [ ] Create supervisord configuration:
  - PostgreSQL process
  - Tuesday server process
  - Proper startup order (PostgreSQL first)
  - Automatic restart on failure
- [ ] Create entrypoint script:
  - Initialize PostgreSQL data directory if empty
  - Generate session secret if not exists
  - Run database migrations
  - Start supervisord
- [ ] Configure logging:
  - PostgreSQL logs
  - Application logs
  - Log rotation (optional)

**Files to create:**
```
supervisord.conf
entrypoint.sh
```

**supervisord.conf:**
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
stdout_logfile=/var/log/supervisor/postgresql.log
stderr_logfile=/var/log/supervisor/postgresql.err

[program:tuesday]
command=/app/tuesday
directory=/app
autostart=true
autorestart=true
priority=20
startsecs=5
startretries=3
stdout_logfile=/var/log/supervisor/tuesday.log
stderr_logfile=/var/log/supervisor/tuesday.err
environment=DATABASE_URL="postgresql://tuesday:tuesday@localhost:5432/tuesday",DATA_DIR="/app/data"
```

**entrypoint.sh:**
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
    
    # Configure PostgreSQL
    echo "host all all 127.0.0.1/32 trust" >> "$PG_DATA/pg_hba.conf"
    echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA/postgresql.conf"
    
    # Start PostgreSQL temporarily to create database
    su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w start"
    su postgres -c "createuser tuesday"
    su postgres -c "createdb -O tuesday tuesday"
    su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PG_DATA -w stop"
fi

# Generate session secret if not exists
SECRET_FILE="$DATA_DIR/.session_secret"
if [ ! -f "$SECRET_FILE" ]; then
    echo "Generating session secret..."
    openssl rand -base64 32 > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
fi

export SESSION_SECRET=$(cat "$SECRET_FILE")

# Execute command
exec "$@"
```

**Estimated:** 1 hour

---

### 6.5 Docker Compose

**Tasks:**
- [ ] Create production docker-compose.yml:
  - Single service (all-in-one container)
  - Volume for data persistence
  - Port mapping
  - Restart policy
- [ ] Create development docker-compose.dev.yml:
  - Separate PostgreSQL container
  - Volume mounts for hot reload
  - Development environment variables
- [ ] Document volume backup strategy

**Files to create:**
```
docker-compose.yml
docker-compose.dev.yml
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  tuesday:
    image: tuesday:latest
    build: .
    container_name: tuesday
    ports:
      - "8080:8080"
    volumes:
      - tuesday_data:/app/data
    environment:
      - TUESDAY_BASE_URL=${TUESDAY_BASE_URL:-http://localhost:8080}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v1/setup/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  tuesday_data:
```

**Estimated:** 30 min

---

### 6.6 Database Backup & Restore

**Tasks:**
- [ ] Create backup script:
  - Uses pg_dump
  - Timestamped backup files
  - Optional compression
- [ ] Create restore script:
  - Validates backup file
  - Restores database
  - Handles running container
- [ ] Document backup procedures in README
- [ ] Test backup and restore flow

**Files to create:**
```
scripts/
├── backup.sh
└── restore.sh
```

**scripts/backup.sh:**
```bash
#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tuesday_backup_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_FILE"
docker exec tuesday pg_dump -U tuesday tuesday > "$BACKUP_FILE"

echo "Compressing backup..."
gzip "$BACKUP_FILE"

echo "Backup complete: ${BACKUP_FILE}.gz"
```

**scripts/restore.sh:**
```bash
#!/bin/bash
set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: ./restore.sh <backup_file.sql.gz>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will overwrite the current database!"
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo "Restoring from: $BACKUP_FILE"

if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | docker exec -i tuesday psql -U tuesday tuesday
else
    cat "$BACKUP_FILE" | docker exec -i tuesday psql -U tuesday tuesday
fi

echo "Restore complete!"
```

**Estimated:** 30 min

---

### 6.7 Environment Configuration

**Tasks:**
- [ ] Document all environment variables:
  - Required vs optional
  - Default values
  - Security considerations
- [ ] Create comprehensive .env.example
- [ ] Add validation for required variables on startup
- [ ] Support configuration via file or environment

**Files to create/update:**
```
.env.example
backend/src/config.ts    # Update with validation
docs/configuration.md    # Document all options
```

**.env.example:**
```env
# Tuesday Configuration

# Server
TUESDAY_PORT=8080
TUESDAY_BASE_URL=http://localhost:8080

# Database (auto-configured for embedded PostgreSQL)
DATABASE_URL=postgresql://tuesday:tuesday@localhost:5432/tuesday

# Security
# SESSION_SECRET is auto-generated on first run
# Uncomment to provide your own:
# SESSION_SECRET=your-secure-random-string

# Features
TUESDAY_ALLOW_REGISTRATION=false
TUESDAY_SESSION_DURATION_HOURS=24

# Data directory (Docker volume mount point)
DATA_DIR=/app/data
```

**Estimated:** 30 min

---

### 6.8 Documentation

**Tasks:**
- [ ] Update README.md with:
  - Project overview and features
  - Quick start guide (Docker)
  - Configuration reference
  - Screenshots
- [ ] Create deployment guide:
  - Docker deployment
  - Reverse proxy setup (Nginx, Caddy, NPM)
  - SSL/TLS configuration
  - Backup procedures
- [ ] Create upgrade guide:
  - Version upgrade process
  - Database migration handling
  - Rollback procedures
- [ ] Add CHANGELOG.md template

**Files to create/update:**
```
README.md
docs/
├── deployment.md
├── configuration.md
├── upgrade.md
└── backup.md
CHANGELOG.md
```

**Estimated:** 2 hours

---

### 6.9 Production Checklist

**Pre-deployment verification:**

**Build & Container:**
- [ ] `docker build` completes successfully
- [ ] Container starts with `docker compose up -d`
- [ ] Health check passes
- [ ] Logs show no errors

**Database:**
- [ ] PostgreSQL starts and accepts connections
- [ ] Migrations run automatically
- [ ] Data persists across container restarts
- [ ] Backup script works
- [ ] Restore script works

**Application:**
- [ ] Setup wizard appears on fresh install
- [ ] Admin user can be created
- [ ] Login/logout works
- [ ] All features functional
- [ ] WebSocket connects
- [ ] Real-time updates work

**Security:**
- [ ] Security headers present
- [ ] Session cookies configured correctly
- [ ] Rate limiting active
- [ ] No sensitive data in logs
- [ ] Environment variables not exposed

**Performance:**
- [ ] Page load times acceptable (<3s)
- [ ] API responses fast (<500ms)
- [ ] No memory leaks (monitor over time)
- [ ] Bundle size reasonable (<2MB gzipped)

**Documentation:**
- [ ] README is complete and accurate
- [ ] All configuration documented
- [ ] Deployment steps work as written
- [ ] Backup/restore documented

**Estimated:** 1 hour

---

### Success Criteria

Phase 6 is complete when ALL of the following are verified:

| # | Criterion | Verification Method |
|---|-----------|---------------------|
| 6.1 | `docker build` completes without errors | Run build command |
| 6.2 | `docker compose up -d` starts container | Run compose command |
| 6.3 | Container health check passes | Check `docker ps` |
| 6.4 | PostgreSQL accessible inside container | Check logs |
| 6.5 | Migrations run on first start | Check logs |
| 6.6 | Setup wizard accessible at first run | Visit in browser |
| 6.7 | All features work in container | Manual testing |
| 6.8 | Data persists across restarts | Stop, start, verify |
| 6.9 | Backup script creates valid backup | Run backup |
| 6.10 | Restore script works | Restore backup |
| 6.11 | Reverse proxy works (Nginx/Caddy) | Test with proxy |
| 6.12 | WebSocket works through proxy | Test chat |
| 6.13 | HTTPS works with reverse proxy | Test with SSL |
| 6.14 | README provides clear instructions | Follow as new user |
| 6.15 | All environment variables documented | Check .env.example |

---

### Testing Strategy

#### Deployment Tests

**Test Scenarios:**

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Fresh install | Build, run, complete setup | Working instance |
| Data persistence | Create data, restart, verify | Data preserved |
| Upgrade simulation | Run v1, upgrade to v2 | Data migrated |
| Backup/restore | Backup, destroy, restore | Data recovered |
| Reverse proxy (Nginx) | Configure nginx, test | All features work |
| Reverse proxy (Caddy) | Configure caddy, test | All features work |
| SSL termination | Configure SSL, test | HTTPS works |
| WebSocket through proxy | Test chat with proxy | Real-time works |

---

#### Manual Deployment Checklist

**Docker Build:**
- [ ] Clone fresh repository
- [ ] Run `docker build -t tuesday:test .`
- [ ] Build completes in <10 minutes
- [ ] Image size <1GB

**Container Startup:**
- [ ] Run `docker compose up -d`
- [ ] Container starts within 60 seconds
- [ ] Health check passes
- [ ] No errors in logs

**First Run:**
- [ ] Visit http://localhost:8080
- [ ] Setup wizard appears
- [ ] Complete setup successfully
- [ ] Login works

**Feature Verification:**
- [ ] Create project
- [ ] Create doc with content
- [ ] Create task, drag on kanban
- [ ] Create meeting on calendar
- [ ] Create whiteboard, draw
- [ ] Send chat message
- [ ] Receive notification

**Persistence:**
- [ ] `docker compose down`
- [ ] `docker compose up -d`
- [ ] All data still present

**Backup/Restore:**
- [ ] Run `./scripts/backup.sh`
- [ ] Verify backup file created
- [ ] Delete all data (reset)
- [ ] Run `./scripts/restore.sh <backup>`
- [ ] Verify data restored

**Reverse Proxy (Nginx):**
```nginx
server {
    listen 443 ssl http2;
    server_name tuesday.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
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

**Reverse Proxy (Caddy):**
```
tuesday.example.com {
    reverse_proxy localhost:8080
}
```

---

### Estimated Timeline

| Task | Hours | Cumulative |
|------|-------|------------|
| 6.1 Frontend Production Build | 1 | 1 |
| 6.2 Backend Static File Serving | 1 | 2 |
| 6.3 Multi-stage Dockerfile | 1.5 | 3.5 |
| 6.4 Process Management | 1 | 4.5 |
| 6.5 Docker Compose | 0.5 | 5 |
| 6.6 Database Backup & Restore | 0.5 | 5.5 |
| 6.7 Environment Configuration | 0.5 | 6 |
| 6.8 Documentation | 2 | 8 |
| 6.9 Production Checklist | 1 | 9 |
| Testing & Verification | 1.5 | **10.5** |

---

## Summary

### Total Estimated Effort

| Phase | Name | Hours (Min) | Hours (Max) |
|-------|------|-------------|-------------|
| 1 | Backend Foundation | 9 | 13 |
| 2 | Core Features | 15.5 | 19 |
| 3 | Frontend Foundation | 13.5 | 18.75 |
| 4 | Feature Completion | 30.5 | 40 |
| 5 | Real-time & Polish | 25 | 34 |
| 6 | Deployment | 9 | 10.5 |
| **Total** | | **102.5** | **135.25** |

### Key Milestones

| Milestone | After Phase | Description |
|-----------|-------------|-------------|
| Backend MVP | Phase 2 | Full API for projects, docs, tasks |
| Usable Frontend | Phase 3 | Login, projects, basic navigation |
| Feature Complete | Phase 4 | All core features implemented |
| Real-time Enabled | Phase 5 | Chat, notifications, polish |
| Production Ready | Phase 6 | Deployable Docker container |

### Risk Factors

| Risk | Impact | Mitigation |
|------|--------|------------|
| BlockNote/Excalidraw complexity | High | Allow extra time, fallback to simpler alternatives |
| WebSocket reliability | Medium | Implement robust reconnection, fallback to polling |
| Docker/PostgreSQL embedding | Medium | Test early, have separate DB option as backup |
| Bundle size | Low | Lazy loading, code splitting, monitoring |
| Mobile responsiveness | Medium | Test throughout, not just at end |

---

## Appendix: Quick Reference

### Development Commands

```bash
# Backend
cd backend
bun install
bun run dev          # Start dev server
bun run build        # Build for production
bun test             # Run tests
bun run db:migrate   # Run migrations
bun run db:studio    # Open Drizzle Studio

# Frontend
cd frontend
bun install
bun run dev          # Start dev server
bun run build        # Build for production
bun test             # Run tests

# Docker
docker build -t tuesday:latest .
docker compose up -d
docker compose down
docker compose logs -f

# Backup
./scripts/backup.sh
./scripts/restore.sh backup.sql.gz
```

### API Endpoints Summary

```
Setup:     GET/POST /api/v1/setup/*
Auth:      POST /api/v1/auth/login|logout|register, GET /api/v1/auth/me
Projects:  CRUD /api/v1/projects/*, /api/v1/projects/:id/members/*
Docs:      CRUD /api/v1/projects/:id/docs/*, /api/v1/docs/*
Tasks:     CRUD /api/v1/projects/:id/tasks/*, /api/v1/tasks/*
Meetings:  CRUD /api/v1/projects/:id/meetings/*, /api/v1/meetings/*
Boards:    CRUD /api/v1/projects/:id/whiteboards/*, /api/v1/whiteboards/*
Chat:      /api/v1/channels/*, /api/v1/channels/:id/messages/*
Notify:    /api/v1/notifications/*
Admin:     /api/v1/admin/*
WebSocket: /api/v1/ws
```

---

*Document Version: 1.0*
*Last Updated: Phase Planning Complete*
*Project: Tuesday - A free next step up to Basecamp, Mattermost, Notion, and Monday*
