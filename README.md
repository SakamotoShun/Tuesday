# Tuesday

> A free, self-hosted alternative to Basecamp, Mattermost, Notion, and Monday.

Tuesday is a self-hosted project management tool (Bun + React + PostgreSQL) designed for simplicity and ease of deployment. Run your team's work hub without per-seat SaaS pricing.

## Quick Start

```bash
# Build and run with Docker
docker compose up -d

# Visit http://localhost:8080 and complete the setup wizard
```

That's it. Tuesday runs as a single Docker container with an embedded PostgreSQL database. No external dependencies required.

## Features

- **First-Time Setup Wizard** - No config files needed, configure via UI
- **Authentication** - Secure session-based auth with bcrypt password hashing
- **Projects** - Create and manage projects with members and statuses
- **Docs** - BlockNote editor + database-style docs with real-time collaboration
- **Tasks** - Kanban boards with drag-and-drop + My Work aggregation
- **Meetings** - Project calendar + My Calendar
- **Whiteboards** - Excalidraw editor with real-time collaboration + exports
- **Chat** - Channels, DMs, mentions, reactions, typing indicators
- **Notifications** - Real-time notification inbox
- **Admin** - Users, statuses, workspace settings, teams
- **Profile** - Avatar uploads + password change
- **File Uploads** - Attachments with lifecycle management
- **Dark Mode** - Full light/dark/system support

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

### Docker (recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/tuesday.git
cd tuesday

# Copy and edit environment variables (optional - defaults work out of the box)
cp .env.example .env

# Build and start
docker compose up -d
```

Visit `http://localhost:8080` to complete the setup wizard and create your admin account.

### Configuration

All settings are optional with sensible defaults. Key options:

| Variable | Default | Description |
|----------|---------|-------------|
| `TUESDAY_PORT` | `8080` | Host port mapping |
| `TUESDAY_BASE_URL` | `http://localhost:8080` | Public URL |
| `SESSION_SECRET` | Auto-generated | Session signing key |
| `UPLOAD_MAX_SIZE_MB` | `10` | Max upload size |

See [docs/configuration.md](docs/configuration.md) for the full reference.

### Reverse Proxy

For HTTPS, put Tuesday behind a reverse proxy:

**Caddy** (automatic HTTPS):
```
tuesday.example.com {
    reverse_proxy localhost:8080
}
```

**Nginx**: See [docs/deployment.md](docs/deployment.md) for full Nginx configuration with WebSocket support.

### Backup & Restore

```bash
# Backup
./scripts/backup.sh

# Restore
./scripts/restore.sh backups/tuesday_backup_20260101_120000.sql.gz
```

See [docs/backup.md](docs/backup.md) for detailed procedures.

### Upgrading

```bash
git pull origin master
docker compose build
docker compose up -d
```

Migrations run automatically on startup. See [docs/upgrade.md](docs/upgrade.md) for details.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/deployment.md](docs/deployment.md) | Docker deployment, reverse proxy setup |
| [docs/configuration.md](docs/configuration.md) | All environment variables |
| [docs/backup.md](docs/backup.md) | Backup and restore procedures |
| [docs/upgrade.md](docs/upgrade.md) | Version upgrade guide |

## Development Setup

### Prerequisites

