import { describe, expect, it } from 'bun:test';
import './tool-definitions';
import { getAllTools } from './tools';
import { McpToolError } from './errors';
import { validateToolInput } from './validation';
import { MAX_DOC_BLOCK_DEPTH, MAX_DOC_BLOCKS, MAX_DOC_REPLACEMENT_ROOTS } from '../utils/doc-blocks';

describe('document MCP tool definitions', () => {
  it('exposes separate targeted edit and complete write tools', () => {
    const tools = getAllTools();
    const edit = tools.find((tool) => tool.name === 'edit_doc_blocks');
    const write = tools.find((tool) => tool.name === 'write_doc_blocks');

    expect(edit?.requiredScope).toBe('docs:write');
    expect(write?.requiredScope).toBe('docs:write');
    expect(edit?.inputSchema.required).toEqual(['docId', 'expectedVersion', 'operations']);
    expect(write?.inputSchema.required).toEqual(['docId', 'expectedVersion', 'blocks']);
  });

  it('advertises atomic delete and replacement operation schemas', () => {
    const edit = getAllTools().find((tool) => tool.name === 'edit_doc_blocks');
    const operations = (edit?.inputSchema.properties as Record<string, any>).operations;

    expect(operations.minItems).toBe(1);
    expect(operations.maxItems).toBe(100);
    expect(operations.items.oneOf).toHaveLength(2);
    expect(operations.items.oneOf[0].properties.type.enum).toEqual(['delete']);
    expect(operations.items.oneOf[1].properties.type.enum).toEqual(['replace']);
    expect(operations.items.oneOf[0].properties.path.maxItems).toBe(MAX_DOC_BLOCK_DEPTH);
    expect(operations.items.oneOf[1].properties.blocks.maxItems).toBe(MAX_DOC_REPLACEMENT_ROOTS);
  });

  it('advertises the same complete recursive block envelope required at runtime', () => {
    const tools = getAllTools();
    const edit = tools.find((tool) => tool.name === 'edit_doc_blocks');
    const write = tools.find((tool) => tool.name === 'write_doc_blocks');

    for (const tool of [edit, write]) {
      const blockSchema = (tool?.inputSchema as any).$defs.rawDocBlock;
      expect(blockSchema.required).toEqual(['id', 'type', 'props', 'children']);
      expect(blockSchema.properties.id).toMatchObject({ type: 'string', minLength: 1 });
      expect(blockSchema.properties.type).toMatchObject({ type: 'string', minLength: 1 });
      expect(blockSchema.properties.props.type).toBe('object');
      expect(blockSchema.properties.children.items.$ref).toBe('#/$defs/rawDocBlock');
      expect(blockSchema.additionalProperties).toBe(true);
    }

    const writeBlocks = (write?.inputSchema.properties as Record<string, any>).blocks;
    expect(writeBlocks.maxItems).toBe(MAX_DOC_BLOCKS);
    expect(writeBlocks.items.$ref).toBe('#/$defs/rawDocBlock');
  });
});

describe('P0 MCP tool definitions', () => {
  it('registers scope-free identity tools and grounded task tools', () => {
    const tools = getAllTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get('ping')?.requiredScope).toBeUndefined();
    expect(byName.get('whoami')?.requiredScope).toBeUndefined();
    expect(byName.get('list_task_statuses')?.requiredScope).toBe('tasks:read');
    expect(byName.get('list_project_statuses')?.requiredScope).toBe('projects:read');
    expect(byName.get('list_project_members')?.requiredScope).toBe('tasks:read');
    expect(byName.get('list_my_tasks')?.requiredScope).toBe('tasks:read');
    expect(byName.get('update_task_dates')?.requiredScope).toBe('tasks:write');
    expect(byName.get('update_task_assignees')?.requiredScope).toBe('tasks:write');
  });

  it('compiles every advertised input schema with the runtime validator', () => {
    for (const tool of getAllTools()) {
      try {
        validateToolInput(tool, {});
      } catch (error) {
        expect(error).toBeInstanceOf(McpToolError);
        expect((error as McpToolError).code).toBe('VALIDATION_ERROR');
      }
    }
  });

  it('requires at least one valid date mutation and a positive task version', () => {
    const tool = getAllTools().find((candidate) => candidate.name === 'update_task_dates')!;
    const base = {
      taskId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 1,
    };

    expect(() => validateToolInput(tool, { ...base, dueDate: null })).not.toThrow();
    expect(() => validateToolInput(tool, { ...base, startDate: '2026-08-23' })).not.toThrow();
    expect(() => validateToolInput(tool, base)).toThrow(McpToolError);
    expect(() => validateToolInput(tool, { ...base, expectedVersion: 0, dueDate: null })).toThrow(McpToolError);
    expect(() => validateToolInput(tool, { ...base, dueDate: '2026-02-30' })).toThrow(McpToolError);
  });

  it('enforces unique active-assignee-shaped inputs at the contract boundary', () => {
    const tool = getAllTools().find((candidate) => candidate.name === 'update_task_assignees')!;
    const userId = '22222222-2222-4222-8222-222222222222';
    const input = {
      taskId: '11111111-1111-4111-8111-111111111111',
      assigneeIds: [userId],
      expectedVersion: 2,
    };

    expect(() => validateToolInput(tool, input)).not.toThrow();
    expect(() => validateToolInput(tool, { ...input, assigneeIds: [userId, userId] })).toThrow(McpToolError);
  });

  it('advertises the idempotency key requirement for creation with assignees', () => {
    const tool = getAllTools().find((candidate) => candidate.name === 'create_task')!;
    const input = {
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Assigned task',
      assigneeIds: ['22222222-2222-4222-8222-222222222222'],
    };
    expect(() => validateToolInput(tool, input)).toThrow(McpToolError);
    expect(() => validateToolInput(tool, { ...input, idempotencyKey: 'create-task' })).not.toThrow();
    expect(() => validateToolInput(tool, { ...input, assigneeIds: [] })).not.toThrow();
    expect(() => validateToolInput(tool, { projectId: input.projectId, title: input.title })).not.toThrow();
  });
});
