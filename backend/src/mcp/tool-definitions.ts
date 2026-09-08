import { registerTool } from './tools';
import type { McpContext } from './types';
import {
  searchService,
  projectService,
  taskService,
  docService,
} from '../services';
import { taskStatusRepository } from '../repositories/taskStatus';
import { projectStatusRepository } from '../repositories/projectStatus';
import { projectMemberRepository } from '../repositories/projectMember';
import { runIdempotentOperation } from './idempotency';
import { timeEntryService } from '../services/timeEntry';
import { assertNotFreelancer } from '../utils/permissions';
import { McpToolError } from './errors';
import {
  MAX_DOC_BLOCK_DEPTH,
  MAX_DOC_BLOCKS,
  MAX_DOC_CONTENT_BYTES,
  MAX_DOC_REPLACEMENT_ROOTS,
} from '../utils/doc-blocks';

const RAW_DOC_BLOCK_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string', minLength: 1 },
    props: { type: 'object' },
    content: {},
    children: { type: 'array', items: { $ref: '#/$defs/rawDocBlock' } },
  },
  required: ['id', 'type', 'props', 'children'],
  additionalProperties: true,
} as const;

const RAW_DOC_BLOCK_LIMITS = `Maximum ${MAX_DOC_BLOCKS} total blocks, depth ${MAX_DOC_BLOCK_DEPTH}, and ${MAX_DOC_CONTENT_BYTES} UTF-8 JSON bytes.`;
const UUID_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_SCHEMA = { type: 'string', format: 'date' } as const;
const VERSION_SCHEMA = { type: 'integer', minimum: 1 } as const;

function projectTask(task: any) {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    statusId: task.statusId,
    startDate: task.startDate,
    dueDate: task.dueDate,
    version: task.version,
    sortOrder: task.sortOrder,
    updatedAt: task.updatedAt,
    status: task.status ? {
      id: task.status.id,
      name: task.status.name,
      color: task.status.color,
    } : null,
    assignees: (task.assignees ?? []).map((assignee: any) => ({
      id: assignee.user.id,
      name: assignee.user.name,
      avatarUrl: assignee.user.avatarUrl,
    })),
  };
}

