# Phase 3: Frontend Foundation - Implementation Plan

## Overview

This phase establishes the React frontend with authentication, routing, and basic project views.

**Estimated Total Effort:** 10-14 hours

---

## 3.1 Project Scaffolding

**Tasks:**
- [ ] Initialize Vite + React + TypeScript project
- [ ] Configure path aliases (@/components, @/hooks, etc.)
- [ ] Set up folder structure per architecture.md
- [ ] Install core dependencies
- [ ] Configure ESLint + Prettier
- [ ] Set up Tailwind CSS (or chosen styling solution)

**Commands:**
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss postcss autoprefixer
npm install @tanstack/react-query zustand react-router-dom axios
```

**Files to create:**
```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   └── vite-env.d.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── vite.config.ts
```

**Estimated:** 1 hour

---

## 3.2 API Client Layer

**Tasks:**
- [ ] Create axios instance with base URL and credentials
- [ ] Set up request/response interceptors
- [ ] Create typed API functions for auth endpoints
- [ ] Create typed API functions for project endpoints
- [ ] Handle 401 responses (redirect to login)

**Files to create:**
```
frontend/src/api/client.ts
frontend/src/api/auth.ts
frontend/src/api/projects.ts
frontend/src/api/types.ts
```

**Estimated:** 1-2 hours

---

## 3.3 State Management

**Tasks:**
- [ ] Set up TanStack Query provider
- [ ] Create auth store (Zustand) for current user
- [ ] Create UI store for sidebar state, theme, etc.
- [ ] Set up query invalidation patterns

**Files to create:**
```
frontend/src/store/authStore.ts
frontend/src/store/uiStore.ts
frontend/src/providers/QueryProvider.tsx
```

**Estimated:** 1 hour

---

## 3.4 Auth Hooks & Context

**Tasks:**
- [ ] Create useAuth hook (login, logout, register, current user)
- [ ] Create AuthProvider for app-wide auth state
- [ ] Create ProtectedRoute component
- [ ] Handle loading states during auth check

**Files to create:**
```
frontend/src/hooks/useAuth.ts
frontend/src/providers/AuthProvider.tsx
frontend/src/components/auth/ProtectedRoute.tsx
```

**Estimated:** 1-2 hours

---

## 3.5 Layout Components

**Tasks:**
- [ ] Create AppLayout (sidebar + main content)
- [ ] Create Sidebar with navigation
- [ ] Create Header with user menu
- [ ] Create responsive mobile navigation
- [ ] Create common UI components (Button, Input, Modal, etc.)

**Files to create:**
```
frontend/src/components/layout/AppLayout.tsx
frontend/src/components/layout/Sidebar.tsx
frontend/src/components/layout/Header.tsx
frontend/src/components/common/Button.tsx
frontend/src/components/common/Input.tsx
frontend/src/components/common/Modal.tsx
```

**Estimated:** 2-3 hours

---

## 3.6 Auth Pages

**Tasks:**
- [ ] Create Login page
- [ ] Create Register page (shown if registration enabled)
- [ ] Form validation and error display
- [ ] Redirect to home after login

**Files to create:**
```
frontend/src/pages/Login.tsx
frontend/src/pages/Register.tsx
```

**Estimated:** 1-2 hours

---

## 3.7 Project Pages

**Tasks:**
- [ ] Create Projects list page
- [ ] Create Project detail page (tabs container)
- [ ] Create New Project modal/form
- [ ] Create Project Settings page (owner only)
- [ ] Wire up to backend API

**Files to create:**
```
frontend/src/pages/Projects.tsx
frontend/src/pages/ProjectDetail.tsx
frontend/src/pages/ProjectSettings.tsx
frontend/src/components/projects/ProjectCard.tsx
frontend/src/components/projects/NewProjectModal.tsx
frontend/src/hooks/useProjects.ts
```

**Estimated:** 2-3 hours

---

## 3.8 Routing Setup

**Tasks:**
- [ ] Configure React Router
- [ ] Set up route structure matching wireframes
- [ ] Implement lazy loading for pages
- [ ] Handle 404 pages

**Files to update:**
```
frontend/src/App.tsx
frontend/src/routes.tsx (new)
```

**Route structure:**
```
/login
/register
/                     -> Home/Dashboard
/projects             -> Project list
/projects/:id         -> Project detail (with tabs)
/projects/:id/docs
/projects/:id/tasks
/projects/:id/timeline
/projects/:id/schedule
/projects/:id/whiteboards
/projects/:id/chat
/my-work              -> Tasks assigned to me
/my-calendar          -> My meetings
/notifications
/admin                -> Admin settings (admin only)
```

**Estimated:** 1 hour

---

## Completion Criteria

Phase 3 is complete when:
1. Frontend builds and runs with `npm run dev`
2. Login/logout flow works with backend
3. Protected routes redirect to login when unauthenticated
4. Project list displays user's projects from API
5. Basic navigation between pages works
6. Responsive layout works on mobile
