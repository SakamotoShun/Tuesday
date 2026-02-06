# Tuesday Backend

This is the backend for Tuesday - a self-hosted project management tool built with Bun, Hono, and Drizzle ORM.

## Features

- **Bun Runtime** - Fast JavaScript runtime
- **Hono Framework** - Lightweight web framework
- **Drizzle ORM** - Type-safe SQL-like ORM
- **PostgreSQL** - Robust relational database
- **bcrypt** - Secure password hashing
- **Session-based Auth** - HTTP-only cookies with secure defaults
- **Real-time** - WebSocket support for chat, notifications, docs, and whiteboards
- **Chat + DMs** - Channels, direct messages, reactions, file attachments
- **Notifications** - Real-time notification delivery
- **Files** - Upload lifecycle (pending/attached/avatar)
- **Teams** - Team membership and project assignment

## Quick Start

### Prerequisites

- Bun 1.x (https://bun.sh)
- PostgreSQL 16

### Development Setup

1. Install dependencies:
```bash
bun install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start PostgreSQL (using Docker):
```bash
docker run -d \
  --name tuesday-db \
  -e POSTGRES_USER=tuesday \
  -e POSTGRES_PASSWORD=tuesday \
  -e POSTGRES_DB=tuesday \
  -p 5432:5432 \
  postgres:16-alpine
```

4. Run migrations:
```bash
bun run db:migrate
```

5. Start the development server:
```bash
bun run dev
```

The server will be available at `http://localhost:8080`.

### Using Docker Compose

For an easier setup, use Docker Compose:

```bash
docker-compose up -d
```

This will start both the database and backend services.

## API Endpoints

Base path: `/api/v1`

### Setup
- `GET /setup/status`
- `POST /setup/complete`

### Authentication
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### Projects
- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `DELETE /projects/:id`
- `GET /projects/:id/members`
- `POST /projects/:id/members`
- `PATCH /projects/:id/members/:userId`
- `DELETE /projects/:id/members/:userId`

### Docs
- `GET /projects/:id/docs`
- `POST /projects/:id/docs`
- `GET /docs/:id`
- `PATCH /docs/:id`
- `DELETE /docs/:id`
- `GET /docs/personal`
- `POST /docs/personal`

### Tasks
- `GET /projects/:id/tasks`
- `POST /projects/:id/tasks`
- `GET /tasks/:id`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`
- `PATCH /tasks/:id/status`
- `PATCH /tasks/:id/assignees`
- `PATCH /tasks/:id/order`
- `GET /tasks/my`

### Meetings
- `GET /projects/:id/meetings`
- `POST /projects/:id/meetings`
- `GET /meetings/:id`
- `PATCH /meetings/:id`
- `DELETE /meetings/:id`
- `GET /meetings/my`

### Whiteboards
- `GET /projects/:id/whiteboards`
- `POST /projects/:id/whiteboards`
- `GET /whiteboards/:id`
- `PATCH /whiteboards/:id`
- `DELETE /whiteboards/:id`

### Chat + DMs
- `GET /channels`
- `POST /channels`
- `GET /channels/:id/messages`
- `POST /channels/:id/messages`
- `PATCH /channels/:id/read`
- `GET /dms`
- `POST /dms`

### Notifications
- `GET /notifications`
- `PATCH /notifications/:id/read`
- `POST /notifications/read-all`

### Teams
- `GET /teams`
- `POST /teams`
- `GET /teams/:id`
- `PATCH /teams/:id`
- `DELETE /teams/:id`

### Profile
- `GET /profile`
- `PATCH /profile`
- `POST /profile/avatar`
- `DELETE /profile/avatar`
- `POST /profile/password`

### Files
- `POST /files`
- `GET /files/:id`
- `DELETE /files/:id`

### Admin
- `GET /admin/settings`
- `PATCH /admin/settings`
- `GET /admin/users`
- `POST /admin/users`
- `PATCH /admin/users/:id`
- `DELETE /admin/users/:id`
- `GET /admin/statuses/project`
- `POST /admin/statuses/project`
- `PATCH /admin/statuses/project/:id`
- `DELETE /admin/statuses/project/:id`
- `POST /admin/statuses/project/reorder`
- `GET /admin/statuses/task`
- `POST /admin/statuses/task`
- `PATCH /admin/statuses/task/:id`
- `DELETE /admin/statuses/task/:id`
- `POST /admin/statuses/task/reorder`

### Health
- `GET /health`

## Testing

Run unit tests:
```bash
bun test
```

Run tests with coverage:
```bash
bun test --coverage
```

## Project Structure

```
src/
├── collab/                # Real-time collaboration hubs
├── db/                    # Database configuration + migrations
├── middleware/            # Auth, CORS, rate limiting, access control
├── repositories/          # Drizzle data access layer
├── routes/                # API route handlers
├── services/              # Business logic services
├── types/                 # Shared TypeScript types
├── utils/                 # Helpers (validation, response, password)
├── websocket.ts           # WebSocket server setup
├── config.ts              # Environment configuration
└── index.ts               # Application entry point
```

## Security

- **Password Hashing**: bcrypt with cost factor 12
- **Session Cookies**: HTTP-only, Secure, SameSite=Strict
- **CSRF Protection**: SameSite=Strict cookies
- **Rate Limiting**: 5 requests/minute on auth endpoints
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, CSP

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://tuesday:tuesday@localhost:5432/tuesday` | PostgreSQL connection string |
| `PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `development` | Environment mode |
| `SESSION_SECRET` | - | Secret for session signing (min 32 chars) |
| `SESSION_DURATION_HOURS` | `24` | Session expiry time |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS allowed origin |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |
| `UPLOAD_MAX_SIZE_MB` | `10` | Max upload size (MB) |
| `UPLOAD_STORAGE_PATH` | `/app/data/uploads` | Upload storage path |
| `UPLOAD_ALLOWED_TYPES` | `image/*,application/pdf,text/plain,text/markdown` | Allowed MIME types |
| `UPLOAD_PENDING_TTL_MINUTES` | `30` | Pending file TTL (minutes) |
| `DELETED_MESSAGE_FILE_RETENTION_DAYS` | `30` | Retention for deleted message files |

## First-Time Setup

When the application starts with an empty database:

1. Visit `GET /api/v1/setup/status` to check initialization status
2. If not initialized, call `POST /api/v1/setup/complete` with:
   - `workspaceName`: Your organization name
   - `adminEmail`: Admin user email
   - `adminName`: Admin user name
   - `adminPassword`: Admin user password (min 8 chars)
3. After setup, use the admin credentials to login at `POST /api/v1/auth/login`

## Development Commands

```bash
# Run in development mode with hot reload
bun run dev

# Run migrations
bun run db:migrate

# Generate new migrations
bun run db:generate

# Run tests
bun test

# Type check
bun run typecheck

# Build for production
bun run build
```

## Response Format

All API responses follow a consistent format:

**Success:**
```json
{
  "data": { ... },
  "meta": { ... }  // optional
}
```

**Error:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [  // optional validation errors
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```
