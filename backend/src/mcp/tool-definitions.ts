import { registerTool } from './tools';
import type { McpContext } from './types';
import {
  searchService,
  projectService,
  taskService,
  docService,
} from '../services';

// ============ ping ============

registerTool({
  name: 'ping',
  description: 'Test connectivity. Returns pong with server info.',
  requiredScope: 'search:read',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input: unknown, ctx: McpContext) => {
    return {
      message: 'pong',
      user: ctx.user.name,
      role: ctx.user.role,
      scopes: Array.from(ctx.token.scopes),
    };
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
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input: unknown, ctx: McpContext) => {
    const projects = await projectService.getProjects(ctx.user);
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client,
      statusId: p.statusId,
      type: p.type,
      startDate: p.startDate,
      targetEndDate: p.targetEndDate,
      budgetHours: p.budgetHours,
      isTemplate: p.isTemplate,
      updatedAt: p.updatedAt,
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
    properties: {
      projectId: { type: 'string', description: 'Project UUID' },
    },
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
    const tasks = await taskService.getProjectTasks(projectId, ctx.user, { statusId });
    return tasks;
  },
});

// ============ get_task ============

registerTool({
  name: 'get_task',
  description: 'Get a single task by ID.',
  requiredScope: 'tasks:read',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task UUID' },
    },
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
    properties: {
      projectId: { type: 'string', description: 'Project UUID' },
    },
    required: ['projectId'],
    additionalProperties: false,
  },
  handler: async (input: unknown, ctx: McpContext) => {
    const { projectId } = input as { projectId: string };
    const docs = await docService.getProjectDocs(projectId, ctx.user);
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      parentId: d.parentId,
      isDatabase: d.isDatabase,
      searchText: (d as any).searchText ?? '',
      properties: (d as any).properties ?? {},
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
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
    properties: {
      docId: { type: 'string', description: 'Doc UUID' },
    },
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