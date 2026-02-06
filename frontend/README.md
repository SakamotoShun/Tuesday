# Tuesday Frontend

React + Vite + TypeScript frontend for Tuesday, built with shadcn/ui, TanStack Query, and Zustand.

## Development Setup

```bash
cd frontend
bun install
bun run dev
```

The dev server runs at `http://localhost:5173` and proxies API requests to `http://localhost:8080`.

## Tests

```bash
bun test
```

## Build

```bash
bun run build
bun run preview
```

## Project Structure

```
src/
├── api/                # API client modules
├── components/         # UI components by domain
│   ├── admin/
│   ├── auth/
│   ├── calendar/
│   ├── chat/
│   ├── common/
│   ├── dashboard/
│   ├── docs/
│   ├── layout/
│   ├── mywork/
│   ├── profile/
│   ├── projects/
│   ├── tasks/
│   ├── ui/
│   └── whiteboard/
├── hooks/              # TanStack Query hooks
├── pages/              # Route-level pages
├── providers/          # App providers (Query, Theme)
├── store/              # Zustand stores
├── test/               # Test setup
├── App.tsx             # App root
├── index.css           # Global styles
└── main.tsx            # Entry point
```

## Conventions

- **Data fetching**: TanStack Query hooks under `src/hooks/`
- **Client state**: Zustand stores under `src/store/`
- **UI**: shadcn/ui components under `src/components/ui/`
- **Routing**: React Router (see `src/App.tsx`)
