import { randomUUID } from 'node:crypto';

export const MAX_DOC_CONTENT_BYTES = 512 * 1024;
export const MAX_DOC_BLOCK_DEPTH = 32;
export const MAX_DOC_JSON_DEPTH = 128;
export const MAX_DOC_BLOCKS = 10_000;
export const MAX_DOC_EDIT_OPERATIONS = 100;
export const MAX_DOC_REPLACEMENT_ROOTS = 100;
export const MAX_MCP_REQUEST_BYTES = 1024 * 1024;

export class DocBlockValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocBlockValidationError';
  }
}

function invalid(message: string): never {
  throw new DocBlockValidationError(message);
}

export interface RawDocBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children: RawDocBlock[];
  [key: string]: unknown;
}

export type DocBlockIdPath = [string, ...string[]];
export type RawDocBlockReplacement = [RawDocBlock, ...RawDocBlock[]];

export interface DeleteDocBlockOperation {
  type: 'delete';
  path: DocBlockIdPath;
}

export interface ReplaceDocBlockOperation {
  type: 'replace';
  path: DocBlockIdPath;
  blocks: RawDocBlockReplacement;
}

export type DocBlockEditOperation = DeleteDocBlockOperation | ReplaceDocBlockOperation;

export interface ApplyDocBlockEditsResult {
  blocks: RawDocBlock[];
  deletedBlockIds: string[];
  replacementRootIds: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function displayPath(path: string[]): string {
  return path.join('/');
}

function validateJsonValue(value: unknown, label: string): void {
  const ancestors = new WeakSet<object>();
  const stack: Array<{ value: unknown; depth: number; exiting?: boolean }> = [{ value, depth: 1 }];

  while (stack.length > 0) {
    const item = stack.pop()!;
    if (item.value === null || ['string', 'number', 'boolean'].includes(typeof item.value)) {
      continue;
    }
    if (typeof item.value !== 'object') {
      invalid(`${label} must contain only JSON values`);
    }
    if (item.exiting) {
      ancestors.delete(item.value);
      continue;
    }
    if (item.depth > MAX_DOC_JSON_DEPTH) {
      invalid(`${label} exceeds the maximum JSON depth of ${MAX_DOC_JSON_DEPTH}`);
    }
    if (ancestors.has(item.value)) {
      invalid(`${label} must not contain circular references`);
    }

    ancestors.add(item.value);
    stack.push({ ...item, exiting: true });
    const children = Array.isArray(item.value) ? item.value : Object.values(item.value);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ value: children[index], depth: item.depth + 1 });
    }
  }
}

function validateSerializedSize(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_DOC_CONTENT_BYTES) {
    invalid(`${label} exceeds the maximum size of ${MAX_DOC_CONTENT_BYTES} bytes`);
  }
}

function validateBlockArray(value: unknown, label: string, seenIds: Set<string>): number {
  if (!Array.isArray(value)) {
    invalid(`${label} must be an array`);
  }

  let blockCount = 0;
  const stack = value.map((block, index) => ({ block, path: `${label}[${index}]`, depth: 1 })).reverse();
  while (stack.length > 0) {
    const { block, path, depth } = stack.pop()!;
    blockCount += 1;
    if (blockCount > MAX_DOC_BLOCKS) {
      invalid(`${label} exceeds the maximum of ${MAX_DOC_BLOCKS} blocks`);
    }
    if (depth > MAX_DOC_BLOCK_DEPTH) {
      invalid(`${label} exceeds the maximum block depth of ${MAX_DOC_BLOCK_DEPTH}`);
    }
    if (!isPlainObject(block)) {
      invalid(`Block at ${path} must be a plain object`);
    }
    if (typeof block.id !== 'string' || block.id.length === 0) {
      invalid(`Block at ${path} must have a non-empty string id`);
    }
    if (typeof block.type !== 'string' || block.type.length === 0) {
      invalid(`Block "${block.id}" must have a non-empty string type`);
    }
    if (!isPlainObject(block.props)) {
      invalid(`Block "${block.id}" must have plain-object props`);
    }
    if (!Array.isArray(block.children)) {
      invalid(`Block "${block.id}" must have an array of children`);
    }
    if (seenIds.has(block.id)) {
      invalid(`Duplicate block ID "${block.id}"`);
    }

    seenIds.add(block.id);
    for (let index = block.children.length - 1; index >= 0; index -= 1) {
      stack.push({ block: block.children[index], path: `${path}.children[${index}]`, depth: depth + 1 });
    }
  }

  return blockCount;
}