- Bun 1.x (install from https://bun.sh)
- Docker (for PostgreSQL)

### Backend

```bash
# Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Install dependencies and start
cd backend
bun install
bun run db:migrate
bun run dev
```

Backend runs at `http://localhost:8080`.

### Frontend

```bash
cd frontend
bun install
bun run dev
```

Frontend runs at `http://localhost:3000` and proxies API calls to `http://localhost:8080`.

### First-Time Setup

1. Visit `http://localhost:3000`
2. Complete the setup wizard to create the admin account
3. Login and start exploring

## Project Structure

```
tuesday/
├── backend/                 # Bun + Hono backend
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── repositories/    # Database access (Drizzle)
│   │   ├── middleware/      # Auth, rate limiting, static serving
│   │   ├── db/              # Schema and migrations
│   │   ├── collab/          # Real-time collaboration hubs
│   │   └── utils/           # Helpers
│   └── package.json
│
├── frontend/                # React + shadcn/ui frontend
│   ├── src/
│   │   ├── pages/           # Route components
│   │   ├── components/      # UI components
│   │   ├── api/             # API clients
│   │   ├── hooks/           # Custom hooks
│   │   ├── store/           # Zustand state management
│   │   └── providers/       # React context providers
│   └── package.json
│
├── docs/                    # Operational documentation
├── scripts/                 # Backup/restore scripts
├── Dockerfile               # Production multi-stage build
├── docker-compose.yml       # Production deployment
├── docker-compose.dev.yml   # Development PostgreSQL
├── supervisord.conf         # Process management
├── entrypoint.sh            # Container initialization
└── .env.example             # Configuration template
```

## Common Commands

### Development

```bash
# Backend
cd backend
bun test                    # Run tests
bun test --coverage         # Tests with coverage
bun run typecheck           # Type check
bun run db:migrate          # Run migrations
bun run db:studio           # Open Drizzle Studio

# Frontend
cd frontend
bun test                    # Run tests
bun run typecheck           # Type check
bun run build               # Production build
```

### Docker

```bash
docker compose up -d        # Start
docker compose down         # Stop
docker compose logs -f      # View logs
docker compose ps           # Check status
docker compose build        # Rebuild image
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

### Projects
- `GET /projects` - List my projects
- `POST /projects` - Create project
- `GET /projects/:id` - Get project
- `PATCH /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project

### Tasks
- `GET /projects/:id/tasks` - List project tasks
- `POST /projects/:id/tasks` - Create task
- `GET /tasks/:id` - Get task
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task
- `GET /tasks/my` - List my tasks

### Docs
- `GET /projects/:id/docs` - List project docs
- `POST /projects/:id/docs` - Create project doc
- `GET /docs/:id` - Get doc
- `PATCH /docs/:id` - Update doc
- `DELETE /docs/:id` - Delete doc

### Meetings
- `GET /projects/:id/meetings` - List meetings
- `POST /projects/:id/meetings` - Create meeting
- `GET /meetings/my` - List my meetings

### Whiteboards
- `GET /projects/:id/whiteboards` - List whiteboards
- `POST /projects/:id/whiteboards` - Create whiteboard
- `GET /whiteboards/:id` - Get whiteboard

### Chat + DMs
- `GET /channels` - List channels
- `POST /channels` - Create channel
- `GET /channels/:id/messages` - List messages
- `POST /channels/:id/messages` - Send message
- `GET /dms` - List DMs
- `POST /dms` - Create/open DM

### Teams
- `GET /teams` - List teams
- `POST /teams` - Create team

### Notifications
- `GET /notifications` - List notifications
- `POST /notifications/read-all` - Mark all as read

### Profile & Files
- `GET /profile` - Get profile
- `PATCH /profile` - Update profile
- `POST /files` - Upload file
- `GET /files/:id` - Download file

See `plan/architecture.md` for complete API documentation.

## Security

- **Rate Limiting**: Auth endpoints limited to 5 requests/minute per IP
- **Session Management**: Secure, HTTP-only cookies with SameSite=Strict
- **Access Control**: Two-level model (workspace role + project membership)
- **SQL Injection**: Prevented via Drizzle ORM parameterized queries
- **XSS Prevention**: React auto-escaping + server-side sanitization
- **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options

## Troubleshooting

### Container won't start

```bash
docker compose logs --tail 50
```

### Can't connect to database in development

```bash
docker ps | grep tuesday-dev-db
# If not running:
docker compose -f docker-compose.dev.yml up -d
```

### WebSocket not connecting through reverse proxy

Ensure your proxy passes WebSocket headers. See [docs/deployment.md](docs/deployment.md).

### Reset to fresh state

```bash
docker compose down -v
docker compose up -d
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the guidelines in `AGENTS.md`
4. Run tests (`bun test` in both `backend/` and `frontend/`)
5. Commit (`git commit -m 'feat: add amazing feature'`)
6. Push and open a Pull Request

## License

[License Type] - See LICENSE file for details
