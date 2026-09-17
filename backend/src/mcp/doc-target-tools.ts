/** Bounded live text-span tools using current-state Yjs references. */
import { z } from 'zod';
import { db } from '../db/client';
import { docService } from '../services/doc';
import { readSignedCurrentSpans, applySignedCurrentSpan } from '../repositories/docSpanReference';
import { selectLiteralSpans } from '../collab/docLiteralSearch';
import { DocReferenceError, type DocReferenceCodec } from '../collab/docReference';
import { DocSpanError } from '../collab/docSpan';
import { DocGenerationMismatchError, DocSyncBusyError, DocSyncTooLargeError } from '../collab/docHistory';
import { docCollabHub } from '../collab/hub';
import { runIdempotentOperation } from './idempotency';
import { McpToolError, toMcpToolError } from './errors';
import type { McpContext, TuesdayMcpTool } from './types';

const UUID = { type: 'string', format: 'uuid' } as const;
const LIMIT = { type: 'integer', minimum: 1, maximum: 20 } as const;
const OFFSET = { type: 'integer', minimum: 0, maximum: 1000 } as const;
const scalarText = (text: string) => Array.from(text).every(char => {
  const code = char.codePointAt(0)!;
  return code < 0xd800 || code > 0xdfff;
});
const paging = { limit: z.number().int().min(1).max(20).default(10), offset: z.number().int().min(0).max(1000).default(0) };
const readSchema = z.object({ docId: z.string().uuid(), includeTargets: z.boolean().default(false), ...paging }).strict();
const searchSchema = z.object({ docId: z.string().uuid(), query: z.string().min(1).max(512).refine(scalarText), ...paging }).strict();
const operationSchema = z.object({ type: z.literal('replace_text'), targetRef: z.string().min(1).max(4096),
  text: z.string().max(16384).refine(scalarText) }).strict();
const patchSchema = z.object({ docId: z.string().uuid(), idempotencyKey: z.string().min(1).max(200),
  operations: z.array(operationSchema).length(1) }).strict();

function requireScope(ctx: McpContext, scope: string) {
  if (ctx.user.id !== ctx.token.userId) throw new McpToolError('ACCESS_DENIED', 'Credential identity does not match the request.');
  if (!ctx.token.scopes.has(scope)) throw new McpToolError('SCOPE_REQUIRED', `This operation requires ${scope}.`);
}
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new McpToolError('VALIDATION_ERROR', 'Input does not match the bounded document tool schema.');
  return parsed.data;
}
function bounded<T>(response: T): T {
  if (Buffer.byteLength(JSON.stringify(response)) > 1024 * 1024) throw new McpToolError('LIMIT_EXCEEDED', 'Document response exceeds 1 MiB.');
  return response;
}
function pageInfo(offset: number, count: number, hasMore: boolean) {
  const next = offset + count;
  return { nextOffset: hasMore && next <= 1000 ? next : null, truncated: hasMore && next > 1000 };
}
async function documentErrors<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof DocReferenceError) {
      throw new McpToolError(error.code === 'REFERENCE_TOO_LARGE' ? 'LIMIT_EXCEEDED' : error.code, error.message);
    }
    if (error instanceof DocSpanError) {
      throw new McpToolError(error.code === 'LIMIT_EXCEEDED' ? 'LIMIT_EXCEEDED'
        : error.code === 'TARGET_GONE' ? 'TARGET_GONE' : 'TARGET_UNAVAILABLE',
       error.message);
    }
    if (error instanceof DocGenerationMismatchError) throw new McpToolError('REFERENCE_INVALID', 'Document generation changed.');
    if (error instanceof DocSyncBusyError) throw new McpToolError('DOC_BUSY', 'Complete current history is not available within the read budget.', undefined, true);
    if (error instanceof DocSyncTooLargeError) throw new McpToolError('LIMIT_EXCEEDED', 'Current document state exceeds the bounded history limit.');
    throw toMcpToolError(error);
  }
}

