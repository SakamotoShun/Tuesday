# Phase 4: Feature Completion - Implementation Plan

## Overview

This phase completes the remaining features: Docs UI, Tasks UI, Timeline, Meetings/Schedule, and Whiteboards.

**Estimated Total Effort:** 20-28 hours

---

## 4.1 Docs UI - List & Navigation

**Tasks:**
- [ ] Create docs list component for project sidebar
- [ ] Create doc tree view (nested docs)
- [ ] Create "New Doc" button and modal
- [ ] Create doc card/row component
- [ ] Implement doc deletion with confirmation

**Files to create:**
```
frontend/src/components/docs/DocList.tsx
frontend/src/components/docs/DocTreeItem.tsx
frontend/src/components/docs/NewDocModal.tsx
frontend/src/hooks/useDocs.ts
frontend/src/api/docs.ts
```

**Estimated:** 2 hours

---

## 4.2 Docs UI - Markdown Editor

**Tasks:**
- [ ] Integrate markdown editor (@uiw/react-md-editor or similar)
- [ ] Create Doc page with editor
- [ ] Implement autosave with debounce
- [ ] Add toolbar for formatting
- [ ] Support preview mode toggle

**Files to create:**
```
frontend/src/pages/DocPage.tsx
frontend/src/components/docs/MarkdownEditor.tsx
frontend/src/components/docs/DocToolbar.tsx
```

**Estimated:** 3-4 hours

---

## 4.3 Docs UI - Database View

**Tasks:**
- [ ] Create database table view component
- [ ] Support custom property columns
- [ ] Implement inline property editing
- [ ] Create property schema editor (add/remove/reorder columns)
- [ ] Create "New Page" row for adding entries

**Files to create:**
```
frontend/src/components/docs/DatabaseView.tsx
frontend/src/components/docs/PropertyCell.tsx
frontend/src/components/docs/SchemaEditor.tsx
```

**Estimated:** 4-5 hours

---

## 4.4 Tasks UI - Kanban Board

**Tasks:**
- [ ] Create Kanban board layout (columns by status)
- [ ] Create task card component
- [ ] Implement drag-and-drop with @dnd-kit
- [ ] Update task status on drop
- [ ] Create "Add Task" inline form per column

**Files to create:**
```
frontend/src/pages/ProjectTasks.tsx
frontend/src/components/tasks/KanbanBoard.tsx
frontend/src/components/tasks/KanbanColumn.tsx
frontend/src/components/tasks/TaskCard.tsx
frontend/src/components/tasks/AddTaskForm.tsx
frontend/src/hooks/useTasks.ts
frontend/src/api/tasks.ts
```

**Estimated:** 4-5 hours

---

## 4.5 Tasks UI - Task Detail Modal

**Tasks:**
- [ ] Create task detail modal/drawer
- [ ] Edit title, description (markdown)
- [ ] Assignee picker (multi-select)
- [ ] Date pickers for start/due date
- [ ] Status dropdown
- [ ] Delete task action

**Files to create:**
```
frontend/src/components/tasks/TaskDetailModal.tsx
frontend/src/components/tasks/AssigneePicker.tsx
frontend/src/components/common/DatePicker.tsx
```

**Estimated:** 2-3 hours

---

## 4.6 Timeline View

**Tasks:**
- [ ] Create timeline/Gantt component
- [ ] Display tasks with start/due dates as bars
- [ ] Tasks with only due date shown as milestones
- [ ] Implement date range navigation (week/month view)
- [ ] Add filtering by status/assignee
- [ ] Consider using a library (frappe-gantt, dhtmlx-gantt, or custom)

**Files to create:**
```
frontend/src/pages/ProjectTimeline.tsx
frontend/src/components/timeline/TimelineView.tsx
frontend/src/components/timeline/TimelineBar.tsx
frontend/src/components/timeline/TimelineFilters.tsx
```

**Estimated:** 4-5 hours

---

## 4.7 Meetings Backend

**Tasks:**
- [ ] Create MeetingRepository (CRUD, attendee queries)
- [ ] Create MeetingService with business logic
- [ ] Implement attendee management (many-to-many)
- [ ] GET/POST/PATCH/DELETE endpoints for meetings
- [ ] GET `/api/v1/meetings/my` for user's calendar

**Files to create:**
```
internal/repository/meeting.go
internal/service/meeting.go
internal/handler/meeting.go
```

**Estimated:** 2 hours

---

## 4.8 Meetings UI - Calendar

**Tasks:**
- [ ] Integrate FullCalendar React component
- [ ] Create project schedule page
- [ ] Create "My Calendar" page (all user's meetings)
- [ ] Create meeting detail modal
- [ ] Create new meeting form
- [ ] Support day/week/month views

**Files to create:**
```
frontend/src/pages/ProjectSchedule.tsx
frontend/src/pages/MyCalendar.tsx
frontend/src/components/calendar/CalendarView.tsx
frontend/src/components/calendar/MeetingModal.tsx
frontend/src/components/calendar/NewMeetingForm.tsx
frontend/src/hooks/useMeetings.ts
frontend/src/api/meetings.ts
```

**Estimated:** 3-4 hours

---

## 4.9 Whiteboards Backend

**Tasks:**
- [ ] Create WhiteboardRepository (CRUD, JSON data storage)
- [ ] Create WhiteboardService
- [ ] GET/POST/PATCH/DELETE endpoints
- [ ] Store Excalidraw scene JSON in JSONB column

**Files to create:**
```
internal/repository/whiteboard.go
internal/service/whiteboard.go
internal/handler/whiteboard.go
```

**Estimated:** 1-2 hours

---

## 4.10 Whiteboards UI

**Tasks:**
- [ ] Create whiteboard list page
- [ ] Integrate @excalidraw/excalidraw component
- [ ] Create whiteboard editor page
- [ ] Implement autosave for whiteboard data
- [ ] Add export to PNG/SVG functionality
- [ ] Create embed component for docs

**Files to create:**
```
frontend/src/pages/ProjectWhiteboards.tsx
frontend/src/pages/WhiteboardEditor.tsx
frontend/src/components/whiteboard/WhiteboardList.tsx
frontend/src/components/whiteboard/WhiteboardEmbed.tsx
frontend/src/hooks/useWhiteboards.ts
frontend/src/api/whiteboards.ts
```

**Estimated:** 3-4 hours

---

## Completion Criteria

Phase 4 is complete when:
1. Docs can be created, edited (markdown), and organized
2. Database docs support custom properties and table view
3. Kanban board works with drag-and-drop
4. Timeline shows tasks with dates
5. Meetings can be scheduled and viewed on calendar
6. Whiteboards can be created, edited, and embedded in docs
