import { registerTool } from './tools';
import type { McpContext } from './types';
import {
  searchService,
  projectService,
  taskService,
  docService,
} from '../services';
import { taskStatusRepository } from '../repositories/taskStatus';
import { runIdempotentOperation } from './idempotency';
import { db } from '../db/client';
import { tasks, taskAssignees } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { timeEntryService } from '../services/timeEntry';
import { assertNotFreelancer, isFreelancer } from '../utils/permissions';

// ============ ping ============

registerTool({
  name: 'ping',
  description: 'Test connectivity. Returns pong with server info.',
  requiredScope: 'search:read',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_input: unknown, ctx: McpContext) => ({
    message: 'pong',
    user: ctx.user.name,
    role: ctx.user.role,
    scopes: Array.from(ctx.token.scopes),
  }),
});

// ============ search_workspace ============

registerTool({
  name: 'search_workspace',
  description: 'Search across projects, docs, and tasks visible to you.',
  requiredScope: 'search:read',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results per category (1-20, default 6)' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { query, limit } = input as { query: string; limit?: number };
    return searchService.search(ctx.user, query, limit);
  },
});

// ============ list_projects ============

registerTool({
  name: 'list_projects',
  description: 'List all projects accessible to you.',
  requiredScope: 'projects:read',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_input: unknown, ctx: McpContext) => {
    const projects = await projectService.getProjects(ctx.user);
    return projects.map((p) => ({
      id: p.id, name: p.name, client: p.client, statusId: p.statusId,
      type: p.type, startDate: p.startDate, targetEndDate: p.targetEndDate,
      budgetHours: p.budgetHours, isTemplate: p.isTemplate, updatedAt: p.updatedAt,
    }));
  },
});

// ============ get_project ============

registerTool({
  name: 'get_project',
  description: 'Get a single project by ID.',
  requiredScope: 'projects:read',
  inputSchema: {
    type: 'object',
    properties: { projectId: { type: 'string', description: 'Project UUID' } },
    required: ['projectId'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId } = input as { projectId: string };
    const project = await projectService.getProject(projectId, ctx.user);
    if (!project) throw new Error('Project not found or access denied');
    return project;
  },
});

// ============ list_project_tasks ============

registerTool({
  name: 'list_project_tasks',
  description: 'List tasks in a project.',
  requiredScope: 'tasks:read',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project UUID' },
      statusId: { type: 'string', description: 'Optional: filter by status' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId, statusId } = input as { projectId: string; statusId?: string };
    return taskService.getProjectTasks(projectId, ctx.user, { statusId });
  },
});

// ============ get_task ============

registerTool({
  name: 'get_task',
  description: 'Get a single task by ID. Includes version for optimistic concurrency.',
  requiredScope: 'tasks:read',
  inputSchema: {
    type: 'object',
    properties: { taskId: { type: 'string', description: 'Task UUID' } },
    required: ['taskId'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId } = input as { taskId: string };
    const task = await taskService.getTask(taskId, ctx.user);
    if (!task) throw new Error('Task not found or access denied');
    return task;
  },
});

// ============ list_project_docs ============

registerTool({
  name: 'list_project_docs',
  description: 'List docs in a project. Returns metadata only (no block content).',
  requiredScope: 'docs:read',
  inputSchema: {
    type: 'object',
    properties: { projectId: { type: 'string', description: 'Project UUID' } },
    required: ['projectId'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId } = input as { projectId: string };
    const docs = await docService.getProjectDocs(projectId, ctx.user);
    return docs.map((d) => ({
      id: d.id, title: d.title, parentId: d.parentId, isDatabase: d.isDatabase,
      searchText: (d as any).searchText ?? '', properties: (d as any).properties ?? {},
      version: (d as any).version ?? 1, createdAt: d.createdAt, updatedAt: d.updatedAt,
    }));
  },
});

// ============ get_doc ============

