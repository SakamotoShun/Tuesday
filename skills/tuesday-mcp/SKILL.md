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

1. Call `ping` when connection, identity, role, or scopes are uncertain.
2. Discover records with `search_workspace`, `list_projects`, `list_project_tasks`, or `list_project_docs` instead of guessing IDs.
3. Read the target with `get_project`, `get_task`, or `get_doc` immediately before a mutation.
4. Confirm that the requested operation is available. Tuesday MCP does not currently expose meeting tools, document deletion, block replacement/deletion, personal root-document creation, or database-document schema tools.
5. Inspect tool errors before claiming success. MCP results may be JSON serialized inside a text content block; treat `isError: true` as failure.

Only tools allowed by the token's scopes appear in tool discovery. Project membership and resource ownership still apply. Admins may access all projects. Freelancers are read-only on documents, may only change the status of assigned tasks, and may only log time to projects they belong to.

## Tool Map

### Discovery and reads

- `ping`: test connectivity and report the current user, role, and scopes.
- `search_workspace`: search visible projects, docs, and tasks. Use a narrow query and follow with a typed read tool.
- `list_projects` / `get_project`: discover accessible projects and read one project.
- `list_project_tasks` / `get_task`: discover project tasks and read current task details and version.
- `list_project_docs` / `get_doc`: discover document metadata and read full block content and current version.

### Documents

- `create_doc`: create a project doc or a child doc. Use a unique, stable `idempotencyKey` and verify with `get_doc`.
- `update_doc_title`: rename using the latest `expectedVersion` from `get_doc`.
- `append_doc_blocks`: add source text or raw BlockNote blocks using the latest `expectedVersion`.

Read [references/documents.md](references/documents.md) before creating rich documents, adding tables, or recovering from an uncertain append.

### Tasks

- `create_task`: create within a known project. Use a stable `idempotencyKey` for retry safety.
- `update_task_status`, `rename_task`, `update_task_description`, `assign_task`: first call `get_task`, then pass its exact current version as `expectedVersion`.

Process task mutations sequentially. Each successful mutation increments the version; use the returned version for the next mutation. On conflict, re-read the task and reassess the requested change before retrying. Do not merely substitute a newer version.

Freelancers may call `update_task_status` only for tasks assigned to them. They cannot use the other task mutation tools.

### Time

- `create_time_entry`: log `hours` on a `YYYY-MM-DD` date, normally against a project. Use a stable `idempotencyKey` when a request may be retried.

Freelancers must provide a project they belong to and cannot log miscellaneous time without a project.

## Mutation Rules

### Creation idempotency

Use a key that identifies one intended creation, such as `task:<project-id>:release-checklist:2026-07-12`. Keep it at most 200 characters.

- Key scope is MCP token + tool + key.
- Reusing a key returns the first stored response.
- Tuesday does not compare the new payload with the original payload.
- Never reuse a key for changed content or a different desired record.

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
- Surface access, scope, conflict, validation, and active-collaborator errors clearly rather than attempting unrelated workarounds.
