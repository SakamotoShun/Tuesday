# Tuesday

> A free, self-hosted alternative to Basecamp, Mattermost, Notion, and Monday.

Tuesday is a self-hosted project management tool (Bun + React + PostgreSQL) designed for simplicity and ease of deployment. Run your team's work hub without per-seat SaaS pricing.

## Development Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Backend Foundation (Auth, Database, API) |
| Phase 2 | ✅ Complete | Core Features (Projects, Docs, Tasks APIs) |
| Phase 3 | ✅ Complete | Frontend Foundation (React, Auth UI, Project Views) |
| Phase 4 | ✅ Complete | Feature Completion (Docs, Tasks, Meetings, Whiteboards) |
| Phase 5 | ✅ Complete | Real-time & Polish (WebSocket, Chat, Notifications, Admin) |
| Phase 6 | 🔄 Pending | Deployment (Docker, Documentation) |

## Quick Start (Development)

```bash
# Backend
cd backend
docker compose up -d
bun install
bun run db:migrate
bun run dev

# Frontend (new terminal)
cd ../frontend
bun install
bun run dev
```

## Overview

This repo includes:

- **Backend**: Bun + Hono API with embedded PostgreSQL
- **Frontend**: React 18 + TypeScript + Vite + shadcn/ui
- **Database**: PostgreSQL 16 (embedded in container)
- **ORM**: Drizzle ORM with type-safe queries
- **Real-time**: WebSockets for chat and notifications

## Features

### Implemented
- **First-Time Setup Wizard** - No config files needed, configure via UI
- **Authentication** - Secure session-based auth with bcrypt password hashing
- **Projects** - Create and manage projects with members and statuses
- **Docs** - BlockNote editor + database-style docs
- **Tasks** - Kanban boards + My Work aggregation
- **Meetings** - Project calendar + My Calendar
- **Whiteboards** - Excalidraw editor + exports
- **Chat** - Channels, DMs, mentions, reactions, typing indicators
- **Notifications** - Real-time notification inbox
- **Admin** - Users, statuses, workspace settings, teams
- **Profile** - Avatar uploads + password change
- **File Uploads** - Attachments with lifecycle management
- **Dark Mode** - Full light/dark/system support
- **Responsive Layout** - Works on desktop and mobile

### Coming Soon (Phase 6)
- **Single Container Deployment** - Production Docker image + static serving
- **Operational Docs** - Backup/restore, upgrades, deployment guide

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun 1.x |
| Backend | Hono |
| Database | PostgreSQL 16 (embedded) |
| ORM | Drizzle ORM |
| Frontend | React 19 + TypeScript |
| UI | shadcn/ui (Nova/Stone theme) |
| State | TanStack Query + Zustand |
| Editor | BlockNote |
| Whiteboard | Excalidraw |
| Calendar | FullCalendar |

## Deployment

Phase 6 (deployment) is not implemented yet. For now, use the development setup above.

### Environment Variables (Development)

