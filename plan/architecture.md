# Architecture Overview: WorkHub (Self-Hosted Project Management Tool)

## Summary

| Aspect | Decision |
|--------|----------|
| Backend | Bun + Hono |
| Frontend | React + TypeScript + shadcn/ui |
| Database | PostgreSQL 16 (embedded) |
| Real-time | WebSockets |
| Deployment | Single Docker container |
| Auth | Email/password (session-based) |
| Reverse Proxy | User-provided (NPM, Caddy, Nginx, etc.) |

---

## 1. System Context Diagram

```
                                     ┌─────────────────────────────────────────┐
                                     │          User's Infrastructure          │
                                     │  (Reverse Proxy: NPM, Caddy, Nginx...)  │
                                     └─────────────────┬───────────────────────┘
                                                       │ HTTPS
                                                       ▼
┌──────────────┐                    ┌─────────────────────────────────────────┐
│              │     HTTPS          │                                         │
│    Users     │◄──────────────────►│              WorkHub                    │
│   (Browser)  │                    │         (Single Docker Container)       │
│              │                    │                                         │
└──────────────┘                    └─────────────────────────────────────────┘
```

**Key boundaries:**
- WorkHub runs as a single Docker container with everything included
- Embedded PostgreSQL database - no external dependencies
- Single exposed port (8080) for reverse proxy
- First-time setup wizard on fresh deployment

---

## 2. Container Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WorkHub Container                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         supervisord (PID 1)                             │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────┐  ┌──────────────────────────────────┐    │ │
│  │  │      PostgreSQL 16       │  │        WorkHub Server            │    │ │
│  │  │      (port 5432)         │  │        (Bun + Hono)              │    │ │
│  │  │      internal only       │  │        port 8080 (exposed)       │    │ │
│  │  │                          │  │                                  │    │ │
│  │  │  - PostgreSQL data       │  │  - REST API (HTTP/JSON)          │    │ │
│  │  │  - JSONB for schemas     │  │  - WebSocket hub (chat, notifications) │    │ │
│  │  │  - Not exposed to host   │  │  - Session management            │    │ │
│  │  └──────────────────────────┘  │  - Serves static frontend files  │    │ │
│  │                                │  - Drizzle ORM for DB access     │    │ │
│  │                                └──────────────────────────────────┘    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Volume: /app/data                                                           │
│  ├── postgres/               # PostgreSQL data directory                     │
│  ├── .session_secret         # Auto-generated session secret                 │
│  └── uploads/                # File uploads (future)                         │
│                                                                              │
│  Exposed: 8080                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Design decisions:**
- **Single container**: Simplest deployment - one `docker run` command
- **Embedded PostgreSQL**: No external database setup required
- **Compiled backend**: `bun build --compile` produces single executable
- **supervisord**: Manages PostgreSQL and WorkHub server processes
- **Auto-generated secrets**: SESSION_SECRET created on first run, saved to volume

---

## 3. Component Breakdown

### 3.1 Backend (Bun + Hono + Drizzle ORM)

