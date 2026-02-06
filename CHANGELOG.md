# Changelog

All notable changes to Tuesday will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Production Docker deployment with embedded PostgreSQL
- Multi-stage Dockerfile for optimized image builds
- Static file serving with SPA fallback for production
- Frontend code splitting and lazy loading for heavy components
- supervisord process management for PostgreSQL and application server
- Docker Compose configuration for production and development
- Database backup and restore scripts
- Comprehensive environment variable configuration
- Deployment, configuration, upgrade, and backup documentation
- Health check endpoint for container monitoring
- AI bots with OpenAI integration and configurable system prompts
- Webhook bots for external service integration with rich message rendering
- Project templates with full content cloning (docs, tasks, channels, whiteboards)

## [0.1.0] - 2026-02-06

### Added
- Initial release with all core features
- Authentication with session-based cookies and bcrypt password hashing
- First-time setup wizard
- Project management with configurable statuses and member roles
- Document editor (BlockNote) with nested documents and database views
- Task management with Kanban board, drag-and-drop, and assignees
- Meeting scheduling with calendar views (FullCalendar)
- Whiteboard editor (Excalidraw) with real-time collaboration
- Real-time chat with channels, DMs, mentions, reactions, and typing indicators
- In-app notifications with real-time delivery
- Team management with cascading project membership
- Admin panel for user management, workspace settings, and status configuration
- User profile management with avatar uploads and password changes
- File upload system with two-phase lifecycle and automatic cleanup
- Dark mode with light/dark/system theme support
- Rate limiting on authentication endpoints
- Security headers (CSP, X-Frame-Options, etc.)
- Role-based access control (workspace admin/member + project owner/member)
