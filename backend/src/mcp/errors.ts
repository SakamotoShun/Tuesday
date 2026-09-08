import { DocBlockValidationError } from '../utils/doc-blocks';
import { DocCollabPendingError } from '../repositories/doc';

export type McpErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'SCOPE_REQUIRED'
  | 'READ_ONLY_ROLE'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'ACTIVE_COLLABORATORS'
  | 'DOC_COLLAB_PENDING'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class McpToolError extends Error {
  constructor(
    public readonly code: McpErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly retryable = false,
    public readonly recovery?: string,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export function toMcpToolError(error: unknown): McpToolError {
  if (error instanceof McpToolError) return error;
  if (error instanceof DocBlockValidationError) {
    return new McpToolError('VALIDATION_ERROR', error.message);
  }
  if (error instanceof DocCollabPendingError) {
    return new McpToolError('DOC_COLLAB_PENDING', 'Document collaboration changes are still being saved.', undefined, true);
  }

  const message = error instanceof Error ? error.message : '';
  if (/not found/i.test(message)) {
    return new McpToolError('NOT_FOUND', 'The requested resource was not found.');
  }
  if (/access denied|admin access required|not a member/i.test(message)) {
    return new McpToolError('ACCESS_DENIED', 'You do not have access to this resource.');
  }
  if (/freelancer|read.only/i.test(message)) {
    return new McpToolError('READ_ONLY_ROLE', message);
  }
  if (/invalid status|must be active project members|title .*required|title .*empty|invalid .*date/i.test(message)) {
    return new McpToolError('VALIDATION_ERROR', message);
  }
  if (/conflict|version changed/i.test(message)) {
    return new McpToolError(
      'VERSION_CONFLICT',
      'The resource changed after it was read.',
      undefined,
      false,
      'Read the resource again and reassess the requested change.',
    );
  }
  if (/active collaborator/i.test(message)) {
    return new McpToolError('ACTIVE_COLLABORATORS', message, undefined, true);
  }
  return new McpToolError('INTERNAL_ERROR', 'The tool call failed unexpectedly.', undefined, true);
}

export function serializeMcpToolError(error: McpToolError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      retryable: error.retryable,
      ...(error.recovery ? { recovery: error.recovery } : {}),
    },
  };
}
