import { describe, expect, it } from 'bun:test';
import { createDocTargetTools } from './doc-target-tools';
import { getTool } from './tools';
import './tool-definitions';

describe('targeted document tools', () => {
  it('registers bounded live tools and optional targets on get_doc', () => {
    const before = getTool('get_doc');
    expect(before).toBeDefined();
    expect(createDocTargetTools().map(tool => tool.name)).toEqual(['get_doc', 'search_doc', 'patch_doc']);
    expect(getTool('get_doc')).toBe(before);
    expect(getTool('search_doc')?.requiredScope).toBe('docs:read');
    expect(getTool('patch_doc')?.requiredScope).toBe('docs:write');
    expect(before!.inputSchema).toHaveProperty('properties.includeTargets');
  });
});