export function validateRawDocBlocks(value: unknown): asserts value is RawDocBlock[] {
  validateJsonValue(value, 'Blocks');
  validateSerializedSize(value, 'Blocks');
  validateBlockArray(value, 'Blocks', new Set());
}

export function normalizeLegacyDocBlocks(value: unknown): RawDocBlock[] {
  validateJsonValue(value, 'Blocks');
  validateSerializedSize(value, 'Blocks');
  if (!Array.isArray(value)) {
    invalid('Blocks must be an array');
  }

  const seenIds = new Set<string>();
  let blockCount = 0;
  const normalize = (items: unknown[], label: string, depth: number): RawDocBlock[] => items.map((item, index) => {
    const path = `${label}[${index}]`;
    blockCount += 1;
    if (blockCount > MAX_DOC_BLOCKS) {
      invalid(`Blocks exceeds the maximum of ${MAX_DOC_BLOCKS} blocks`);
    }
    if (depth > MAX_DOC_BLOCK_DEPTH) {
      invalid(`Blocks exceeds the maximum block depth of ${MAX_DOC_BLOCK_DEPTH}`);
    }
    if (!isPlainObject(item)) {
      invalid(`Block at ${path} must be a plain object`);
    }

    if (item.id !== undefined && typeof item.id !== 'string') {
      invalid(`Block at ${path} must have a string id when provided`);
    }
    if (item.type !== undefined && typeof item.type !== 'string') {
      invalid(`Block at ${path} must have a string type when provided`);
    }
    if (item.props !== undefined && !isPlainObject(item.props)) {
      invalid(`Block at ${path} must have plain-object props when provided`);
    }
    if (item.children !== undefined && !Array.isArray(item.children)) {
      invalid(`Block at ${path} must have an array of children when provided`);
    }

    const hasSuppliedId = typeof item.id === 'string' && item.id.length > 0;
    let id = hasSuppliedId ? item.id as string : randomUUID();
    while (seenIds.has(id) && !hasSuppliedId) {
      id = randomUUID();
    }
    if (seenIds.has(id)) {
      invalid(`Duplicate block ID "${id}"`);
    }
    seenIds.add(id);

    return {
      ...item,
      id,
      type: item.type || 'paragraph',
      props: item.props ?? {},
      children: normalize(item.children ?? [], `${path}.children`, depth + 1),
    } as RawDocBlock;
  });

  const normalized = normalize(value, 'Blocks', 1);
  validateRawDocBlocks(normalized);
  return normalized;
}