```
backend/
├── src/
│   ├── index.ts                 # Entry point, Hono app setup
│   ├── config.ts                # Environment configuration
│   │
│   ├── routes/
│   │   ├── index.ts             # Route registration
│   │   ├── setup.ts             # First-time setup wizard
│   │   ├── auth.ts              # Login, logout, register
│   │   ├── users.ts             # User CRUD, profile
│   │   ├── projects.ts          # Project CRUD, membership
│   │   ├── docs.ts              # Document CRUD, databases
│   │   ├── tasks.ts             # Task CRUD, kanban operations
│   │   ├── meetings.ts          # Meeting CRUD
│   │   ├── whiteboards.ts       # Whiteboard CRUD
│   │   ├── channels.ts          # Chat channels
│   │   ├── messages.ts          # Chat messages
│   │   └── admin.ts             # Admin operations, settings
│   │
│   ├── middleware/
│   │   ├── auth.ts              # Session validation, user context
│   │   ├── project.ts           # Project membership validation
│   │   ├── admin.ts             # Admin role check
│   │   ├── cors.ts              # CORS handling
│   │   ├── logging.ts           # Request logging
│   │   ├── recovery.ts          # Panic recovery
│   │   └── setup.ts             # Setup initialization check
│   │
│   ├── services/                # Business logic layer
│   │   ├── auth.ts
│   │   ├── setup.ts
│   │   ├── project.ts
│   │   ├── doc.ts
│   │   ├── task.ts
│   │   ├── meeting.ts
│   │   ├── whiteboard.ts
│   │   ├── chat.ts
│   │   └── notification.ts
│   │
│   ├── repositories/            # Database access layer (Drizzle)
│   │   ├── user.ts
│   │   ├── session.ts
│   │   ├── project.ts
│   │   ├── doc.ts
│   │   ├── task.ts
│   │   ├── meeting.ts
│   │   ├── whiteboard.ts
│   │   ├── channel.ts
│   │   ├── message.ts
│   │   ├── notification.ts
│   │   └── settings.ts
│   │
│   ├── db/
│   │   ├── client.ts            # PostgreSQL connection
│   │   ├── schema.ts            # Drizzle schema definitions
│   │   └── migrations/          # SQL migration files
│   │
│   ├── websocket/               # Real-time communication
│   │   ├── hub.ts               # Connection manager
│   │   ├── client.ts            # Per-connection handler
│   │   └── events.ts            # Event types and routing
│   │
│   └── utils/
│       ├── password.ts          # Bcrypt hashing
│       ├── response.ts          # Standard API responses
│       └── validation.ts        # Zod schemas
│
├── drizzle.config.ts            # Drizzle Kit configuration
├── package.json
└── tsconfig.json
```

**Key backend libraries:**
- **Hono** - Lightweight web framework
- **Drizzle ORM** - Type-safe SQL-like ORM
- **Zod** - Schema validation
- **bcryptjs** - Password hashing
- **postgres** - PostgreSQL driver

### 3.2 Frontend (React + TypeScript + shadcn/ui)

```
frontend/
src/
├── main.tsx                 # Entry point
├── App.tsx                  # Root component, routing
│
├── api/                     # API client layer
│   ├── client.ts            # Fetch instance with credentials
│   ├── setup.ts             # Setup status/complete
│   ├── auth.ts
│   ├── projects.ts
│   ├── docs.ts
│   ├── tasks.ts
│   ├── meetings.ts
│   ├── whiteboards.ts
│   ├── chat.ts
│   └── websocket.ts         # WebSocket connection manager
│
├── hooks/                   # Custom React hooks
│   ├── useSetup.ts          # Check initialization status
│   ├── useAuth.ts
│   ├── useProjects.ts
│   ├── useWebSocket.ts
│   └── useNotifications.ts
│
├── store/                   # State management (Zustand)
│   ├── authStore.ts
│   ├── projectStore.ts
│   ├── chatStore.ts
│   └── notificationStore.ts
│
├── pages/                   # Route-level components
│   ├── Setup.tsx            # First-time setup wizard
│   ├── Login.tsx
│   ├── Home.tsx
│   ├── Projects.tsx
│   ├── ProjectDetail.tsx
│   ├── ProjectDocs.tsx
│   ├── ProjectTasks.tsx
│   ├── ProjectTimeline.tsx
│   ├── ProjectSchedule.tsx
│   ├── ProjectWhiteboards.tsx
│   ├── ProjectChat.tsx
│   ├── MyWork.tsx
│   ├── MyCalendar.tsx
│   ├── Notifications.tsx
│   └── Admin.tsx
│
├── components/              # Reusable UI components
│   ├── ui/                  # shadcn/ui components
│   ├── layout/              # Sidebar, header, navigation
│   ├── docs/                # BlockNote editor, database views
│   ├── tasks/               # Kanban board, task cards
│   ├── timeline/            # Gantt/timeline view
│   ├── calendar/            # Calendar components
│   ├── whiteboard/          # Excalidraw wrapper
│   └── chat/                # Channel list, message list
│
├── lib/                     # Utilities (shadcn utils + custom)
│   └── utils.ts
│
└── styles/                  # Global styles
    └── globals.css
```