function parseToolInput(input: unknown, toolName: string, allowedKeys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${toolName} input must be an object`);
  }

  const value = input as Record<string, unknown>;
  const unexpectedKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (unexpectedKey) {
    throw new Error(`${toolName} input contains unexpected property "${unexpectedKey}"`);
  }
  return value;
}

// ============ ping ============

registerTool({
  name: 'ping',
  description: 'Test connectivity. Returns pong with server info.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_input: unknown, ctx: McpContext) => ({
    message: 'pong',
    user: ctx.user.name,
    role: ctx.user.role,
    scopes: Array.from(ctx.token.scopes).sort(),
  }),
});

registerTool({
  name: 'whoami',
  description: 'Return the authenticated Tuesday identity and granted MCP scopes.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_input: unknown, ctx: McpContext) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    role: ctx.user.role,
    authType: ctx.token.authType ?? 'pat',
    scopes: Array.from(ctx.token.scopes).sort(),
  }),
});

registerTool({
  name: 'list_task_statuses',
  description: 'List the workspace task statuses so status IDs do not need to be guessed.',
  requiredScope: 'tasks:read',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async () => (await taskStatusRepository.findAll()).map((status) => ({
    id: status.id,
    name: status.name,
    color: status.color,
    sortOrder: status.sortOrder,
    isDefault: status.isDefault,
  })),
});

registerTool({
  name: 'list_project_statuses',
  description: 'List the workspace project statuses so status IDs do not need to be guessed.',
  requiredScope: 'projects:read',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async () => (await projectStatusRepository.findAll()).map((status) => ({
    id: status.id,
    name: status.name,
    color: status.color,
    sortOrder: status.sortOrder,
    isDefault: status.isDefault,
  })),
});

registerTool({
  name: 'list_project_members',
  description: 'List active project members who can be assigned to project tasks.',
  requiredScope: 'tasks:read',
  inputSchema: {
    type: 'object',
    properties: { projectId: UUID_SCHEMA },
    required: ['projectId'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId } = input as { projectId: string };
    const project = await projectService.getProject(projectId, ctx.user);
    if (!project) throw new Error('Project not found or access denied');
    const members = await projectMemberRepository.findActiveByProjectId(projectId);
    return members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      avatarUrl: member.user.avatarUrl,
      workspaceRole: member.user.role,
      projectRole: member.role,
    }));
  },
});

// ============ search_workspace ============

registerTool({
  name: 'search_workspace',
  description: 'Search across projects, docs, and tasks visible to you.',
  requiredScope: 'search:read',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, description: 'Search query' },
      limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Max results per category (1-20, default 6)' },
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
    properties: { projectId: { ...UUID_SCHEMA, description: 'Project UUID' } },
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
  description: 'List up to 100 tasks in a project using grounded status, assignee, and date filters.',
  requiredScope: 'tasks:read',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: UUID_SCHEMA,
      statusId: { ...UUID_SCHEMA, description: 'Optional: filter by status' },
      assigneeId: { ...UUID_SCHEMA, description: 'Optional: filter by assignee' },
      dueOn: { ...DATE_SCHEMA, description: 'Optional exact due date' },
      dueBefore: { ...DATE_SCHEMA, description: 'Optional inclusive upper due-date bound' },
      dueAfter: { ...DATE_SCHEMA, description: 'Optional inclusive lower due-date bound' },
      hasDueDate: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId, statusId, assigneeId, dueOn, dueBefore, dueAfter, hasDueDate, limit = 50, offset = 0 } = input as {
      projectId: string;
      statusId?: string;
      assigneeId?: string;
      dueOn?: string;
      dueBefore?: string;
      dueAfter?: string;
      hasDueDate?: boolean;
      limit?: number;
      offset?: number;
    };
    let tasks = await taskService.getProjectTasks(projectId, ctx.user, { statusId, assigneeId });
    tasks = tasks.filter((task) => {
      if (hasDueDate === true && !task.dueDate) return false;
      if (hasDueDate === false && task.dueDate) return false;
      if (dueOn && task.dueDate !== dueOn) return false;
      if (dueBefore && (!task.dueDate || task.dueDate > dueBefore)) return false;
      if (dueAfter && (!task.dueDate || task.dueDate < dueAfter)) return false;
      return true;
    });
    return {
      items: tasks.slice(offset, offset + limit).map(projectTask),
      total: tasks.length,
      offset,
      limit,
      hasMore: offset + limit < tasks.length,
    };
  },
});

registerTool({
  name: 'list_my_tasks',
  description: 'List up to 100 tasks assigned to the authenticated user across accessible projects.',
  requiredScope: 'tasks:read',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: UUID_SCHEMA,
      statusId: UUID_SCHEMA,
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId, statusId, limit = 50, offset = 0 } = input as {
      projectId?: string;
      statusId?: string;
      limit?: number;
      offset?: number;
    };
    let tasks = await taskService.getMyTasks(ctx.user.id, ctx.user) as any[];
    if (projectId) tasks = tasks.filter((task) => task.projectId === projectId);
    if (statusId) tasks = tasks.filter((task) => task.statusId === statusId);
    return {
      items: tasks.slice(offset, offset + limit).map((task) => ({
        ...projectTask(task),
        project: task.project ? { id: task.project.id, name: task.project.name } : null,
      })),
      total: tasks.length,
      offset,
      limit,
      hasMore: offset + limit < tasks.length,
    };
  },
});

// ============ get_task ============

registerTool({
  name: 'get_task',
  description: 'Get a single task by ID. Includes version for optimistic concurrency.',
  requiredScope: 'tasks:read',
  inputSchema: {
    type: 'object',
    properties: { taskId: { ...UUID_SCHEMA, description: 'Task UUID' } },
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
    properties: { projectId: { ...UUID_SCHEMA, description: 'Project UUID' } },
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
    properties: { docId: { ...UUID_SCHEMA, description: 'Doc UUID' } },
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
          id: UUID_SCHEMA,
        },
        required: ['type', 'id'],
        additionalProperties: false,
      },
      title: { type: 'string', minLength: 1, maxLength: 500, description: 'Doc title' },
      blocks: { type: 'array', maxItems: MAX_DOC_BLOCKS, items: { type: 'object' }, description: 'Optional raw BlockNote blocks. Use instead of source for rendered tables or precise structure.' },
      source: { type: 'string', description: 'Optional source content to convert into blocks. Do not combine with blocks; Markdown/HTML tables become paragraphs.' },
      sourceFormat: { type: 'string', enum: ['auto', 'markdown', 'html', 'text'], description: 'Source format. Prefer an explicit value; defaults to auto.' },
      idempotencyKey: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional creation deduplication key. Reuse with changed input is rejected.' },
    },
    required: ['parent', 'title'],
    not: { required: ['blocks', 'source'] },
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

    const createDoc = async (transaction?: import('../db/client').DbTransaction) => {
      const doc = await docService.createDocFromParent(
        parent,
        { title, blocks, source, sourceFormat },
        ctx.user,
        transaction,
        !transaction,
      );
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
        afterCommit: transaction ? () => docService.publishDocCreated(doc, ctx.user) : undefined,
      };
    };

    if (!idempotencyKey) {
      return (await createDoc()).response;
    }

    // Replays skip the service mutation, so recheck current permissions first.
    assertNotFreelancer(ctx.user, 'Freelancers cannot create docs');
    if (parent.type === 'project') {
      if (!await projectService.hasAccess(parent.id, ctx.user)) {
        throw new Error('Access denied to this project');
      }
    } else if (!await docService.getDoc(parent.id, ctx.user)) {
      throw new Error('Parent doc not found');
    }
    return runIdempotentOperation(ctx.token, idempotencyKey, 'create_doc', input, createDoc, async (response) => {
      if (!await docService.getDoc(response.id, ctx.user)) {
        throw new Error('Doc not found');
      }
    });
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
      docId: UUID_SCHEMA,
      title: { type: 'string', minLength: 1, maxLength: 500 },
      expectedVersion: { ...VERSION_SCHEMA, description: 'Exact current version from get_doc. Re-read on conflict.' },
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
      docId: UUID_SCHEMA,
      blocks: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object' }, description: 'Raw BlockNote blocks (maximum 100). Do not combine with source.' },
      source: { type: 'string', minLength: 1, description: 'Source content to convert into blocks. Do not combine with blocks; Markdown/HTML tables become paragraphs.' },
      sourceFormat: { type: 'string', enum: ['auto', 'markdown', 'html', 'text'], description: 'Source format. Prefer an explicit value; defaults to auto.' },
      expectedVersion: { ...VERSION_SCHEMA, description: 'Exact current version from get_doc. Re-read on conflict.' },
      position: {
        type: 'object',
        description: 'Defaults to end. after_block only matches a root-level block ID.',
        properties: {
          type: { type: 'string', enum: ['end', 'start', 'after_block'] },
          afterBlockId: { type: 'string', minLength: 1, description: 'Existing root-level block ID, required when type is after_block' },
        },
        if: { properties: { type: { const: 'after_block' } }, required: ['type'] },
        then: { required: ['afterBlockId'] },
        additionalProperties: false,
      },
    },
    required: ['docId', 'expectedVersion'],
    oneOf: [{ required: ['blocks'] }, { required: ['source'] }],
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

// ============ edit_doc_blocks ============

registerTool({
  name: 'edit_doc_blocks',
  description: `Atomically delete or replace existing BlockNote blocks using ID paths. Call get_doc first and pass its exact version. A one-block replacement that keeps the target ID modifies that block; replacements may also contain multiple ordered blocks. ${RAW_DOC_BLOCK_LIMITS}`,
  requiredScope: 'docs:write',
  inputSchema: {
    type: 'object',
    properties: {
      docId: { ...UUID_SCHEMA, description: 'Doc UUID' },
      expectedVersion: { type: 'integer', minimum: 1, description: 'Exact current version from get_doc. Re-read on conflict.' },
      operations: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        description: 'Atomic block edits. Paths list IDs from a root block through direct children to the target.',
        items: {
          oneOf: [
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['delete'] },
                path: { type: 'array', minItems: 1, maxItems: MAX_DOC_BLOCK_DEPTH, items: { type: 'string', minLength: 1 } },
              },
              required: ['type', 'path'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['replace'] },
                path: { type: 'array', minItems: 1, maxItems: MAX_DOC_BLOCK_DEPTH, items: { type: 'string', minLength: 1 } },
                blocks: { type: 'array', minItems: 1, maxItems: MAX_DOC_REPLACEMENT_ROOTS, items: { $ref: '#/$defs/rawDocBlock' }, description: 'Complete replacement blocks in their desired order.' },
              },
              required: ['type', 'path', 'blocks'],
              additionalProperties: false,
            },
          ],
        },
      },
    },
    required: ['docId', 'expectedVersion', 'operations'],
    additionalProperties: false,
    $defs: { rawDocBlock: RAW_DOC_BLOCK_SCHEMA },
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const value = parseToolInput(input, 'edit_doc_blocks', ['docId', 'expectedVersion', 'operations']);
    const result = await docService.editDocBlocks(
      value.docId as string,
      value.operations,
      value.expectedVersion as number,
      ctx.user,
    );
    if (!result) throw new Error('Doc not found or access denied');
    return {
      id: result.doc.id,
      version: result.doc.version,
      appliedOperations: (value.operations as unknown[]).length,
      deletedBlockIds: result.deletedBlockIds,
      replacementRootIds: result.replacementRootIds,
      updatedAt: result.doc.updatedAt,
    };
  },
});

// ============ write_doc_blocks ============

registerTool({
  name: 'write_doc_blocks',
  description: `Replace the entire document body with complete raw BlockNote blocks. This is a deliberate full overwrite; use edit_doc_blocks for targeted changes. Call get_doc first and pass its exact version. ${RAW_DOC_BLOCK_LIMITS}`,
  requiredScope: 'docs:write',
  inputSchema: {
    type: 'object',
    properties: {
      docId: { ...UUID_SCHEMA, description: 'Doc UUID' },
      expectedVersion: { type: 'integer', minimum: 1, description: 'Exact current version from get_doc. Re-read on conflict.' },
      blocks: { type: 'array', maxItems: MAX_DOC_BLOCKS, items: { $ref: '#/$defs/rawDocBlock' }, description: 'Complete raw BlockNote document body. An empty array clears the body.' },
    },
    required: ['docId', 'expectedVersion', 'blocks'],
    additionalProperties: false,
    $defs: { rawDocBlock: RAW_DOC_BLOCK_SCHEMA },
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const value = parseToolInput(input, 'write_doc_blocks', ['docId', 'expectedVersion', 'blocks']);
    const doc = await docService.writeDocBlocks(
      value.docId as string,
      value.blocks,
      value.expectedVersion as number,
      ctx.user,
    );
    if (!doc) throw new Error('Doc not found or access denied');
    return {
      id: doc.id,
      version: doc.version,
      writtenBlockCount: (value.blocks as unknown[]).length,
      updatedAt: doc.updatedAt,
    };
  },
});

// ============ create_task ============

registerTool({
  name: 'create_task',
  description: 'Create a new task in a project. Requires idempotencyKey when assigneeIds is non-empty.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { ...UUID_SCHEMA, description: 'Project UUID' },
      title: { type: 'string', minLength: 1, maxLength: 255, description: 'Task title' },
      description: { type: 'string', description: 'Optional markdown description' },
      statusId: { ...UUID_SCHEMA, description: 'Optional status UUID' },
      startDate: { ...DATE_SCHEMA, description: 'Optional start date (YYYY-MM-DD)' },
      dueDate: { ...DATE_SCHEMA, description: 'Optional due date (YYYY-MM-DD)' },
      assigneeIds: { type: 'array', maxItems: 100, uniqueItems: true, items: UUID_SCHEMA },
      idempotencyKey: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional deduplication key' },
    },
    required: ['projectId', 'title'],
    if: { properties: { assigneeIds: { minItems: 1 } }, required: ['assigneeIds'] },
    then: { required: ['idempotencyKey'] },
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId, title, description, statusId, startDate, dueDate, assigneeIds, idempotencyKey } =
      input as { projectId: string; title: string; description?: string; statusId?: string; startDate?: string; dueDate?: string; assigneeIds?: string[]; idempotencyKey?: string };
    if ((assigneeIds?.length ?? 0) > 0 && !idempotencyKey) {
      throw new McpToolError('VALIDATION_ERROR', 'idempotencyKey is required when creating a task with assignees');
    }
    const createTask = async (transaction?: import('../db/client').DbTransaction) => {
      const input = { title, descriptionMd: description, statusId, startDate, dueDate, assigneeIds };
      const committed = transaction
        ? await taskService.createTaskInTransaction(projectId, input, ctx.user, transaction)
        : null;
      const task = committed?.task ?? await taskService.createTask(projectId, input, ctx.user);
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
        afterCommit: committed
          ? async () => {
              const { notificationService } = await import('../services/notification');
              notificationService.publishMany(committed.notifications);
              await taskService.publishTaskCreated(task as any, committed.assigneeIds, ctx.user);
            }
          : undefined,
      };
    };

    if (!idempotencyKey) {
      return (await createTask()).response;
    }

    assertNotFreelancer(ctx.user, 'Freelancers cannot create tasks');
    if (!await projectService.hasAccess(projectId, ctx.user)) {
      throw new Error('Access denied to this project');
    }
    return runIdempotentOperation(ctx.token, idempotencyKey, 'create_task', input, createTask, async (response) => {
      if (!await taskService.getTask(response.id, ctx.user)) {
        throw new Error('Task not found');
      }
    });
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
      taskId: UUID_SCHEMA,
      statusId: UUID_SCHEMA,
      expectedVersion: VERSION_SCHEMA,
    },
    required: ['taskId', 'statusId', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId, statusId, expectedVersion } = input as { taskId: string; statusId: string; expectedVersion: number };

    const task = await taskService.updateTaskStatusIfVersion(taskId, statusId, expectedVersion, ctx.user);
    if (!task) throw new Error('Task not found or access denied');
    return { id: task.id, version: task.version };
  },
});

// ============ rename_task ============

registerTool({
  name: 'rename_task',
  description: 'Rename a task. Requires expectedVersion.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: { taskId: UUID_SCHEMA, title: { type: 'string', minLength: 1, maxLength: 255 }, expectedVersion: VERSION_SCHEMA },
    required: ['taskId', 'title', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId, title, expectedVersion } = input as { taskId: string; title: string; expectedVersion: number };
    const task = await taskService.updateTaskIfVersion(taskId, { title }, expectedVersion, ctx.user);
    if (!task) throw new Error('Task not found or access denied');
    return { id: task.id, version: task.version };
  },
});

// ============ update_task_description ============

registerTool({
  name: 'update_task_description',
  description: 'Update task description. Requires expectedVersion.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: { taskId: UUID_SCHEMA, description: { type: 'string' }, expectedVersion: VERSION_SCHEMA },
    required: ['taskId', 'description', 'expectedVersion'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId, description, expectedVersion } = input as { taskId: string; description: string; expectedVersion: number };
    const task = await taskService.updateTaskIfVersion(taskId, { descriptionMd: description }, expectedVersion, ctx.user);
    if (!task) throw new Error('Task not found or access denied');
    return { id: task.id, version: task.version };
  },
});

// ============ update_task_dates ============

registerTool({
  name: 'update_task_dates',
  description: 'Set or clear task start and due dates using optimistic concurrency. Omit a field to leave it unchanged; pass null to clear it.',
  requiredScope: 'tasks:write',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: UUID_SCHEMA,
      startDate: { anyOf: [DATE_SCHEMA, { type: 'null' }] },
      dueDate: { anyOf: [DATE_SCHEMA, { type: 'null' }] },
      expectedVersion: VERSION_SCHEMA,
    },
    required: ['taskId', 'expectedVersion'],
    anyOf: [{ required: ['startDate'] }, { required: ['dueDate'] }],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { taskId, startDate, dueDate, expectedVersion } = input as {
      taskId: string;
      startDate?: string | null;
      dueDate?: string | null;
      expectedVersion: number;
    };
    const task = await taskService.updateTaskIfVersion(taskId, { startDate, dueDate }, expectedVersion, ctx.user);
    if (!task) throw new Error('Task not found or access denied');
    return { id: task.id, version: task.version, startDate: task.startDate, dueDate: task.dueDate };
  },
});

const UPDATE_TASK_ASSIGNEES_SCHEMA = {
  type: 'object',
  properties: {
    taskId: UUID_SCHEMA,
    assigneeIds: { type: 'array', maxItems: 100, uniqueItems: true, items: UUID_SCHEMA },
    expectedVersion: VERSION_SCHEMA,
  },
  required: ['taskId', 'assigneeIds', 'expectedVersion'],
  additionalProperties: false,
} as const;

async function updateTaskAssignees(input: unknown, ctx: McpContext) {
  const { taskId, assigneeIds, expectedVersion } = input as {
    taskId: string;
    assigneeIds: string[];
    expectedVersion: number;
  };
  const task = await taskService.updateTaskAssigneesIfVersion(taskId, assigneeIds, expectedVersion, ctx.user);
  if (!task) throw new Error('Task not found or access denied');
  return {
    id: task.id,
    version: task.version,
    assigneeIds: task.assignees?.map((assignee) => assignee.userId) ?? [],
  };
}

registerTool({
  name: 'update_task_assignees',
  description: 'Replace the complete task assignee set atomically using optimistic concurrency.',
  requiredScope: 'tasks:write',
  inputSchema: UPDATE_TASK_ASSIGNEES_SCHEMA,
  handler: updateTaskAssignees,
});

registerTool({
  name: 'assign_task',
  description: 'Compatibility alias for update_task_assignees. Replaces the complete assignee set atomically.',
  requiredScope: 'tasks:write',
  inputSchema: UPDATE_TASK_ASSIGNEES_SCHEMA,
  handler: updateTaskAssignees,
});

// ============ create_time_entry ============

registerTool({
  name: 'create_time_entry',
  description: 'Log hours against a project. Supports idempotencyKey.',
  requiredScope: 'time:write',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { anyOf: [UUID_SCHEMA, { type: 'null' }], description: 'Project UUID (optional for misc time)' },
      date: { ...DATE_SCHEMA, description: 'Date (YYYY-MM-DD)' },
      hours: { type: 'number', minimum: 0, maximum: 24, description: 'Hours (0-24)' },
      note: { type: 'string', maxLength: 500, description: 'Optional note' },
      idempotencyKey: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional deduplication key' },
    },
    required: ['date', 'hours'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId, date, hours, note, idempotencyKey } = input as { projectId?: string | null; date: string; hours: number; note?: string; idempotencyKey?: string };
    const createTimeEntry = async (transaction?: import('../db/client').DbTransaction) => {
      const entry = await timeEntryService.upsertEntry(
        ctx.user.id,
        { projectId: projectId ?? null, date, hours, note },
        ctx.user,
        transaction,
      );
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

    if (!projectId) {
      assertNotFreelancer(ctx.user, 'Freelancers cannot log unassigned time');
    } else if (!await projectService.hasAccess(projectId, ctx.user)) {
      throw new Error('Access denied to this project');
    }
    return runIdempotentOperation(ctx.token, idempotencyKey, 'create_time_entry', input, createTimeEntry, async (response) => {
      if (!response.projectId) {
        assertNotFreelancer(ctx.user, 'Freelancers cannot log unassigned time');
      } else if (!await projectService.hasAccess(response.projectId, ctx.user)) {
        throw new Error('Access denied to this project');
      }
    });
  },
});
