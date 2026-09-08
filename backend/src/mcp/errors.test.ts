import { describe, expect, it } from 'bun:test';
import { DocCollabPendingError } from '../repositories/doc';
import { serializeMcpToolError, toMcpToolError } from './errors';

describe('MCP error translation', () => {
  it('preserves the pending collaboration code from the repository error', () => {
    const error = toMcpToolError(new DocCollabPendingError());
    expect(serializeMcpToolError(error)).toMatchObject({
      error: { code: 'DOC_COLLAB_PENDING', retryable: true },
    });
  });

  it('does not expose unexpected internal error details', () => {
    const error = toMcpToolError(new Error('database connection secret'));
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).not.toContain('secret');
  });
});
