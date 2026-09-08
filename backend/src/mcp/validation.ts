import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import type { TuesdayMcpTool } from './types';
import { McpToolError } from './errors';

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new WeakMap<TuesdayMcpTool, ValidateFunction>();

ajv.addFormat('uuid', {
  type: 'string',
  validate: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
});
ajv.addFormat('date', {
  type: 'string',
  validate: (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
  },
});

function formatValidationError(error: ErrorObject): string {
  const path = error.instancePath || '/';
  if (error.keyword === 'additionalProperties') {
    return `${path} contains unexpected property "${String(error.params.additionalProperty)}"`;
  }
  if (error.keyword === 'required') {
    return `${path} is missing required property "${String(error.params.missingProperty)}"`;
  }
  return `${path} ${error.message ?? 'is invalid'}`;
}

export function validateToolInput(tool: TuesdayMcpTool, input: unknown): void {
  let validate = validators.get(tool);
  if (!validate) {
    validate = ajv.compile(tool.inputSchema);
    validators.set(tool, validate);
  }

  if (validate(input)) return;

  throw new McpToolError('VALIDATION_ERROR', 'Tool input is invalid.', {
    issues: (validate.errors ?? []).map(formatValidationError),
  });
}
