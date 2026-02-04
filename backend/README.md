# Tuesday Backend

This is the backend for Tuesday - a self-hosted project management tool built with Bun, Hono, and Drizzle ORM.

## Features

- **Bun Runtime** - Fast JavaScript runtime
- **Hono Framework** - Lightweight web framework
- **Drizzle ORM** - Type-safe SQL-like ORM
- **PostgreSQL** - Robust relational database
- **bcrypt** - Secure password hashing
- **Session-based Auth** - HTTP-only cookies with secure defaults

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

### Setup
- `GET /api/v1/setup/status` - Check if setup is complete
- `POST /api/v1/setup/complete` - Complete first-time setup

### Authentication
- `POST /api/v1/auth/register` - Register new user (if enabled)
- `POST /api/v1/auth/login` - Login with email/password
- `POST /api/v1/auth/logout` - Logout current user
- `GET /api/v1/auth/me` - Get current user info

### Admin
- `GET /api/v1/admin/settings` - Get admin settings
- `PATCH /api/v1/admin/settings` - Update admin settings (e.g. allow registration)

### Health
- `GET /health` - Health check endpoint

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
├── db/                    # Database configuration
│   ├── client.ts          # PostgreSQL connection
│   ├── schema.ts          # Drizzle schema definitions
│   ├── migrations/        # SQL migration files
│   └── migrate.ts         # Migration runner
├── middleware/            # HTTP middleware
│   ├── auth.ts            # Session validation
│   ├── cors.ts            # CORS handling
│   ├── logging.ts         # Request logging
│   ├── ratelimit.ts       # Rate limiting
│   ├── recovery.ts        # Error recovery
│   └── security.ts        # Security headers
├── repositories/          # Database access layer
│   ├── user.ts            # User repository
│   ├── session.ts         # Session repository
│   └── settings.ts        # Settings repository
├── routes/                # HTTP route handlers
│   ├── auth.ts            # Auth endpoints
│   ├── setup.ts           # Setup endpoints
│   └── index.ts           # Route aggregation
├── services/              # Business logic
│   ├── auth.ts            # Authentication service
│   └── setup.ts           # Setup service
├── types/                 # TypeScript types
├── utils/                 # Utilities
│   ├── password.ts        # Password hashing
│   ├── response.ts        # API response helpers
│   └── validation.ts      # Zod schemas
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
