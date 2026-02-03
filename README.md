# WorkHub

WorkHub is a self-hosted project management tool (Bun + React + PostgreSQL) designed for simplicity and ease of deployment.

## Quick Start

```bash
# Deploy WorkHub with a single command
docker run -d \
  -p 3000:8080 \
  -v workhub:/app/data \
  --name workhub \
  ghcr.io/your-org/workhub:latest

# Open http://localhost:3000 and complete the setup wizard
```

## Overview

This repo includes:

- **Backend**: Bun + Hono API with embedded PostgreSQL
- **Frontend**: React + TypeScript + Vite + shadcn/ui
- **Database**: PostgreSQL 16 (embedded in container)
- **ORM**: Drizzle ORM with type-safe queries
- **Real-time**: WebSockets for chat and notifications

## Features

- **Single Container Deployment** - Everything in one Docker container
- **First-Time Setup Wizard** - No config files needed, just run and configure via UI
- **Projects & Tasks** - Kanban boards, task management, timelines
- **Documentation** - Notion-style docs with BlockNote editor
- **Whiteboards** - Collaborative drawing with Excalidraw
- **Chat** - Real-time messaging with WebSockets
- **Meetings** - Calendar and scheduling
- **Admin Settings** - Manage users, workspace settings, and custom statuses

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun 1.x |
| Backend | Hono |
| Database | PostgreSQL 16 (embedded) |
| ORM | Drizzle ORM |
| Frontend | React 18 + TypeScript |
| UI | shadcn/ui (Nova/Stone theme) |
| State | TanStack Query + Zustand |
| Editor | BlockNote |
| Whiteboard | Excalidraw |
| Calendar | FullCalendar |

## Deployment

### Production

```bash
# Simple deployment
docker run -d \
  -p 3000:8080 \
  -v workhub:/app/data \
  --name workhub \
  ghcr.io/your-org/workhub:latest

# With custom options
docker run -d \
  -p 8080:8080 \
  -v /path/to/data:/app/data \
  -e WORKHUB_BASE_URL=https://workhub.example.com \
  --name workhub \
  ghcr.io/your-org/workhub:latest
```

The first time you access WorkHub, you'll be redirected to the setup wizard where you can:
- Set your workspace/company name
- Create the first admin user

### Docker Compose (Alternative)

If you prefer using Docker Compose:

```yaml
version: '3.8'

services:
  workhub:
    image: ghcr.io/your-org/workhub:latest
    container_name: workhub
    restart: unless-stopped
    ports:
      - "3000:8080"
    volumes:
      - workhub-data:/app/data
    environment:
      - WORKHUB_BASE_URL=https://workhub.example.com

volumes:
  workhub-data:
```

### Environment Variables

All optional - sensible defaults provided:

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKHUB_PORT` | `8080` | HTTP server port |
| `WORKHUB_BASE_URL` | `http://localhost:8080` | Public URL for links |
| `WORKHUB_DATA_DIR` | `/app/data` | Data directory path |

**Note**: `SESSION_SECRET` is auto-generated on first run and saved to `/app/data/.session_secret`

### Data Persistence

All data is stored in the `/app/data` volume:
- `postgres/` - PostgreSQL database files
- `.session_secret` - Auto-generated session secret
- `uploads/` - File uploads (future feature)

### Reverse Proxy Setup

WorkHub is designed to run behind a reverse proxy for HTTPS termination. Configure your reverse proxy to forward to `http://workhub:8080`.

**Nginx Proxy Manager example:**
- Forward Hostname/IP: `workhub`
- Forward Port: `8080`
- Scheme: `http`

**Caddy example:**
```
workhub.example.com {
    reverse_proxy localhost:3000
}
```

## Development Setup

### Prerequisites

- Bun 1.x (install from https://bun.sh)
- Docker (for PostgreSQL)

### Backend Development

```bash
# 1. Start PostgreSQL for development
docker run -d \
  --name workhub-db \
  -e POSTGRES_DB=workhub \
  -e POSTGRES_USER=workhub \
  -e POSTGRES_PASSWORD=workhub \
  -p 5432:5432 \
  -v workhub-dev:/var/lib/postgresql/data \
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

## Project Structure

```
workhub/
├── backend/                 # Bun + Hono backend
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── repositories/    # Database access (Drizzle)
│   │   ├── db/              # Schema and migrations
│   │   └── ...
│   ├── drizzle.config.ts
│   └── package.json
│
├── frontend/                # React + shadcn/ui frontend
│   ├── src/
│   │   ├── pages/           # Route components
│   │   ├── components/      # UI components
│   │   ├── api/             # API clients
│   │   ├── hooks/           # Custom hooks
│   │   └── store/           # State management
│   └── package.json
│
├── Dockerfile               # Production build
├── supervisord.conf         # Process management
└── plan/
    └── architecture.md      # Detailed architecture docs
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
docker build -t workhub:latest .

# Run container
docker run -d -p 3000:8080 -v workhub:/app/data --name workhub workhub:latest

# View logs
docker logs -f workhub

# Stop container
docker stop workhub

# Remove container
docker rm workhub

# Backup database
docker exec workhub pg_dump -U workhub workhub > backup.sql

# Restore database
cat backup.sql | docker exec -i workhub psql -U workhub workhub
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

### And more...

See `plan/architecture.md` for complete API documentation.

## Authentication

WorkHub uses cookie-based sessions:
- Cookie name: `session_id`
- HTTP-only, Secure, SameSite=Strict
- 24-hour expiry (configurable)
- Stored in PostgreSQL `sessions` table

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

### Container won't start

```bash
# Check logs
docker logs workhub

# Check if PostgreSQL is running inside container
docker exec workhub pg_isready -U workhub
```

### Can't connect to database in development

Make sure PostgreSQL is running:
```bash
docker ps | grep workhub-db
```

If not, start it:
```bash
docker start workhub-db
```

### Setup page not showing

Check if users exist in database:
```bash
docker exec -it workhub psql -U workhub workhub -c "SELECT COUNT(*) FROM users;"
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

- Issues: [GitHub Issues](https://github.com/your-org/workhub/issues)
- Documentation: `plan/architecture.md`
- Development Guide: `AGENTS.md`