export function validateDocBlockEditOperations(value: unknown): asserts value is DocBlockEditOperation[] {
  validateJsonValue(value, 'Operations');
  validateSerializedSize(value, 'Operations');
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DOC_EDIT_OPERATIONS) {
    invalid(`Operations must be an array with 1 to ${MAX_DOC_EDIT_OPERATIONS} items`);
  }

  let replacementBlockCount = 0;
  for (let index = 0; index < value.length; index += 1) {
    const operation = value[index];
    const label = `Operation ${index + 1}`;
    if (!isPlainObject(operation)) {
      invalid(`${label} must be a plain object`);
    }
    if (operation.type !== 'delete' && operation.type !== 'replace') {
      invalid(`${label} type must be "delete" or "replace"`);
    }
    const allowedKeys = operation.type === 'delete'
      ? new Set(['type', 'path'])
      : new Set(['type', 'path', 'blocks']);
    const unexpectedKey = Object.keys(operation).find((key) => !allowedKeys.has(key));
    if (unexpectedKey) {
      invalid(`${label} contains unexpected property "${unexpectedKey}"`);
    }
    if (!Array.isArray(operation.path) || operation.path.length === 0 || operation.path.length > MAX_DOC_BLOCK_DEPTH
      || operation.path.some((part) => typeof part !== 'string' || part.length === 0)) {
      invalid(`${label} path must contain 1 to ${MAX_DOC_BLOCK_DEPTH} non-empty string IDs`);
    }
    if (operation.type === 'replace') {
      if (!Array.isArray(operation.blocks) || operation.blocks.length < 1 || operation.blocks.length > MAX_DOC_REPLACEMENT_ROOTS) {
        invalid(`${label} blocks must contain 1 to ${MAX_DOC_REPLACEMENT_ROOTS} complete blocks`);
      }
      replacementBlockCount += validateBlockArray(operation.blocks, `${label} blocks`, new Set());
      if (replacementBlockCount > MAX_DOC_BLOCKS) {
        invalid(`Replacement blocks exceed the maximum of ${MAX_DOC_BLOCKS} blocks`);
      }
    }
  }
}

function resolvePath(blocks: RawDocBlock[], path: string[]): RawDocBlock | undefined {
  let block = blocks.find((candidate) => candidate.id === path[0]);
  for (let index = 1; block && index < path.length; index += 1) {
    block = block.children.find((candidate) => candidate.id === path[index]);
  }
  return block;
}

function isPathPrefix(left: string[], right: string[]): boolean {
  return left.length <= right.length && left.every((part, index) => part === right[index]);
}

export function applyDocBlockEdits(
  originalBlocks: unknown,
  operations: unknown,
): ApplyDocBlockEditsResult {
  validateRawDocBlocks(originalBlocks);
  validateDocBlockEditOperations(operations);

  const targets = operations.map((operation) => {
    const block = resolvePath(originalBlocks, operation.path);
    if (!block) {
      invalid(`Block path not found: "${displayPath(operation.path)}"`);
    }
    return { block, operation };
  });

  for (let index = 0; index < targets.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < targets.length; otherIndex += 1) {
      const left = targets[index].operation.path;
      const right = targets[otherIndex].operation.path;
      if (left.length === right.length && isPathPrefix(left, right)) {
        invalid(`Duplicate edit target: "${displayPath(left)}"`);
      }
      if (isPathPrefix(left, right) || isPathPrefix(right, left)) {
        invalid(`Overlapping edit targets: "${displayPath(left)}" and "${displayPath(right)}"`);
      }
    }
  }

  const editsById = new Map(targets.map(({ block, operation }) => [block.id, operation]));
  const applyWithSharing = (blocks: RawDocBlock[]): RawDocBlock[] => {
    let changed = false;
    const result: RawDocBlock[] = [];
    for (const block of blocks) {
      const operation = editsById.get(block.id);
      if (operation?.type === 'delete') {
        changed = true;
        continue;
      }
      if (operation?.type === 'replace') {
        changed = true;
        result.push(...operation.blocks);
        continue;
      }

      const children = applyWithSharing(block.children);
      if (children !== block.children) {
        changed = true;
        result.push({ ...block, children });
      } else {
        result.push(block);
      }
    }
    return changed ? result : blocks;
  };

  const blocks = applyWithSharing(originalBlocks);
  validateRawDocBlocks(blocks);

  return {
    blocks,
    deletedBlockIds: targets
      .filter(({ operation }) => operation.type === 'delete')
      .map(({ block }) => block.id),
    replacementRootIds: targets.flatMap(({ operation }) => operation.type === 'replace'
      ? operation.blocks.map((block) => block.id)
      : []),
  };
}
