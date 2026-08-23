import { describe, expect, it } from 'bun:test';
import './tool-definitions';
import { getAllTools } from './tools';
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
