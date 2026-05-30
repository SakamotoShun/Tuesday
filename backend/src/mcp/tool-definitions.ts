import { registerTool } from './tools';
import type { McpContext } from './types';
import {
  searchService,
  projectService,
  taskService,
  docService,
} from '../services';
import { taskStatusRepository } from '../repositories/taskStatus';
import { checkIdempotencyKey, storeIdempotencyKey } from './idempotency';
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
      createdAt: d.createdAt, updatedAt: d.updatedAt,
    }));
  },
});

// ============ get_doc ============

registerTool({
  name: 'get_doc',
  description: 'Get a single doc by ID.',
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
    if (idempotencyKey) {
      const existing = await checkIdempotencyKey(ctx.token.tokenId, idempotencyKey, 'create_task');
      if (existing) return existing;
    }
    const task = await taskService.createTask(projectId, {
      title, descriptionMd: description, statusId, dueDate, assigneeIds,
    }, ctx.user);
    const result = { id: task.id, title: task.title, projectId: task.projectId, statusId: task.statusId, version: (task as any).version ?? 1, createdAt: task.createdAt };
    if (idempotencyKey) {
      await storeIdempotencyKey(ctx.token.tokenId, idempotencyKey, 'create_task', 'task', task.id, result);
    }
    return result;
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
    if (idempotencyKey) {
      const existing = await checkIdempotencyKey(ctx.token.tokenId, idempotencyKey, 'create_time_entry');
      if (existing) return existing;
    }
    const entry = await timeEntryService.upsertEntry(ctx.user.id, { projectId: projectId ?? null, date, hours, note }, ctx.user);
    const result = { id: entry.id, projectId: entry.projectId, userId: entry.userId, date: entry.date, hours: entry.hours, note: entry.note };
    if (idempotencyKey) {
      await storeIdempotencyKey(ctx.token.tokenId, idempotencyKey, 'create_time_entry', 'time_entry', entry.id, result);
    }
    return result;
  },
});