**Key frontend libraries:**
- **shadcn/ui** - UI component library (Nova style, Stone theme)
- **Phosphor Icons** - Icon library
- **Inter** - Font
- **Tailwind CSS** - Styling
- **React Router** - Client-side routing
- **TanStack Query** - Server state management, caching
- **Zustand** - Client state (simpler than Redux)
- **BlockNote** - Notion-style block-based editor
- **@excalidraw/excalidraw** - Whiteboard component
- **react-markdown** + **remark-gfm** - Markdown rendering
- **FullCalendar** - Calendar views
- **dnd-kit** - Drag and drop (kanban)

---

## 4. Data Model Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Core Entities                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    User      │       │   Project    │       │ProjectMember │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (uuid)    │       │ id (uuid)    │       │ project_id   │
│ email        │◄──────│ name         │◄──────│ user_id      │
│ password_hash│       │ client       │       │ role (enum)  │
│ name         │       │ status_id    │───────│ joined_at    │
│ avatar_url   │       │ owner_id     │       └──────────────┘
│ role (enum)  │       │ type         │
│ created_at   │       │ start_date   │       ┌──────────────┐
│ updated_at   │       │ target_end   │       │ProjectStatus │
└──────────────┘       │ created_at   │       ├──────────────┤
        │               └──────────────┘       │ id (uuid)    │
        │                      │               │ name         │
        │                      │               │ color        │
        │                      │               │ sort_order   │
        │                      │               │ is_default   │
        │    ┌─────────────────┼───────────────└──────────────┘
        │    │                 │                 │
        ▼    ▼                 ▼                 ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│     Doc      │    │    Task      │    │   Meeting    │    │  Whiteboard  │
├──────────────┤    ├──────────────┤    ├──────────────┤    ├──────────────┤
│ id (uuid)    │    │ id (uuid)    │    │ id (uuid)    │    │ id (uuid)    │
│ project_id   │    │ project_id   │    │ project_id   │    │ project_id   │
│ parent_id    │    │ title        │    │ title        │    │ name         │
│ title        │    │ description  │    │ start_time   │    │ data (jsonb) │
│ content_md   │    │ status       │    │ end_time     │    │ created_by   │
│ properties   │    │ assignees[]  │    │ attendees[]  │    │ created_at   │
│ (jsonb)      │    │ start_date   │    │ location     │    │ updated_at   │
│ is_database  │    │ due_date     │    │ notes_md     │    └──────────────┘
│ schema       │    │ created_at   │    │ created_at   │
│ (jsonb)      │    │ updated_at   │    │ updated_at   │
│ created_by   │    └──────────────┘    └──────────────┘
│ created_at   │
│ updated_at   │
└──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Chat Entities                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Channel    │       │   Message    │       │ ChannelMember│
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (uuid)    │◄──────│ id (uuid)    │       │ channel_id   │
│ project_id   │       │ channel_id   │       │ user_id      │
│ (nullable)   │       │ user_id      │───────│ last_read_at │
│ name         │       │ content      │       │ joined_at    │
│ type (enum)  │       │ mentions[]   │       └──────────────┘
│ created_at   │       │ created_at   │
└──────────────┘       └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        System Entities                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐    ┌──────────────────┐
│   Notification   │    │     Settings     │
├──────────────────┤    ├──────────────────┤
│ id (uuid)        │    │ key (string)     │
│ user_id          │    │ value (jsonb)    │
│ type (enum)      │    │ updated_at       │
│ title            │    └──────────────────┘
│ body             │
│ link             │    Example settings:
│ read             │    - setup_completed: true/false
│ created_at       │    - workspace_name: "Acme Corp"
└──────────────────┘    - allow_registration: true/false
                        - session_duration_hours: 24
                        - task_statuses: [...]
                        - project_statuses: [...]