/** The codec can be injected for isolated reference-expiry tests. */
export function createDocTargetTools(codec?: DocReferenceCodec): TuesdayMcpTool[] {
  return [{
    name: 'get_doc', requiredScope: 'docs:read',
    description: 'Read current document content. includeTargets lists formatting-run spans; supported paragraph spans receive signed references, other block kinds are marked unavailable. These are not body references. Offsets use UTF-16 within each inline container.',
    inputSchema: { type: 'object', properties: { docId: UUID, includeTargets: { type: 'boolean' }, limit: LIMIT, offset: OFFSET },
      required: ['docId'], additionalProperties: false },
    handler: (raw, ctx) => documentErrors(async () => {
      requireScope(ctx, 'docs:read');
      const input = parse(readSchema, raw);
      if (!input.includeTargets) {
        const doc = await docService.getDoc(input.docId, ctx.user);
        if (!doc) throw new McpToolError('NOT_FOUND', 'Doc not found.');
        return bounded(doc);
      }
      const authorised = await docService.authoriseDoc(input.docId, ctx.user);
      return db.transaction(async tx => {
        const result = await readSignedCurrentSpans(tx, { docId: input.docId, token: ctx.token, authorised },
          state => selectLiteralSpans(state, undefined, input.limit, input.offset), codec);
        return bounded({ ...result.doc, collabSeq: result.collabSeq, generation: result.generation,
          targets: result.targets, offsetUnit: 'utf16', ...pageInfo(input.offset, result.targets.length, result.hasMore) });
      });
    }),
  }, {
    name: 'search_doc', requiredScope: 'docs:read',
    description: 'Case-sensitive literal search in one current document. Supported paragraph matches receive individual signed spans, never a global replacement. Cross-formatting and non-paragraph matches are reported unavailable without a reference. Matches never cross inline containers; pagination uses current state.',
    inputSchema: { type: 'object', properties: { docId: UUID, query: { type: 'string', minLength: 1, maxLength: 512 }, limit: LIMIT, offset: OFFSET },
      required: ['docId', 'query'], additionalProperties: false },
    handler: (raw, ctx) => documentErrors(async () => {
      requireScope(ctx, 'docs:read');
      const input = parse(searchSchema, raw);
      const authorised = await docService.authoriseDoc(input.docId, ctx.user);
      return db.transaction(async tx => {
        const result = await readSignedCurrentSpans(tx, { docId: input.docId, token: ctx.token, authorised },
          state => selectLiteralSpans(state, input.query, input.limit, input.offset), codec);
        return bounded({ docId: input.docId, generation: result.generation, collabSeq: result.collabSeq, version: result.doc.version,
          matchMode: 'literal_case_sensitive', offsetUnit: 'utf16', matches: result.targets,
          ...pageInfo(input.offset, result.targets.length, result.hasMore) });
      });
    }),
  }, {
    name: 'patch_doc', requiredScope: 'docs:write',
    description: 'Replace the current surviving interval of one signed paragraph span, including intervening edits inside its outward boundaries; preserve outside edits while people stay connected. References expire after 15 minutes. Deleted containers or collapsed intervals fail without restoring content or selecting another match. Plain text only, at most 16384 UTF-16 units; empty text deletes the interval. Requires idempotencyKey, no expectedVersion. Returns a compact receipt. Bodies, line breaks, structural operations and batches are unsupported.',
    inputSchema: { type: 'object', properties: { docId: UUID, idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 },
      operations: { type: 'array', minItems: 1, maxItems: 1, items: { type: 'object', properties: {
        type: { type: 'string', const: 'replace_text' }, targetRef: { type: 'string', minLength: 1, maxLength: 4096 },
        text: { type: 'string', maxLength: 16384 },
      }, required: ['type', 'targetRef', 'text'], additionalProperties: false } } },
    required: ['docId', 'idempotencyKey', 'operations'], additionalProperties: false },
    handler: (raw, ctx) => documentErrors(async () => {
      requireScope(ctx, 'docs:write');
      const input = parse(patchSchema, raw);
      // Authorise before acquiring a pooled transaction connection; never project here.
      const authorised = await docService.authoriseDoc(input.docId, ctx.user, true);
      return runIdempotentOperation(ctx.token, input.idempotencyKey, 'patch_doc', input, async tx => {
        const operation = input.operations[0]!;
        const result = await applySignedCurrentSpan(tx, { docId: input.docId, targetRef: operation.targetRef,
          text: operation.text, token: ctx.token, authorised }, codec);
        return { response: result.response, resultEntityType: 'doc', resultEntityId: input.docId,
          afterCommit: async () => { docCollabHub.broadcast(input.docId, JSON.stringify({ type: 'doc.update', generation: result.response.generation,
            seq: result.response.collabSeq, actorId: ctx.user.id,
            update: Buffer.from(result.update).toString('base64') })); } };
      }, async () => { await docService.authoriseDoc(input.docId, ctx.user, true); });
    }),
  }];
}