All optional - sensible defaults provided:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://tuesday:tuesday@localhost:5432/tuesday` | PostgreSQL connection string |
| `PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `development` | Environment mode |
| `SESSION_SECRET` | `default-secret-change-in-production-min-32-chars` | Session signing secret |
| `SESSION_DURATION_HOURS` | `24` | Session expiry time |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS allowed origin |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |
| `UPLOAD_MAX_SIZE_MB` | `10` | Max upload size (MB) |
| `UPLOAD_STORAGE_PATH` | `/app/data/uploads` | Upload storage path |
| `UPLOAD_ALLOWED_TYPES` | `image/*,application/pdf,text/plain,text/markdown` | Allowed MIME types |
| `UPLOAD_PENDING_TTL_MINUTES` | `30` | Pending file TTL (minutes) |
| `DELETED_MESSAGE_FILE_RETENTION_DAYS` | `30` | Retention for deleted message files |

### Data Persistence (Development)

- PostgreSQL data is stored in your Docker volume (see `tuesday-dev`).
- File uploads are stored in `UPLOAD_STORAGE_PATH` (defaults to `/app/data/uploads`).

### Reverse Proxy Setup (Planned)

Reverse proxy configuration is planned for Phase 6 deployment.

## Development Setup

### Prerequisites

- Bun 1.x (install from https://bun.sh)
- Docker (for PostgreSQL)

### Backend Development

```bash
# 1. Start PostgreSQL for development
docker run -d \
  --name tuesday-db \
  -e POSTGRES_DB=tuesday \
  -e POSTGRES_USER=tuesday \
  -e POSTGRES_PASSWORD=tuesday \
  -p 5432:5432 \
  -v tuesday-dev:/var/lib/postgresql/data \
  postgres:16-alpine

# 2. Install dependencies
cd backend
bun install

# 3. Run migrations
bun run db:migrate

# 4. Start development server
bun run dev
```

The backend will be available at `http://localhost:8080`.

### Frontend Development

```bash
# 1. Install dependencies
cd frontend
bun install

# 2. Start development server
bun run dev
```

The frontend will be available at `http://localhost:5173` and proxies API calls to `http://localhost:8080`.

### First-Time Setup in Development

1. Visit `http://localhost:5173`
2. You'll be redirected to `/setup` if no users exist
3. Complete the setup wizard to create the admin account
4. Login and start exploring!

### Theme Support

Tuesday supports light, dark, and system themes:
- Click your avatar in the top-right corner
- Select "Theme" to cycle through Light → Dark → System
- Your preference is saved automatically

## Project Structure

```
tuesday/
├── backend/                 # Bun + Hono backend
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── repositories/    # Database access (Drizzle)
│   │   ├── middleware/      # Auth, rate limiting, etc.
│   │   ├── db/              # Schema and migrations
│   │   └── utils/           # Helpers
│   ├── drizzle.config.ts
│   └── package.json
│
├── frontend/                # React + shadcn/ui frontend
│   ├── src/
│   │   ├── pages/           # Route components
│   │   ├── components/      # UI components
│   │   │   ├── ui/          # shadcn/ui components
│   │   │   ├── layout/      # App layout components
│   │   │   └── projects/    # Project-specific components
│   │   ├── api/             # API clients
│   │   ├── hooks/           # Custom hooks
│   │   ├── store/           # Zustand state management
│   │   └── providers/       # React context providers
│   └── package.json
│
├── plan/                    # Development planning docs
│   ├── architecture.md      # System architecture
│   ├── phases.md            # Development phases
│   └── scope.md             # Project scope
│
├── backend/Dockerfile       # Backend-only container build
├── AGENTS.md                # Development guidelines
└── README.md                # This file
```

## Common Commands

### Backend

```bash
cd backend

# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Lint
bun run lint

# Format code
bun run format

# Type check
bun run typecheck

# Generate Drizzle migrations
bun run db:generate

# Run migrations
bun run db:migrate

# Open Drizzle Studio (database GUI)
bun run db:studio

# Build for production
bun run build

# Build single executable
bun build --compile --minify src/index.ts --outfile workhub
```

### Frontend

```bash
cd frontend

# Run tests
bun test

# Lint
bun run lint

# Format code
bun run format

# Type check
bun run typecheck

# Build for production
bun run build

# Add shadcn component
bunx --bun shadcn@latest add button
```

### Docker

```bash
# Build image
docker build -t tuesday:latest .

# Run container
docker run -d -p 3000:8080 -v tuesday:/app/data --name tuesday tuesday:latest

# View logs
docker logs -f tuesday

# Stop container
docker stop tuesday

# Remove container
docker rm tuesday

# Backup database
docker exec tuesday pg_dump -U tuesday tuesday > backup.sql

# Restore database
cat backup.sql | docker exec -i tuesday psql -U tuesday tuesday
```

## API

Base path: `/api/v1`

### Setup
- `GET /setup/status` - Check if setup is complete
- `POST /setup/complete` - Complete first-time setup

### Authentication
- `POST /auth/register` - Register new user (if enabled)
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `GET /auth/me` - Current user info

### Admin
- `GET /admin/settings` - Get admin settings
- `PATCH /admin/settings` - Update admin settings (e.g. allow registration)

### Users
- `GET /users` - List users (admin only)
- `GET /users/:id` - Get user
- `PATCH /users/:id` - Update user
- `DELETE /users/:id` - Delete user (admin only)

### Projects
- `GET /projects` - List my projects
- `POST /projects` - Create project
- `GET /projects/:id` - Get project
- `PATCH /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project

### Docs
- `GET /projects/:id/docs` - List project docs
- `POST /projects/:id/docs` - Create project doc
- `GET /docs/:id` - Get doc
- `PATCH /docs/:id` - Update doc
- `DELETE /docs/:id` - Delete doc
- `GET /docs/personal` - List personal docs
- `POST /docs/personal` - Create personal doc

### Tasks
- `GET /projects/:id/tasks` - List project tasks
- `POST /projects/:id/tasks` - Create task
- `GET /tasks/:id` - Get task
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task
- `PATCH /tasks/:id/status` - Update status
- `PATCH /tasks/:id/assignees` - Update assignees
- `PATCH /tasks/:id/order` - Update order
- `GET /tasks/my` - List my tasks

### Meetings
- `GET /projects/:id/meetings` - List meetings
- `POST /projects/:id/meetings` - Create meeting
- `GET /meetings/:id` - Get meeting
- `PATCH /meetings/:id` - Update meeting
- `DELETE /meetings/:id` - Delete meeting
- `GET /meetings/my` - List my meetings

### Whiteboards
- `GET /projects/:id/whiteboards` - List whiteboards
- `POST /projects/:id/whiteboards` - Create whiteboard
- `GET /whiteboards/:id` - Get whiteboard
- `PATCH /whiteboards/:id` - Update whiteboard
- `DELETE /whiteboards/:id` - Delete whiteboard

### Chat + DMs
- `GET /channels` - List channels
- `POST /channels` - Create channel
- `GET /channels/:id/messages` - List messages
- `POST /channels/:id/messages` - Send message
- `PATCH /channels/:id/read` - Mark read
- `GET /dms` - List DMs
- `POST /dms` - Create/open DM

### Notifications
- `GET /notifications` - List notifications
- `PATCH /notifications/:id/read` - Mark as read
- `POST /notifications/read-all` - Mark all as read

### Teams
- `GET /teams` - List teams
- `POST /teams` - Create team
- `GET /teams/:id` - Get team
- `PATCH /teams/:id` - Update team
- `DELETE /teams/:id` - Delete team

### Profile
- `GET /profile` - Get profile
- `PATCH /profile` - Update profile
- `POST /profile/avatar` - Upload avatar
- `DELETE /profile/avatar` - Remove avatar
- `POST /profile/password` - Change password

### Files
- `POST /files` - Upload file
- `GET /files/:id` - Download file
- `DELETE /files/:id` - Delete file

See `plan/architecture.md` for complete API documentation.

## Authentication

Tuesday uses cookie-based sessions:
- Cookie name: `session_id`
- HTTP-only, Secure, SameSite=Strict
- 24-hour expiry (configurable)
- Stored in PostgreSQL `sessions` table
- Passwords hashed with bcrypt (cost factor 12)

## Security

- **Rate Limiting**: Auth endpoints limited to 5 requests/minute per IP
- **Session Management**: Secure, HTTP-only cookies with CSRF protection
- **Access Control**: Two-level model (workspace role + project membership)
- **SQL Injection**: Prevented via Drizzle ORM parameterized queries
- **XSS Prevention**: React auto-escaping + content sanitization

## Architecture

See `plan/architecture.md` for detailed architecture documentation including:
- Complete system design
- Data model diagrams
- Access control model
- Security considerations
- First-time setup flow

## Development Guidelines

See `AGENTS.md` for development guidelines including:
- Code style conventions
- Naming conventions
- Security requirements
- Testing guidelines
- Database conventions

## Troubleshooting

### Container deployment (Planned)

Production container troubleshooting will be documented in Phase 6.

### Can't connect to database in development

Make sure PostgreSQL is running:
```bash
docker ps | grep tuesday-db
```

If not, start it:
```bash
docker start tuesday-db
```

### Setup page not showing

Check if users exist in database:
```bash
docker exec -it tuesday-db psql -U tuesday tuesday -c "SELECT COUNT(*) FROM users;"
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the code style guidelines
4. Run tests (`bun test`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

[License Type] - See LICENSE file for details

## Support

- Issues: [GitHub Issues](https://github.com/your-org/tuesday/issues)
- Documentation: `plan/architecture.md`
- Development Guide: `AGENTS.md`
- Development Phases: `plan/phases.md`
