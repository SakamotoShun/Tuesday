import { describe, expect, it } from 'bun:test';
import type { TuesdayMcpTool } from './types';
import { McpToolError } from './errors';
import { validateToolInput } from './validation';

const tool: TuesdayMcpTool = {
  name: 'validation_test',
  description: 'Test schema',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      date: { type: 'string', format: 'date' },
      version: { type: 'integer', minimum: 1 },
    },
    required: ['id', 'date', 'version'],
    additionalProperties: false,
  },
  handler: async () => ({}),
};

describe('validateToolInput', () => {
  it('accepts input matching the advertised schema', () => {
    expect(() => validateToolInput(tool, {
      id: '11111111-1111-4111-8111-111111111111',
      date: '2026-02-28',
      version: 1,
    })).not.toThrow();
  });

  it('rejects invalid calendar dates, UUIDs, versions, and extra properties', () => {
    try {
      validateToolInput(tool, {
        id: 'not-a-uuid',
        date: '2026-02-30',
        version: 0.5,
        extra: true,
      });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolError);
      const toolError = error as McpToolError;
      expect(toolError.code).toBe('VALIDATION_ERROR');
      expect((toolError.details?.issues as string[]).length).toBeGreaterThanOrEqual(4);
    }
  });
});
