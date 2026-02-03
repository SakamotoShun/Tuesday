# Phase 2: Core Features - Implementation Plan

## Overview

This phase implements the core domain features: Projects, Docs, and Tasks with full access control.

**Estimated Total Effort:** 12-16 hours

---

## 2.1 Project Repository & Service

**Tasks:**
- [ ] Create ProjectRepository (CRUD, membership queries)
- [ ] Create ProjectMemberRepository (add/remove/update members)
- [ ] Create ProjectStatusRepository (CRUD for custom statuses)
- [ ] Create ProjectService with business logic
- [ ] Implement access control filtering (members only see their projects)

**Files to create:**
```
internal/repository/project.go
internal/repository/project_member.go
internal/repository/project_status.go
internal/service/project.go
```

**Estimated:** 2-3 hours

---

## 2.2 Project Middleware

**Tasks:**
- [ ] Create RequireProjectMember middleware
- [ ] Create RequireProjectOwner middleware
- [ ] Extract project ID from URL and validate membership
- [ ] Add project to request context for handlers

**Files to create:**
```
internal/middleware/project.go
```

**Estimated:** 1 hour

---

## 2.3 Project Handlers

**Tasks:**
- [ ] GET `/api/v1/projects` - List user's projects
- [ ] POST `/api/v1/projects` - Create project (user becomes owner)
- [ ] GET `/api/v1/projects/:id` - Get project details
- [ ] PATCH `/api/v1/projects/:id` - Update project (owner only)
- [ ] DELETE `/api/v1/projects/:id` - Delete project (owner only)
- [ ] GET `/api/v1/projects/:id/members` - List members
- [ ] POST `/api/v1/projects/:id/members` - Add member (owner only)
- [ ] PATCH `/api/v1/projects/:id/members/:userId` - Update member role
- [ ] DELETE `/api/v1/projects/:id/members/:userId` - Remove member

**Files to create:**
```
internal/handler/project.go
```

**Estimated:** 2-3 hours

---

## 2.4 Document Repository & Service

**Tasks:**
- [ ] Create DocRepository (CRUD, tree queries for parent/child)
- [ ] Create DocService with business logic
- [ ] Support personal docs (null project_id)
- [ ] Support database docs (is_database=true, schema field)
- [ ] Implement properties JSONB handling

**Files to create:**
```
internal/repository/doc.go
internal/service/doc.go
```

**Estimated:** 2 hours

---

## 2.5 Document Handlers

**Tasks:**
- [ ] GET `/api/v1/projects/:id/docs` - List project docs
- [ ] POST `/api/v1/projects/:id/docs` - Create doc
- [ ] GET `/api/v1/docs/:id` - Get doc with content
- [ ] PATCH `/api/v1/docs/:id` - Update doc
- [ ] DELETE `/api/v1/docs/:id` - Delete doc
- [ ] GET `/api/v1/docs/personal` - List personal docs
- [ ] POST `/api/v1/docs/personal` - Create personal doc

**Files to create:**
```
internal/handler/doc.go
```

**Estimated:** 2 hours

---

## 2.6 Task Repository & Service

**Tasks:**
- [ ] Create TaskRepository (CRUD, status filtering, assignee queries)
- [ ] Create TaskStatusRepository (CRUD for custom statuses)
- [ ] Create TaskService with business logic
- [ ] Implement assignee management (many-to-many)
- [ ] Support kanban ordering (sort_order field)

**Files to create:**
```
internal/repository/task.go
internal/repository/task_status.go
internal/service/task.go
```

**Estimated:** 2 hours

---

## 2.7 Task Handlers

**Tasks:**
- [ ] GET `/api/v1/projects/:id/tasks` - List project tasks (with filters)
- [ ] POST `/api/v1/projects/:id/tasks` - Create task
- [ ] GET `/api/v1/tasks/:id` - Get task details
- [ ] PATCH `/api/v1/tasks/:id` - Update task
- [ ] DELETE `/api/v1/tasks/:id` - Delete task
- [ ] GET `/api/v1/tasks/my` - List user's tasks across projects
- [ ] PATCH `/api/v1/tasks/:id/status` - Update task status (kanban move)
- [ ] PATCH `/api/v1/tasks/:id/assignees` - Update assignees

**Files to create:**
```
internal/handler/task.go
```

**Estimated:** 2 hours

---

## 2.8 Admin Status Management

**Tasks:**
- [ ] GET `/api/v1/admin/statuses/project` - List project statuses
- [ ] POST `/api/v1/admin/statuses/project` - Create status
- [ ] PATCH `/api/v1/admin/statuses/project/:id` - Update status
- [ ] DELETE `/api/v1/admin/statuses/project/:id` - Delete status
- [ ] Same endpoints for task statuses

**Files to update:**
```
internal/handler/admin.go (new file)
internal/server/server.go (add routes)
```

**Estimated:** 1-2 hours

---

## Completion Criteria

Phase 2 is complete when:
1. Users can create projects and become owners
2. Project owners can add/remove members
3. Members can only see projects they belong to
4. Docs can be created within projects
5. Tasks can be created, assigned, and moved between statuses
6. Admins can customize project and task statuses
