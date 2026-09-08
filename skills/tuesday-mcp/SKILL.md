---
name: tuesday-mcp
description: Use when working with the Tuesday MCP server to search workspaces, read or write documents, manage projects and tasks, or log time. Provides safe document and table workflows, optimistic-concurrency rules, and retry guidance for all Tuesday MCP tools.
compatibility: Requires a connected Tuesday MCP server and scopes for the requested operations.
metadata:
  product: Tuesday
  category: project-management
---

# Tuesday MCP

Use Tuesday's MCP tools to inspect and update workspace data without guessing IDs, versions, or document structure.

## Start Safely

1. Call `ping` or `whoami` when connection, identity, role, or scopes are uncertain. These tools require authentication but no domain scope.
2. Discover records with `search_workspace`, `list_projects`, `list_project_tasks`, `list_my_tasks`, or `list_project_docs` instead of guessing IDs.
3. Read the target with `get_project`, `get_task`, or `get_doc` immediately before a mutation.
4. Confirm that the requested operation is available. Tuesday MCP does not currently expose meeting tools, document deletion, personal root-document creation, or database-document schema tools.
5. Inspect tool errors before claiming success. Treat `isError: true` as failure and use the stable error code from `structuredContent` when available.

Only tools allowed by the token's scopes appear in tool discovery. Project membership and resource ownership still apply. Admins may access all projects. Freelancers are read-only on documents, may only change the status of assigned tasks, and may only log time to projects they belong to.

## Tool Map

### Discovery and reads

- `ping`: test connectivity and report the current user, role, and scopes.
- `whoami`: report the authenticated user ID, name, role, authentication type, and scopes.
- `search_workspace`: search visible projects, docs, and tasks. Use a narrow query and follow with a typed read tool.
- `list_projects` / `get_project` / `list_project_statuses`: discover accessible projects and grounded status IDs.
- `list_project_tasks` / `list_my_tasks` / `get_task`: discover tasks and read current task details and version.
- `list_task_statuses`: discover valid task status IDs; never infer an ID from a status name.
- `list_project_members`: discover active project members who can be assigned to tasks.
- `list_project_docs` / `get_doc`: discover document metadata and read full block content and current version.

### Documents

- `create_doc`: create a project doc or a child doc. Use a unique, stable `idempotencyKey` and verify with `get_doc`.
- `update_doc_title`: rename using the latest `expectedVersion` from `get_doc`.
- `append_doc_blocks`: add source text or raw BlockNote blocks using the latest `expectedVersion`.
- `edit_doc_blocks`: atomically delete or replace targeted root or nested blocks. Prefer this for corrections and localized changes.
- `write_doc_blocks`: deliberately replace the complete document body. Use only when you have constructed and intend to own all resulting content.

Read [references/documents.md](references/documents.md) before creating rich documents, adding tables, editing blocks, replacing a document body, or recovering from an uncertain mutation.

### Tasks

- `create_task`: create within a known project. Optional `startDate` and `dueDate` values must be `YYYY-MM-DD`. Use a stable `idempotencyKey` for retry safety; it is required when `assigneeIds` is non-empty.
- `update_task_status`, `rename_task`, `update_task_description`: first call `get_task`, then pass its exact current version as `expectedVersion`.
- `update_task_dates`: omit a date to leave it unchanged, pass `null` to clear it, or pass `YYYY-MM-DD` to set it.
- `update_task_assignees`: atomically replace the complete assignee set using IDs from `list_project_members`. `assign_task` is a compatibility alias with the same full-replacement behavior.

Process task mutations sequentially. Each successful mutation increments the version; use the returned version for the next mutation. On conflict, re-read the task and reassess the requested change before retrying. Do not merely substitute a newer version.

Freelancers may call `update_task_status` only for tasks assigned to them. They cannot use the other task mutation tools.

### Time

- `create_time_entry`: set `hours` on a `YYYY-MM-DD` date, normally against a project. The operation upserts the authenticated user's project/date entry and may replace its existing hours and note. Use a stable `idempotencyKey` when a request may be retried.

Freelancers must provide a project they belong to and cannot log miscellaneous time without a project.

## Mutation Rules

### Creation idempotency

Use a key that identifies one intended creation, such as `task:<project-id>:release-checklist:2026-07-12`. Keep it at most 200 characters.

- Key scope is personal token + tool + key, or OAuth user + client + tool + key. OAuth access-token refresh does not change that scope. Replays still require current role and parent/project access.
- Reusing a key with the same canonical request returns the first stored response.
- Reusing a key with changed input returns `IDEMPOTENCY_KEY_REUSED`.
- The resource mutation and replay record commit atomically. After a timeout, retry the exact same request and key.

### Optimistic concurrency

For tools requiring `expectedVersion`:

1. Read the record immediately before writing.
2. Pass the exact version returned by the read.
3. Make one mutation at a time.
4. Continue with the version returned by the successful mutation.
5. On conflict, re-read and determine whether the mutation is still needed.

Never retry a stale write blindly. A user or collaborator may have changed the record in a way that alters the intended result.

## Response Discipline

- Report created or updated record IDs and the returned version.
- If a tool call times out, do not assume it failed.
- Verify idempotent creations by reusing the same key or reading the returned record.
- Verify non-idempotent document appends with `get_doc` before deciding whether to retry.
- After an uncertain edit or full write, call `get_doc` before retrying. The old expected version will conflict if the first call committed.
- If Tuesday reports durable collaborative edits that are not yet canonical, open the document in a writable browser session to trigger snapshotting, then re-read it. Do not overwrite or blindly retry while the canonical version is unchanged.
- Surface access, scope, conflict, validation, active-collaborator, and pending-collaboration errors clearly rather than attempting unrelated workarounds.
- Do not parse error prose. Prefer stable codes including `VALIDATION_ERROR`, `ACCESS_DENIED`, `READ_ONLY_ROLE`, `VERSION_CONFLICT`, and `IDEMPOTENCY_KEY_REUSED`.
