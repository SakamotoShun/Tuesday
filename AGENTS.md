# AGENTS.md - WorkHub Project Guidelines

This document provides guidance for AI agents working on the WorkHub codebase - a self-hosted project management tool with Bun backend, React frontend, and embedded PostgreSQL database.

## Project Overview

- **Backend**: Bun + Hono framework
- **Frontend**: React 18 + TypeScript + Vite + shadcn/ui
- **Database**: PostgreSQL 16 (embedded in Docker container)
- **ORM**: Drizzle ORM
- **Real-time**: WebSockets
- **Deployment**: Single Docker container

## Build, Test, and Lint Commands

### Backend (Bun + TypeScript)

```bash
# Install dependencies
bun install

# Run development server (with hot reload)
bun run dev

# Build for production
bun run build

# Build compiled executable (for Docker)
bun build --compile --minify src/index.ts --outfile workhub

# Run all tests
bun test

# Run single test file
bun test src/services/auth.test.ts

# Run tests with coverage
bun test --coverage

# Lint
bun run lint

# Format code
bun run format

# Type check
bun run typecheck

# Run Drizzle migrations
bun run db:migrate

# Generate Drizzle migrations
bun run db:generate

# Open Drizzle Studio (database GUI)
bun run db:studio
```

### Frontend (React/TypeScript)

```bash
# Install dependencies (in frontend/ directory)
bun install

# Run development server
bun run dev

# Build for production
bun run build

# Run all tests
bun test

# Run single test file
bun test src/hooks/useAuth.test.ts

# Run tests matching pattern
bun test --testNamePattern="login"

# Run tests in watch mode
bun test --watch

# Lint
bun run lint

# Format code
bun run format

# Type check
bun run typecheck
```

### Docker Commands

```bash
# Build Docker image
docker build -t workhub:latest .

# Run container (production)
docker run -d \
  -p 3000:8080 \
  -v workhub:/app/data \
  --name workhub \
  workhub:latest

# View logs
docker logs -f workhub

# Stop container
docker stop workhub

# Start stopped container
docker start workhub

# Remove container
docker rm workhub

# Backup database
docker exec workhub pg_dump -U workhub workhub > backup.sql

# Restore database
cat backup.sql | docker exec -i workhub psql -U workhub workhub
```

## Code Style Guidelines

### Bun + Hono Backend

#### Project Structure
```
backend/
src/
├── index.ts                 # Entry point, Hono app setup
├── config.ts                # Environment configuration
├── routes/                  # HTTP handlers (one file per domain)
├── middleware/              # HTTP middleware
├── services/                # Business logic layer
├── repositories/            # Database access layer (Drizzle)
├── db/                      # Database schema and migrations
├── websocket/               # Real-time communication
└── utils/                   # Shared utilities
```

#### Naming Conventions
- Use `camelCase` for variables, functions, and methods
- Use `PascalCase` for types, interfaces, classes, and components
- Use `SCREAMING_SNAKE_CASE` for constants
- Handler functions: `getProject`, `createTask`, `updateUser`
- Service methods: `createUser`, `authenticateUser`, `listProjectTasks`
- Repository methods: `findById`, `findByEmail`, `create`, `update`, `delete`

#### Error Handling
```typescript
// Return errors, don't throw unless necessary
async function getUser(id: string): Promise<User | null> {
  const user = await userRepo.findById(id);
  if (!user) {
    return null;
  }
  return user;
}

// Use custom error types for domain errors
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

// In Hono handlers
app.get('/api/users/:id', async (c) => {
  const user = await userService.getUser(c.req.param('id'));
  if (!user) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }
  return c.json({ data: user });
});
```

#### Database Queries with Drizzle ORM
```typescript
// CORRECT - Type-safe Drizzle queries
const user = await db.query.users.findFirst({
  where: eq(users.id, userId)
});

const projects = await db.query.projects.findMany({
  where: eq(projects.ownerId, userId),
  with: {
    members: true,
    tasks: true
  }
});

// CORRECT - Parameterized inserts
await db.insert(users).values({
  id: generateUUID(),
  email: 'user@example.com',
  passwordHash: await hashPassword('password'),
  name: 'John Doe',
  role: 'member',
  createdAt: new Date()
});

// WRONG - Never concatenate SQL strings
const query = `SELECT * FROM users WHERE id = '${userId}'`;
```

### React/TypeScript Frontend

#### Project Structure
```
frontend/src/
├── api/                    # API client layer
├── hooks/                  # Custom React hooks
├── store/                  # State management (Zustand)
├── pages/                  # Route-level components
├── components/             # Reusable UI components
│   └── ui/                 # shadcn/ui components
├── lib/                    # Utilities
└── styles/                 # Global styles
```

#### Naming Conventions
- Components: `PascalCase` (`TaskCard.tsx`, `ProjectList.tsx`)
- Hooks: `camelCase` with `use` prefix (`useAuth.ts`, `useProjects.ts`)
- Utilities: `camelCase` (`formatDate.ts`, `parseMarkdown.ts`)
- Types/Interfaces: `PascalCase` (`User`, `Project`, `TaskStatus`)
- Constants: `SCREAMING_SNAKE_CASE` for true constants

#### Component Guidelines
```tsx
// Prefer function components with TypeScript interfaces
interface TaskCardProps {
  task: Task;
  onStatusChange: (status: TaskStatus) => void;
}

export function TaskCard({ task, onStatusChange }: TaskCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{task.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Content */}
      </CardContent>
    </Card>
  );
}

// Use shadcn/ui components consistently
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
```

#### State Management
- Use TanStack Query for server state (API data)
- Use Zustand for client state (UI state, user preferences)
- Avoid prop drilling - use stores or context

