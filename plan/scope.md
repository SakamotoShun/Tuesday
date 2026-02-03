# Scope: Internal Basecamp/Notion Hybrid (v1)

## Product Statement
Build a self-hosted internal "work hub" that combines Notion-style markdown docs + Basecamp-style project organization + lightweight project chat, so the team can plan, execute, and communicate in one branded system without per-seat SaaS pricing.

## Target Users
- Internal team (~20 users)
- Roles:
  - Admin: manage users, workspace settings
  - Member: create/manage content within projects they belong to
  - Viewer (optional v1): read-only access to assigned projects

## Core Objects (Mental Model)
- Project: container for work
- Doc: markdown page (project or personal)
- Task: work item (kanban + timeline)
- Meeting: scheduled event (project calendar)
- Whiteboard: Excalidraw-style canvas (project-scoped; embeddable in docs)
- Channel: chat space (workspace-wide or project-scoped)
- Message: chat post with @mentions

## In-Scope (v1)

### 1) Authentication + Users
- Single sign-on (SSO) login for all users (exact IdP TBD: Google Workspace / Microsoft Entra / Keycloak)
- User profile: name, email, avatar (optional)
- Admin user management: invite/disable users

### 2) Projects
- Project list + project detail page
- Project fields (align with current Notion DB):
  - Project Name, Client, Status, Owner(s), Type, Start Date, Target End Date
- Project membership management (add/remove members, role per project)
- Project navigation tabs:
  - Docs / Tasks / Timeline / Schedule / Whiteboards / Chat

### 3) Docs (Markdown)
- Create/edit/view markdown documents
- Project-scoped docs + personal docs
- Basic formatting: headings, lists, links, code blocks
- (Optional v1) simple mention/linking to tasks/projects (`#123` or `/task/...` style)
- Notion-style "database" for docs within a project:
  - Database views: table view (v1), additional views (later)
  - Page properties (schema) can be created/edited by users (Notion-like)
  - Templates for pages (default properties + starter content)
  - Embed whiteboards into pages (preview card + open)

### 3.1) Whiteboards (Excalidraw)
- Multiple whiteboards per project
- Whiteboard list per project (create/rename/delete)
- Whiteboard editor (Excalidraw-style): draw shapes/arrows/text/freehand
- Save/load board state
- Embed boards into docs (open-in-editor)
- Export (v1): download PNG/SVG (no server-side file storage)

### 4) Tasks
- Task CRUD: create/edit/close
- Fields:
  - title, description_md, status, assignees, start date (optional), due date (optional)
- Kanban view per project (columns driven by status)
- "My work" view: tasks assigned to me across projects

### 5) Timeline View
- Project timeline using task start/due (or due-only displayed as milestone)
- Filtering by status/assignee

### 6) Meetings / Project Calendar
- Meeting CRUD: title, start/end, attendees (users), location/link, notes_md
- Project calendar view
- "My calendar" view (meetings where I'm an attendee)

### 7) Chat (Native, Work-Focused)
- Workspace channels:
  - Town Square (default)
  - Announcements (restricted posting; optional)
- Project channels:
  - Default channel per project (e.g. `proj-<slug>`)
  - Ability for members to create additional project channels (e.g. `design`, `qa`)
- Messaging:
  - Send messages to channels
  - @mentions (`@username`) with mention notifications (in-app)
- Read state:
  - Unread indicator per channel (minimal: last read message tracking)

### 8) Basic Admin + Ops
- Self-hosted deployment via Docker Compose
- Postgres persistence + migration management
- Basic audit events (optional v1): user created, project created, membership changes

## Out of Scope (v1) / Not Now
- Mobile apps and push notifications
- File uploads / attachments (docs/tasks/chat)
- Whiteboard realtime multiplayer collaboration (can add later)
- Whiteboard image/file attachments inside boards
- Chat threads, reactions, rich message features beyond markdown-ish text
- Full-text search across everything (can add later)
- External integrations (Slack, Google Calendar sync, GitHub, etc.)
- Multi-tenant / client workspaces (single internal tenant only)
- Complex permissions (page-level ACLs); keep it project-membership based

## Notion Migration Scope (v1)
- Import Projects from existing Notion `Projects` database (field mapping 1:1)
- Docs/tasks import is optional and deferred unless explicitly requested

## Non-Functional Requirements
- Branding: custom logo/name/colors; consistent UI across modules
- Performance: responsive for 20 users; real-time chat updates
- Whiteboards: performant editing for typical internal diagrams; autosave should not block UI
- Reliability: simple backups; easy upgrades
- Security:
  - HTTPS required
  - Least-privilege roles
  - Secure session management; CSRF protection where relevant

## Success Criteria (v1 Acceptance)
- Users can SSO login and see only projects they belong to
- A project contains working Docs, Tasks (Kanban), Timeline, Schedule, and Chat
- Docs support database-style pages with editable properties + templates
- A project can contain multiple whiteboards; boards can be created/edited and embedded in docs
- @mentions work and produce a visible notification/inbox
- Docker Compose up/down works on a single server with persisted data
- Project list can be imported from Notion successfully

## Open Decisions (Must Lock Before Build)
- SSO provider: Google Workspace / Microsoft Entra / Keycloak (OIDC)
- Status taxonomy for tasks (reuse project statuses vs separate task statuses)
- Whether "Announcements" is required in v1 (recommended yes, locked posting)
- Whiteboard collaboration mode for v1: single-editor with autosave (recommended) vs realtime multi-user
- Default doc database schema + templates (initial set and naming)