Enums:
- UserRole: admin, member
- ProjectMemberRole: owner, member
- TaskStatus: (customizable via settings)
- ChannelType: workspace, project
- NotificationType: mention, assignment, meeting_invite, ...
```

**Key design notes:**
- **Doc.properties (JSONB)**: Notion-style custom properties per document
- **Doc.schema (JSONB)**: When `is_database=true`, defines the property schema for child docs
- **Whiteboard.data (JSONB)**: Stores Excalidraw scene JSON directly
- **Settings table**: Key-value store for admin-configurable options
- **ProjectStatus**: Separate table for customizable project statuses
- **setup_completed**: Boolean flag set after first-time setup
- **UUIDs**: All primary keys use UUID for distributed-safe ID generation

---

## 5. Access Control Model

### 5.1 Two-Level Authorization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Access Control Overview                              │
└─────────────────────────────────────────────────────────────────────────────┘

Level 1: Workspace Role (User.role)
├── admin:  Full system access, can manage users and settings
└── member: Can only access projects they are explicitly assigned to

Level 2: Project Membership (ProjectMember)
├── owner:  Full control over the project
└── member: Can view/edit content within the project
```

### 5.2 Permission Matrix

**Workspace Level (based on User.role):**

| Action | Admin | Member |
|--------|-------|--------|
| Manage users (invite/disable) | Yes | No |
| Change workspace settings | Yes | No |
| View all projects | Yes | No |
| Create new projects | Yes | Yes |
| Enable/disable self-registration | Yes | No |
| Customize statuses | Yes | No |

**Project Level (based on ProjectMember.role):**

| Action | Owner | Member | No Membership |
|--------|-------|--------|---------------|
| View project | Yes | Yes | **No** |
| Edit project settings | Yes | No | No |
| Delete project | Yes | No | No |
| Manage project members | Yes | No | No |
| Create docs/tasks/etc | Yes | Yes | No |
| Edit any content | Yes | Yes | No |
| Delete any content | Yes | Own only | No |
| Chat in project channels | Yes | Yes | No |

### 5.3 Enforcement Points

```typescript
// Middleware chain for project routes
app.route('/api/v1/projects/:projectId', async (c) => {
  // All routes in this group require authentication
  await requireAuth(c);
  await requireProjectMember(c, c.req.param('projectId'));
})

app.get('/api/v1/projects/:projectId', getProjectHandler);
app.put('/api/v1/projects/:projectId', requireProjectOwner, updateProjectHandler);
app.delete('/api/v1/projects/:projectId', requireProjectOwner, deleteProjectHandler);

// Nested resources inherit project membership check
app.get('/api/v1/projects/:projectId/tasks', listTasksHandler);
app.post('/api/v1/projects/:projectId/tasks', createTaskHandler);
```

### 5.4 Key Access Control Rules

1. **Project Isolation**: Members can ONLY see and access projects where they have a `ProjectMember` record
2. **No Implicit Access**: Being a workspace member does NOT grant access to any project
3. **Admin Override**: Admins can view/manage all projects (for support/maintenance purposes)
4. **Owner Assignment**: Project creator becomes owner; can transfer ownership
5. **Resource Inheritance**: All resources within a project (docs, tasks, etc.) inherit project membership requirements

### 5.5 Database Query Pattern

```typescript
// Always filter by project membership (non-admin users)
const projects = await db.query.projects.findMany({
  where: (projects, { exists, and, eq }) => exists(
    db.select().from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, currentUserId)
      ))
  )
});

// Admin users can see all (verify admin role first)
const allProjects = isAdmin 
  ? await db.query.projects.findMany()
  : await getUserProjects(userId);
```

---

## 6. API Design

### 6.1 Style: REST with JSON

