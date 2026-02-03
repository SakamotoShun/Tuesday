# Phase 5: Real-time & Polish - Implementation Plan

## Overview

This phase adds real-time features (WebSocket chat, notifications) and polishes the user experience.

**Estimated Total Effort:** 16-22 hours

---

## 5.1 WebSocket Infrastructure (Backend)

**Tasks:**
- [ ] Create WebSocket hub (connection manager)
- [ ] Create client connection handler
- [ ] Implement authentication for WebSocket connections
- [ ] Define event types (message, typing, notification, presence)
- [ ] Implement pub/sub for channels
- [ ] Handle connection lifecycle (connect, disconnect, reconnect)

**Files to create:**
```
internal/websocket/hub.go
internal/websocket/client.go
internal/websocket/events.go
internal/websocket/handler.go
```

**Estimated:** 3-4 hours

---

## 5.2 Chat Backend

**Tasks:**
- [ ] Create ChannelRepository (CRUD, membership)
- [ ] Create MessageRepository (CRUD, pagination, mentions)
- [ ] Create ChannelMemberRepository (join, leave, last_read)
- [ ] Create ChatService with business logic
- [ ] Implement mention parsing (@username)
- [ ] GET/POST endpoints for channels and messages
- [ ] Broadcast new messages via WebSocket

**Files to create:**
```
internal/repository/channel.go
internal/repository/message.go
internal/service/chat.go
internal/handler/chat.go
```

**Estimated:** 3-4 hours

---

## 5.3 Chat Frontend

**Tasks:**
- [ ] Create WebSocket connection manager
- [ ] Create channel list component
- [ ] Create message list with infinite scroll (load older)
- [ ] Create message input with @mention autocomplete
- [ ] Create typing indicator
- [ ] Implement unread badges
- [ ] Create project chat page

**Files to create:**
```
frontend/src/api/websocket.ts
frontend/src/hooks/useWebSocket.ts
frontend/src/hooks/useChat.ts
frontend/src/pages/ProjectChat.tsx
frontend/src/components/chat/ChannelList.tsx
frontend/src/components/chat/MessageList.tsx
frontend/src/components/chat/MessageInput.tsx
frontend/src/components/chat/MentionAutocomplete.tsx
frontend/src/components/chat/TypingIndicator.tsx
frontend/src/api/chat.ts
```

**Estimated:** 4-5 hours

---

## 5.4 Notifications Backend

**Tasks:**
- [ ] Create NotificationRepository (CRUD, mark read)
- [ ] Create NotificationService
- [ ] Trigger notifications on:
  - @mention in chat
  - Task assignment
  - Meeting invite
  - Project membership changes
- [ ] GET `/api/v1/notifications` endpoint
- [ ] PATCH for marking as read
- [ ] Broadcast new notifications via WebSocket

**Files to create:**
```
internal/repository/notification.go
internal/service/notification.go
internal/handler/notification.go
```

**Estimated:** 2-3 hours

---

## 5.5 Notifications Frontend

**Tasks:**
- [ ] Create notification bell icon with unread count
- [ ] Create notifications dropdown/panel
- [ ] Create notifications page (full list)
- [ ] Mark as read on view
- [ ] Link notifications to relevant content
- [ ] Real-time updates via WebSocket

**Files to create:**
```
frontend/src/pages/Notifications.tsx
frontend/src/components/notifications/NotificationBell.tsx
frontend/src/components/notifications/NotificationPanel.tsx
frontend/src/components/notifications/NotificationItem.tsx
frontend/src/hooks/useNotifications.ts
frontend/src/api/notifications.ts
```

**Estimated:** 2-3 hours

---

## 5.6 Home Dashboard

**Tasks:**
- [ ] Create home/dashboard page
- [ ] Show recent activity
- [ ] Show upcoming meetings (next 7 days)
- [ ] Show tasks due soon
- [ ] Show unread notifications summary
- [ ] Quick links to recent projects

**Files to create:**
```
frontend/src/pages/Home.tsx
frontend/src/components/dashboard/RecentActivity.tsx
frontend/src/components/dashboard/UpcomingMeetings.tsx
frontend/src/components/dashboard/TasksDueSoon.tsx
```

**Estimated:** 2-3 hours

---

## 5.7 My Work Page

**Tasks:**
- [ ] Create "My Work" page showing all assigned tasks
- [ ] Group by project or status
- [ ] Filter by status, date range
- [ ] Quick status update actions
- [ ] Link to task detail in project context

**Files to create:**
```
frontend/src/pages/MyWork.tsx
frontend/src/components/mywork/TaskGroupList.tsx
frontend/src/components/mywork/TaskFilters.tsx
```

**Estimated:** 2 hours

---

## 5.8 Admin UI

**Tasks:**
- [ ] Create admin page layout
- [ ] User management (list, invite, disable)
- [ ] Workspace settings form
- [ ] Project status management
- [ ] Task status management
- [ ] Registration toggle

**Files to create:**
```
frontend/src/pages/Admin.tsx
frontend/src/components/admin/UserManagement.tsx
frontend/src/components/admin/WorkspaceSettings.tsx
frontend/src/components/admin/StatusManager.tsx
frontend/src/hooks/useAdmin.ts
frontend/src/api/admin.ts
```

**Estimated:** 2-3 hours

---

## 5.9 Polish & UX

**Tasks:**
- [ ] Add loading skeletons for all data fetching
- [ ] Add empty states for lists
- [ ] Add error boundaries and error states
- [ ] Improve form validation feedback
- [ ] Add keyboard shortcuts (Cmd+K search, etc.)
- [ ] Add toast notifications for actions
- [ ] Mobile responsive refinements
- [ ] Dark mode support (optional)

**Files to create/update:**
```
frontend/src/components/common/Skeleton.tsx
frontend/src/components/common/EmptyState.tsx
frontend/src/components/common/ErrorBoundary.tsx
frontend/src/components/common/Toast.tsx
frontend/src/hooks/useKeyboardShortcuts.ts
```

**Estimated:** 3-4 hours

---

## Completion Criteria

Phase 5 is complete when:
1. WebSocket connection established on login
2. Chat messages appear in real-time
3. @mentions trigger notifications
4. Notifications appear without page refresh
5. Dashboard shows relevant user information
6. Admin can manage users and settings
7. UI feels polished with loading/error states