registerTool({
  name: 'get_doc',
  description: 'Get a single doc by ID, including canonical block content and the current version required for edits.',
  requiredScope: 'docs:read',
  inputSchema: {
    type: 'object',
    properties: { docId: { type: 'string', description: 'Doc UUID' } },
    required: ['docId'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { docId } = input as { docId: string };
    const doc = await docService.getDoc(docId, ctx.user);
    if (!doc) throw new Error('Doc not found or access denied');
    return doc;
  },
});

// ============ create_doc ============

registerTool({
  name: 'create_doc',
  description: 'Create a doc under a project or another doc. Provide either BlockNote blocks or source text, not both; omit both for an empty doc. Source conversion is lossy and flattens Markdown/HTML tables, so use raw blocks for rendered tables. Supports idempotencyKey.',
  requiredScope: 'docs:write',
  inputSchema: {
    type: 'object',
    properties: {
      parent: {
        type: 'object',
        description: 'Project parent for a root project doc, or doc parent for a child doc',
        properties: {
          type: { type: 'string', enum: ['project', 'doc'] },
          id: { type: 'string' },
        },
        required: ['type', 'id'],
        additionalProperties: false,
      },
      title: { type: 'string', description: 'Doc title' },
      blocks: { type: 'array', items: { type: 'object' }, description: 'Optional raw BlockNote blocks. Use instead of source for rendered tables or precise structure.' },
      source: { type: 'string', description: 'Optional source content to convert into blocks. Do not combine with blocks; Markdown/HTML tables become paragraphs.' },
      sourceFormat: { type: 'string', enum: ['auto', 'markdown', 'html', 'text'], description: 'Source format. Prefer an explicit value; defaults to auto.' },
      idempotencyKey: { type: 'string', description: 'Optional creation deduplication key (max 200 characters). Reuse returns the first response even if the payload changes.' },
    },
    required: ['parent', 'title'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { parent, title, blocks, source, sourceFormat, idempotencyKey } = input as {
      parent: { type: 'project' | 'doc'; id: string };
      title: string;
      blocks?: Array<Record<string, unknown>>;
      source?: string;
      sourceFormat?: 'auto' | 'markdown' | 'html' | 'text';
      idempotencyKey?: string;
    };

    const createDoc = async () => {
      const doc = await docService.createDocFromParent(parent, { title, blocks, source, sourceFormat }, ctx.user);
      return {
        response: {
          id: doc.id,
          title: doc.title,
          projectId: doc.projectId,
          parentId: doc.parentId,
          version: (doc as any).version ?? 1,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        },
        resultEntityType: 'doc',
        resultEntityId: doc.id,
      };
    };

    if (!idempotencyKey) {
      return (await createDoc()).response;
    }

    return runIdempotentOperation(ctx.token.tokenId, idempotencyKey, 'create_doc', createDoc);
  },
});

// ============ update_doc_title ============

registerTool({
  name: 'update_doc_title',
  description: 'Update a doc title using optimistic concurrency. Call get_doc first and pass its current version as expectedVersion.',
  requiredScope: 'docs:write',
  inputSchema: {
    type: 'object',
    properties: {
      docId: { type: 'string' },
      title: { type: 'string' },
      expectedVersion: { type: 'number', description: 'Exact current version from get_doc. Re-read on conflict.' },
    },
    required: ['docId', 'title', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { docId, title, expectedVersion } = input as { docId: string; title: string; expectedVersion: number };
    const doc = await docService.updateDocTitle(docId, title, expectedVersion, ctx.user);
    if (!doc) throw new Error('Doc not found or access denied');
    return { id: doc.id, title: doc.title, version: (doc as any).version ?? expectedVersion + 1, updatedAt: doc.updatedAt };
  },
});

// ============ append_doc_blocks ============

registerTool({
  name: 'append_doc_blocks',
  description: 'Append content using optimistic concurrency. Provide exactly one of raw BlockNote blocks or source text. Source conversion flattens tables; use raw blocks for rendered tables. Appends are not idempotent, so verify with get_doc before retrying an uncertain call.',
  requiredScope: 'docs:write',
  inputSchema: {
    type: 'object',
    properties: {
      docId: { type: 'string' },
      blocks: { type: 'array', items: { type: 'object' }, description: 'Raw BlockNote blocks (maximum 100). Do not combine with source.' },
      source: { type: 'string', description: 'Source content to convert into blocks. Do not combine with blocks; Markdown/HTML tables become paragraphs.' },
      sourceFormat: { type: 'string', enum: ['auto', 'markdown', 'html', 'text'], description: 'Source format. Prefer an explicit value; defaults to auto.' },
      expectedVersion: { type: 'number', description: 'Exact current version from get_doc. Re-read on conflict.' },
      position: {
        type: 'object',
        description: 'Defaults to end. after_block only matches a root-level block ID.',
        properties: {
          type: { type: 'string', enum: ['end', 'start', 'after_block'] },
          afterBlockId: { type: 'string', description: 'Existing root-level block ID, required when type is after_block' },
        },
        additionalProperties: false,
      },
    },
    required: ['docId', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { docId, blocks, source, sourceFormat, expectedVersion, position } = input as {
      docId: string;
      blocks?: Array<Record<string, unknown>>;
      source?: string;
      sourceFormat?: 'auto' | 'markdown' | 'html' | 'text';
      expectedVersion: number;
      position?: { type: 'end' } | { type: 'start' } | { type: 'after_block'; afterBlockId: string };
    };

    if (blocks !== undefined && source !== undefined) {
      throw new Error('Provide either blocks or source, not both');
    }

    if (blocks === undefined && source === undefined) {
      throw new Error('Either blocks or source is required');
    }

    const doc = source !== undefined
      ? await docService.appendDocSource(docId, source, sourceFormat, expectedVersion, ctx.user, position)
      : await docService.appendDocBlocks(docId, blocks ?? [], expectedVersion, ctx.user, position);
    if (!doc) throw new Error('Doc not found or access denied');
    return {
      id: doc.id,
      version: (doc as any).version ?? expectedVersion + 1,
      appendedCount: source !== undefined ? undefined : blocks?.length ?? 0,
      updatedAt: doc.updatedAt,
    };
  },
});

// ============ WRITE TOOLS ============

// Helper: compare-and-swap version check, returns updated row or throws conflict.
// Always authorize by loading the task through taskService before mutating.
async function casUpdate(
  taskId: string,
  expectedVersion: number,
  setData: Record<string, unknown>,
  ctx: McpContext
): Promise<{ id: string; version: number }> {
  const task = await taskService.getTask(taskId, ctx.user);
  if (!task) throw new Error('Task not found or access denied');

  const [updated] = await db
    .update(tasks)
    .set({ ...setData, updatedAt: new Date(), version: sql`${tasks.version} + 1` })
    .where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion)))
    .returning({ id: tasks.id, version: tasks.version });
  if (updated) return updated;

  const exists = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!exists) throw new Error('Task not found');
  throw new Error('Conflict: task version changed. Re-read and retry with new expectedVersion.');
}