```tsx
// Server state with TanStack Query
const { data: projects, isLoading, error } = useQuery({
  queryKey: ['projects'],
  queryFn: api.projects.list,
});

// Client state with Zustand
const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));
```

#### Error Handling
```tsx
// Use error boundaries for component errors
// Handle API errors in hooks/queries
const { data, error, isLoading } = useQuery({
  queryKey: ['project', projectId],
  queryFn: () => api.getProject(projectId),
});

if (error) {
  return <ErrorDisplay error={error} />;
}
```

## shadcn/ui Guidelines

### Adding Components

```bash
# Add a new shadcn component
bunx --bun shadcn@latest add button

# Add multiple components
bunx --bun shadcn@latest add card input dialog
```

### Using Components

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// Use variants consistently
<Button variant="default">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Danger</Button>
```

### Theme Configuration

The project uses:
- **Style**: Nova
- **Base Color**: Stone
- **Icon Library**: Phosphor Icons
- **Font**: Inter
- **Radius**: Small

## API Response Format

### Success Response
```json
{
  "data": { ... },
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [{ "field": "email", "message": "Invalid email format" }]
  }
}
```

## Security Requirements (CRITICAL)

### Authentication & Sessions
- All routes require authentication except `/api/v1/auth/login`, `/api/v1/auth/register`, and `/api/v1/setup/*`
- Password hashing: bcrypt with cost factor 12, NEVER store plaintext
- Session ID: Generate 32 bytes of cryptographically secure random data
- Session storage: Store in `sessions` table with `user_id`, `expires_at`, `ip`, `user_agent`
- Session expiry: 24 hours (configurable via admin settings)
- Check if user is disabled on every session validation

### Cookie Security
```typescript
// REQUIRED cookie settings - never deviate from these
c.setCookie('session_id', sessionID, {
  httpOnly: true,           // Prevents JavaScript access
  secure: true,             // HTTPS only
  sameSite: 'Strict',       // CSRF protection
  path: '/',
  maxAge: 60 * 60 * 24,     // 24 hours
});
```

### Security Headers (Required Middleware)
```typescript
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

### SQL Injection Prevention
- ALWAYS use Drizzle ORM for database queries
- NEVER concatenate user input into SQL strings
- NEVER use string interpolation for SQL

```typescript
// CORRECT - Drizzle ORM
const user = await db.query.users.findFirst({
  where: eq(users.id, userId)
});

// WRONG - SQL injection vulnerability
const query = `SELECT * FROM users WHERE id = '${userId}'`;
```

### XSS Prevention
- React auto-escapes by default - never use `dangerouslySetInnerHTML`
- Sanitize all markdown output before rendering
- Validate and sanitize user-generated content on the server

### Rate Limiting
- Auth endpoints (`/login`, `/register`): 5 attempts per minute per IP
- Setup endpoint: 10 attempts per minute per IP
- Implement exponential backoff for repeated failures
- Log and alert on suspicious patterns

### Error Handling Security
- Return generic error messages to clients (e.g., "Invalid credentials")
- Never expose stack traces in production
- Log detailed errors server-side only

## Access Control (CRITICAL)

### Two-Level Authorization Model
1. **Workspace Role** (`User.role`): `admin` or `member`
2. **Project Membership** (`ProjectMember.role`): `owner` or `member`

### Key Access Rules
- Members can ONLY access projects where they have a `ProjectMember` record
- NO implicit access - workspace membership does NOT grant project access
- Admins can view/manage all projects (for support/maintenance)
- All project resources (docs, tasks, etc.) inherit project membership requirements

### Middleware Chain for Project Routes
```typescript
// Middleware chain for project routes
app.route('/api/v1/projects/:projectId', async (c) => {
  await requireAuth(c);
  await requireProjectMember(c, c.req.param('projectId'));
});

app.get('/api/v1/projects/:projectId', getProjectHandler);
app.put('/api/v1/projects/:projectId', requireProjectOwner, updateProjectHandler);
app.delete('/api/v1/projects/:projectId', requireProjectOwner, deleteProjectHandler);
```

### Database Query Pattern
```typescript
// ALWAYS filter by project membership (non-admin users)
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

## Database Conventions

- All primary keys use UUID
- Use `created_at` and `updated_at` timestamps
- JSONB for flexible schemas (Doc.properties, Whiteboard.data)
- Use Drizzle migrations for schema changes (`backend/src/db/migrations/`)
- Define schema in `backend/src/db/schema.ts`

## Testing Guidelines

- Write unit tests for services and utilities
- Write integration tests for handlers
- Mock database in unit tests (use test containers or in-memory)
- Use test fixtures for consistent test data
- Test error cases, not just happy paths

## Commit Messages

- Use conventional commit format: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Keep messages concise and descriptive
- Do not mention AI or code generation tools in commits

## Key Libraries

### Backend
- `hono` - HTTP framework
- `drizzle-orm` - Type-safe ORM
- `drizzle-kit` - Database migrations and CLI
- `postgres` - PostgreSQL driver
- `zod` - Schema validation
- `bcryptjs` - Password hashing

### Frontend
- `@tanstack/react-query` - Server state management
- `zustand` - Client state management
- `@excalidraw/excalidraw` - Whiteboard component
- `@blocknote/core` + `@blocknote/react` - Block-based editor
- `react-markdown` + `remark-gfm` - Markdown rendering
- `@dnd-kit/core` - Drag and drop (kanban)
- `@fullcalendar/react` - Calendar views
- `shadcn/ui` - UI component library
- `@phosphor-icons/react` - Icon library

## Architecture Reference

See `plan/architecture.md` for detailed specifications including:
- Complete API endpoint definitions
- Data model diagrams
- WebSocket event types
- Docker configuration
- Security implementation details
- First-time setup flow