```
Base URL: /api/v1

Setup (first-time only):
- GET    /api/v1/setup/status         # Returns { initialized: boolean }
- POST   /api/v1/setup/complete       # Create admin user + workspace name

Authentication:
- POST   /api/v1/auth/login           # Email/password login
- POST   /api/v1/auth/logout          # Invalidate session
- POST   /api/v1/auth/register        # Self-registration (if enabled)
- GET    /api/v1/auth/me              # Current user info

Users:
- GET    /api/v1/users                # List users (admin only)
- GET    /api/v1/users/:id
- PATCH  /api/v1/users/:id            # Update profile
- DELETE /api/v1/users/:id            # Disable user (admin only)

Projects:
- GET    /api/v1/projects             # List MY projects (filtered by membership)
- POST   /api/v1/projects
- GET    /api/v1/projects/:id         # Requires membership
- PATCH  /api/v1/projects/:id         # Requires owner role
- DELETE /api/v1/projects/:id         # Requires owner role

Project Members:
- GET    /api/v1/projects/:id/members
- POST   /api/v1/projects/:id/members       # Add member (owner only)
- PATCH  /api/v1/projects/:id/members/:uid  # Change role (owner only)
- DELETE /api/v1/projects/:id/members/:uid  # Remove member (owner only)

Docs:
- GET    /api/v1/projects/:id/docs
- POST   /api/v1/projects/:id/docs
- GET    /api/v1/docs/:id
- PATCH  /api/v1/docs/:id
- DELETE /api/v1/docs/:id
- GET    /api/v1/docs/personal        # Personal docs (no project)

Tasks:
- GET    /api/v1/projects/:id/tasks
- POST   /api/v1/projects/:id/tasks
- GET    /api/v1/tasks/:id
- PATCH  /api/v1/tasks/:id
- DELETE /api/v1/tasks/:id
- GET    /api/v1/tasks/my             # My tasks across all my projects

Meetings:
- GET    /api/v1/projects/:id/meetings
- POST   /api/v1/projects/:id/meetings
- GET    /api/v1/meetings/:id
- PATCH  /api/v1/meetings/:id
- DELETE /api/v1/meetings/:id
- GET    /api/v1/meetings/my          # My calendar across all my projects

Whiteboards:
- GET    /api/v1/projects/:id/whiteboards
- POST   /api/v1/projects/:id/whiteboards
- GET    /api/v1/whiteboards/:id
- PATCH  /api/v1/whiteboards/:id
- DELETE /api/v1/whiteboards/:id

Chat:
- GET    /api/v1/channels             # My channels (workspace + my projects)
- POST   /api/v1/channels             # Create channel
- GET    /api/v1/channels/:id/messages?before=&limit=
- POST   /api/v1/channels/:id/messages
- PATCH  /api/v1/channels/:id/read    # Mark as read

Notifications:
- GET    /api/v1/notifications
- PATCH  /api/v1/notifications/:id/read
- POST   /api/v1/notifications/read-all

Admin:
- GET    /api/v1/admin/users
- POST   /api/v1/admin/users/invite
- GET    /api/v1/admin/settings
- PATCH  /api/v1/admin/settings
- GET    /api/v1/admin/statuses/project
- POST   /api/v1/admin/statuses/project
- PATCH  /api/v1/admin/statuses/project/:id
- DELETE /api/v1/admin/statuses/project/:id
```

### 6.2 WebSocket Events

```
Connection: ws://host:8080/api/v1/ws

Client -> Server:
- { type: "subscribe", channel: "channel_id" }
- { type: "unsubscribe", channel: "channel_id" }
- { type: "typing", channel: "channel_id" }

Server -> Client:
- { type: "message", channel: "...", data: {...} }
- { type: "typing", channel: "...", user: "..." }
- { type: "notification", data: {...} }
- { type: "presence", users: [...] }
```

### 6.3 Response Format

```json
// Success
{
  "data": { ... },
  "meta": { "total": 100, "page": 1, "limit": 20 }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}

// Access denied
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not a member of this project"
  }
}
```

---

## 7. Deployment (Single Docker Container)

### 7.1 Quick Start

```bash
# Run WorkHub
docker run -d \
  -p 3000:8080 \
  -v workhub:/app/data \
  --name workhub \
  ghcr.io/your-org/workhub:latest

# Open in browser
open http://localhost:3000

# Complete the setup wizard to create your admin account
```

### 7.2 Dockerfile

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
RUN bun build --compile --minify src/index.ts --outfile workhub