// ============ create_task ============

registerTool({
  name: 'create_task',
  description: 'Create a new task in a project. Supports idempotencyKey.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project UUID' },
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Optional markdown description' },
      statusId: { type: 'string', description: 'Optional status UUID' },
      dueDate: { type: 'string', description: 'Optional due date (YYYY-MM-DD)' },
      assigneeIds: { type: 'array', items: { type: 'string' } },
      idempotencyKey: { type: 'string', description: 'Optional deduplication key' },
    },
    required: ['projectId', 'title'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId, title, description, statusId, dueDate, assigneeIds, idempotencyKey } =
      input as { projectId: string; title: string; description?: string; statusId?: string; dueDate?: string; assigneeIds?: string[]; idempotencyKey?: string };
    const createTask = async () => {
      const task = await taskService.createTask(projectId, {
        title, descriptionMd: description, statusId, dueDate, assigneeIds,
      }, ctx.user);
      return {
        response: {
          id: task.id,
          title: task.title,
          projectId: task.projectId,
          statusId: task.statusId,
          version: (task as any).version ?? 1,
          createdAt: task.createdAt,
        },
        resultEntityType: 'task',
        resultEntityId: task.id,
      };
    };

    if (!idempotencyKey) {
      return (await createTask()).response;
    }

    return runIdempotentOperation(ctx.token.tokenId, idempotencyKey, 'create_task', createTask);
  },
});

// ============ update_task_status ============

