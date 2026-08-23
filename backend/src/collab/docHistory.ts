import * as Y from 'yjs';
import { blocksFromYDoc } from './docContent';
import type { RawDocBlock } from '../utils/doc-blocks';

export const MAX_DOC_UPDATE_BYTES = 1024 * 1024;
export const MAX_DOC_SYNC_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_COLLAB_SYNC_UPDATES = 200;

export class DocInvalidUpdateError extends Error {
  constructor(message = 'Invalid Yjs document update', options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocInvalidUpdateError';
  }
}

export class DocUpdateTooLargeError extends Error {
  constructor(public readonly size: number, public readonly limit = MAX_DOC_UPDATE_BYTES) {
    super(`Document update is ${size} bytes; maximum is ${limit}`);
    this.name = 'DocUpdateTooLargeError';
  }
}

export class DocSyncBusyError extends Error {
  constructor(message = 'Document history changed repeatedly during synchronization') {
    super(message);
    this.name = 'DocSyncBusyError';
  }
}

export class DocSyncTooLargeError extends Error {
  constructor(public readonly size: number, public readonly limit = MAX_DOC_SYNC_PAYLOAD_BYTES) {
    super(`Document synchronization payload is ${size} bytes; maximum is ${limit}`);
    this.name = 'DocSyncTooLargeError';
  }
}

export class DocNotFoundError extends Error {
  constructor() {
    super('Document not found');
    this.name = 'DocNotFoundError';
  }
}

type YDocWithStore = Y.Doc & {
  store: {
    pendingStructs: unknown | null;
    pendingDs: unknown | null;
  };
};

function assertResolved(doc: Y.Doc): void {
  const store = (doc as YDocWithStore).store;
  if (store.pendingStructs !== null || store.pendingDs !== null) {
    throw new DocInvalidUpdateError('Yjs document update has unresolved dependencies');
  }
}

function applyUpdate(doc: Y.Doc, update: Uint8Array | Buffer): void {
  try {
    Y.applyUpdate(doc, new Uint8Array(update), 'remote');
  } catch (cause) {
    throw new DocInvalidUpdateError('Malformed Yjs document update', { cause });
  }
}

export function decodeStrictBase64(value: string, maxBytes: number): Uint8Array {
  if (
    value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new DocInvalidUpdateError('Document update must be canonical base64');
  }

  const maxEncodedLength = Math.ceil(maxBytes / 3) * 4;
  if (value.length > maxEncodedLength) {
    throw new DocUpdateTooLargeError(Math.floor(value.length * 3 / 4), maxBytes);
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new DocInvalidUpdateError('Document update must be canonical base64');
  }
  if (decoded.byteLength > maxBytes) {
    throw new DocUpdateTooLargeError(decoded.byteLength, maxBytes);
  }
  return new Uint8Array(decoded);
}

export function materializeDocHistory(
  baseline: Uint8Array | Buffer | null,
  updates: Array<Uint8Array | Buffer>,
): Y.Doc {
  const doc = new Y.Doc();
  if (baseline) {
    applyUpdate(doc, baseline);
  }
  for (const update of updates) {
    applyUpdate(doc, update);
  }
  assertResolved(doc);
  return doc;
}

export function applyAndValidateDocUpdate(
  baseline: Uint8Array | Buffer | null,
  updates: Array<Uint8Array | Buffer>,
  candidate: Uint8Array,
): { doc: Y.Doc; blocks: RawDocBlock[] } {
  if (candidate.byteLength > MAX_DOC_UPDATE_BYTES) {
    throw new DocUpdateTooLargeError(candidate.byteLength);
  }

  const doc = materializeDocHistory(baseline, updates);
  applyUpdate(doc, candidate);
  assertResolved(doc);

  try {
    return { doc, blocks: blocksFromYDoc(doc) };
  } catch (cause) {
    if (cause instanceof DocInvalidUpdateError) {
      throw cause;
    }
    throw new DocInvalidUpdateError('Yjs document cannot be converted to canonical blocks', { cause });
  }
}

export function deriveValidatedDocBlocks(doc: Y.Doc): RawDocBlock[] {
  assertResolved(doc);
  try {
    return blocksFromYDoc(doc);
  } catch (cause) {
    throw new DocInvalidUpdateError('Yjs document cannot be converted to canonical blocks', { cause });
  }
}

export function docStatesEqual(left: Y.Doc, right: Y.Doc): boolean {
  return Buffer.from(Y.encodeStateAsUpdate(left)).equals(Buffer.from(Y.encodeStateAsUpdate(right)));
}