# Stage 3: Production image
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# Install PostgreSQL and supervisord
RUN apt-get update && \
    apt-get install -y postgresql-16 supervisor && \
    rm -rf /var/lib/apt/lists/*

# Copy compiled backend and frontend
COPY --from=backend-builder /app/backend/workhub /app/workhub
COPY --from=frontend-builder /app/frontend/dist /app/static

# Configuration files
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh /app/workhub

EXPOSE 8080
VOLUME /app/data

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

### 7.3 Process Management (supervisord.conf)

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

[program:workhub]
command=/app/workhub
autostart=true
autorestart=true
priority=20
stdout_logfile=/var/log/supervisor/workhub.log
stderr_logfile=/var/log/supervisor/workhub.err
```

### 7.4 Environment Variables

All optional - sensible defaults provided:

| Variable | Default | Description |
|----------|---------|-------------|
| WORKHUB_PORT | 8080 | HTTP server port |
| WORKHUB_BASE_URL | http://localhost:8080 | Public URL (for links) |
| WORKHUB_DATA_DIR | /app/data | Data directory path |

**Session Secret:** Auto-generated on first run and saved to `/app/data/.session_secret`

### 7.5 Data Persistence

All persistent data stored in the `/app/data` volume:

```
/app/data/
├── postgres/              # PostgreSQL data files
├── .session_secret        # Auto-generated session secret
└── uploads/               # File uploads (future feature)
```

### 7.6 Common Commands

```bash
# View logs
docker logs -f workhub

# Stop
docker stop workhub

# Start (after stop)
docker start workhub

# Remove container (keeps data volume)
docker rm workhub

# Backup database
docker exec workhub pg_dump -U workhub workhub > backup.sql

# Restore database
cat backup.sql | docker exec -i workhub psql -U workhub workhub

# Update to new version
docker pull ghcr.io/your-org/workhub:latest
docker stop workhub && docker rm workhub
docker run -d -p 3000:8080 -v workhub:/app/data --name workhub ghcr.io/your-org/workhub:latest
```

---

## 8. Security Considerations

### 8.1 Authentication Flow

```
1. Login Request
   POST /api/v1/auth/login
   { "email": "...", "password": "..." }
                │
                ▼
2. Server validates credentials
   - Lookup user by email (Drizzle ORM)
   - Verify password with bcrypt (cost factor 12)
   - Check if user is disabled
                │
                ▼
3. Create session
   - Generate secure random session ID (32 bytes)
   - Store in sessions table: { id, user_id, expires_at, ip, user_agent }
   - Set HTTP-only, Secure, SameSite=Strict cookie
                │
                ▼
4. Subsequent requests
   - Session cookie sent automatically
   - Middleware validates session, sets user context
   - Middleware validates project membership for project routes
   - Sessions expire after 24h (configurable)
```

### 8.2 Security Measures

| Threat | Mitigation |
|--------|------------|
| Password storage | bcrypt with cost factor 12, never store plaintext |
| Session hijacking | HTTP-only cookies, Secure flag, SameSite=Strict |
| CSRF | SameSite=Strict cookies (browser protection) |
| XSS | React auto-escapes, CSP headers, sanitize markdown output |
| SQL injection | Parameterized queries (Drizzle ORM), no raw SQL concatenation |
| Brute force | Rate limiting on auth endpoints (5 attempts/minute per IP) |
| Unauthorized access | Project membership middleware on ALL project routes |
| Information disclosure | Generic error messages, no stack traces in production |

### 8.3 Security Headers

```typescript
// Required middleware for all responses
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy', 
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  await next();
});
```

### 8.4 First-Time Setup Security

The setup endpoint has special security considerations:

1. **One-time only**: Returns 403 Forbidden if any users exist in database
2. **Rate limited**: 10 requests/minute per IP to prevent abuse
3. **No authentication required**: Accessible without login (by design)
4. **Atomic operation**: Creates user + settings in single transaction

The setup status endpoint is always accessible and returns:
- `{ "initialized": false }` - No users, setup required
- `{ "initialized": true }` - Setup complete, normal operation

Frontend behavior:
- On any route, checks setup status
- If not initialized, redirects to `/setup`
- `/setup` page returns 404 after initialization

---

## 9. Technology Summary

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Bun 1.x | Fast, TypeScript native, single executable |
| Backend Framework | Hono | Lightweight, portable, great middleware |
| ORM | Drizzle ORM | Type-safe, SQL-like, lightweight |
| Database | PostgreSQL 16 | Robust, JSONB for flexible schemas |
| DB Driver | postgres (Bun) | High-performance PostgreSQL driver |
| Validation | Zod | Runtime type validation |
| Password Hashing | bcryptjs | Industry standard |
| Frontend | React 18 + TypeScript | Rich ecosystem, great for complex UIs |
| UI Components | shadcn/ui (Nova/Stone) | Beautiful, customizable, accessible |
| Icons | Phosphor Icons | Clean, consistent, React-native |
| Font | Inter | Highly readable, modern |
| Styling | Tailwind CSS | Utility-first, rapid development |
| Build Tool (Frontend) | Vite | Fast dev server and builds |
| State (Server) | TanStack Query | Caching, synchronization |
| State (Client) | Zustand | Simple, lightweight |
| Editor | BlockNote | Notion-style block-based editing |
| Whiteboard | @excalidraw/excalidraw | Proven, embedded component |
| Markdown Rendering | react-markdown + remark-gfm | GFM support |
| Calendar | FullCalendar | Feature-rich, React integration |
| Drag & Drop | dnd-kit | Accessible, performant |
| Process Manager | supervisord | Manages PostgreSQL + app processes |
| Deployment | Single Docker container | Simplest self-hosting experience |

---

## 10. Configuration Options (Admin-Managed)

These settings are managed via the Admin UI and stored in the `settings` table:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `workspace_name` | string | Set during setup | Displayed in header/title |
| `setup_completed` | boolean | true (after setup) | Indicates setup is done |
| `allow_registration` | boolean | false | Enable/disable self-registration |
| `session_duration_hours` | number | 24 | Session expiry time |
| `project_statuses` | array | see below | Customizable project statuses |
| `task_statuses` | array | see below | Customizable task statuses |

**Default Project Statuses:**
- Planning (gray)
- Active (green)
- On Hold (yellow)
- Completed (blue)
- Archived (gray)

**Default Task Statuses:**
- Backlog
- To Do
- In Progress
- Review
- Done

---

## 11. First-Time Setup Flow

When WorkHub is deployed fresh (empty database):

### 11.1 Flow Diagram

```
User visits any URL
        │
        ▼
Frontend calls GET /api/v1/setup/status
        │
        ▼
┌───────────────────────────────────┐
│ { "initialized": false }          │
└───────────────────────────────────┘
        │
        ▼
Redirect to /setup
        │
        ▼
┌───────────────────────────────────┐
│         Setup Wizard              │
│                                   │
│  Workspace Name: [Acme Corp    ]  │
│  Admin Email:    [admin@acme.com] │
│  Admin Name:     [John Doe     ]  │
│  Password:       [••••••••     ]  │
│  Confirm:        [••••••••     ]  │
│                                   │
│         [Complete Setup]          │
└───────────────────────────────────┘
        │
        ▼
POST /api/v1/setup/complete
        │
        ▼
Server creates:
- User (role: admin)
- Setting: workspace_name
- Setting: setup_completed = true
        │
        ▼
Redirect to /login
        │
        ▼
Admin logs in with new credentials
```

### 11.2 Setup Page UI

The setup page should:
- Display a welcoming message ("Welcome to WorkHub")
- Show a clean, professional form using shadcn components
- Require password minimum 8 characters
- Confirm password match before submit
- Show loading state during submission
- Handle errors gracefully (duplicate email, validation errors)
- Use Stone theme colors (neutral, professional)

### 11.3 Post-Setup Behavior

After setup completes:
- `/setup` route returns 404 or redirects to `/login`
- `GET /api/v1/setup/status` returns `{ "initialized": true }`
- Normal authentication flow applies
- Admin can access admin settings to invite more users

---

## Appendix: File Locations

| File | Path | Description |
|------|------|-------------|
| Backend entry | `backend/src/index.ts` | Hono app setup |
| Frontend entry | `frontend/src/main.tsx` | React app entry |
| Drizzle schema | `backend/src/db/schema.ts` | Database schema |
| Migrations | `backend/src/db/migrations/` | SQL migration files |
| Dockerfile | `Dockerfile` | Container build |
| supervisord config | `supervisord.conf` | Process management |
| shadcn config | `frontend/components.json` | UI component settings |