registerTool({
  name: 'update_task_status',
  description: 'Update task status with optimistic concurrency. Requires expectedVersion.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      statusId: { type: 'string' },
      expectedVersion: { type: 'number' },
    },
    required: ['taskId', 'statusId', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId, statusId, expectedVersion } = input as { taskId: string; statusId: string; expectedVersion: number };

    const task = await taskService.getTask(taskId, ctx.user);
    if (!task) throw new Error('Task not found or access denied');

    if (isFreelancer(ctx.user)) {
      const isAssigned = task.assignees?.some((assignee) => assignee.userId === ctx.user.id) ?? false;
      if (!isAssigned) {
        throw new Error('Freelancers cannot update tasks they are not assigned to');
      }
    }

    const status = await taskStatusRepository.findById(statusId);
    if (!status) throw new Error('Invalid status ID');

    return casUpdate(taskId, expectedVersion, { statusId }, ctx);
  },
});

// ============ rename_task ============

registerTool({
  name: 'rename_task',
  description: 'Rename a task. Requires expectedVersion.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: { taskId: { type: 'string' }, title: { type: 'string' }, expectedVersion: { type: 'number' } },
    required: ['taskId', 'title', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId, title, expectedVersion } = input as { taskId: string; title: string; expectedVersion: number };
    assertNotFreelancer(ctx.user, 'Freelancers cannot edit tasks (status only)');
    if (!title.trim()) throw new Error('Task title cannot be empty');
    return casUpdate(taskId, expectedVersion, { title: title.trim() }, ctx);
  },
});

// ============ update_task_description ============

registerTool({
  name: 'update_task_description',
  description: 'Update task description. Requires expectedVersion.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: { taskId: { type: 'string' }, description: { type: 'string' }, expectedVersion: { type: 'number' } },
    required: ['taskId', 'description', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId, description, expectedVersion } = input as { taskId: string; description: string; expectedVersion: number };
    assertNotFreelancer(ctx.user, 'Freelancers cannot edit tasks (status only)');
    return casUpdate(taskId, expectedVersion, { descriptionMd: description }, ctx);
  },
});

// ============ assign_task ============

registerTool({
  name: 'assign_task',
  description: 'Update task assignees. Requires expectedVersion.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: { taskId: { type: 'string' }, assigneeIds: { type: 'array', items: { type: 'string' } }, expectedVersion: { type: 'number' } },
    required: ['taskId', 'assigneeIds', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId, assigneeIds, expectedVersion } = input as { taskId: string; assigneeIds: string[]; expectedVersion: number };
    assertNotFreelancer(ctx.user, 'Freelancers cannot update task assignees');
    const task = await taskService.getTask(taskId, ctx.user);
    if (!task) throw new Error('Task not found or access denied');
    const updated = await casUpdate(taskId, expectedVersion, {}, ctx);
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    if (assigneeIds.length > 0) {
      await db.insert(taskAssignees).values(assigneeIds.map((userId) => ({ taskId, userId })));
    }
    return { id: taskId, version: updated.version, assigneeIds };
  },
});

// ============ create_time_entry ============

registerTool({
  name: 'create_time_entry',
  description: 'Log hours against a project. Supports idempotencyKey.',
  requiredScope: 'time:write',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project UUID (optional for misc time)' },
      date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
      hours: { type: 'number', description: 'Hours (0-24)' },
      note: { type: 'string', description: 'Optional note' },
      idempotencyKey: { type: 'string', description: 'Optional deduplication key' },
    },
    required: ['date', 'hours'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId, date, hours, note, idempotencyKey } = input as { projectId?: string | null; date: string; hours: number; note?: string; idempotencyKey?: string };
    const createTimeEntry = async () => {
      const entry = await timeEntryService.upsertEntry(ctx.user.id, { projectId: projectId ?? null, date, hours, note }, ctx.user);
      return {
        response: {
          id: entry.id,
          projectId: entry.projectId,
          userId: entry.userId,
          date: entry.date,
          hours: entry.hours,
          note: entry.note,
        },
        resultEntityType: 'time_entry',
        resultEntityId: entry.id,
      };
    };

    if (!idempotencyKey) {
      return (await createTimeEntry()).response;
    }

    return runIdempotentOperation(ctx.token.tokenId, idempotencyKey, 'create_time_entry', createTimeEntry);
  },
});
