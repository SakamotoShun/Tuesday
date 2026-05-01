import * as Y from 'yjs';

export const MAX_COLLAB_SYNC_UPDATES = 200;
const COLLAB_SYNC_BATCH_SIZE = 100;

type DocSnapshotRecord = {
  seq: number;
  snapshot: Uint8Array | Buffer;
};

type DocUpdateRecord = {
  seq: number;
  update: Uint8Array | Buffer;
};

type WhiteboardSnapshotRecord = {
  seq: number;
  snapshot: unknown;
};

type WhiteboardUpdateRecord = {
  seq: number;
  update: unknown;
};

type WhiteboardScene = {
  elements: Array<Record<string, unknown>>;
  files: Record<string, unknown>;
};

interface DocCollabSyncRepository {
  getLatestSnapshot(docId: string): Promise<DocSnapshotRecord | null | undefined>;
  getLatestSeq(docId: string): Promise<number>;
  countUpdatesInRange(docId: string, minSeqExclusive: number, maxSeqInclusive: number): Promise<number>;
  getUpdatesInRange(
    docId: string,
    minSeqExclusive: number,
    maxSeqInclusive: number,
    limit?: number
  ): Promise<DocUpdateRecord[]>;
  createSnapshot(docId: string, snapshot: Uint8Array, seq: number): Promise<unknown>;
  compactHistory(docId: string, snapshotSeq: number): Promise<void>;
}

interface WhiteboardCollabSyncRepository {
  getLatestSnapshot(whiteboardId: string): Promise<WhiteboardSnapshotRecord | null | undefined>;
  getLatestSeq(whiteboardId: string): Promise<number>;
  countUpdatesInRange(whiteboardId: string, minSeqExclusive: number, maxSeqInclusive: number): Promise<number>;
  getUpdatesInRange(
    whiteboardId: string,
    minSeqExclusive: number,
    maxSeqInclusive: number,
    limit?: number
  ): Promise<WhiteboardUpdateRecord[]>;
  createSnapshot(whiteboardId: string, snapshot: Record<string, unknown>, seq: number): Promise<unknown>;
  compactHistory(whiteboardId: string, snapshotSeq: number): Promise<void>;
}

interface WhiteboardStateRepository {
  update(whiteboardId: string, data: { data: Record<string, unknown> }): Promise<unknown>;
}

export interface DocSyncState {
  snapshot: Uint8Array | null;
  updates: Uint8Array[];
  latestSeq: number;
}

export interface WhiteboardSyncState {
  snapshot: Record<string, unknown>;
  updates: Record<string, unknown>[];
  latestSeq: number;
}

function toUint8Array(value: Uint8Array | Buffer) {
  return new Uint8Array(value);
}

function getUpdatesBatchRange(updates: Array<{ seq: number }>, maxSeqInclusive: number) {
  const nextSeq = updates[updates.length - 1]?.seq ?? maxSeqInclusive;
  return Math.min(nextSeq, maxSeqInclusive);
}

function normalizeElements(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<Record<string, unknown>>;
  }

  return value.filter(
    (element): element is Record<string, unknown> => typeof element === 'object' && element !== null && !Array.isArray(element)
  );
}

function normalizeFiles(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function normalizeWhiteboardScene(value: unknown): WhiteboardScene {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { elements: [], files: {} };
  }

  const candidate = value as { elements?: unknown; files?: unknown };

  return {
    elements: normalizeElements(candidate.elements),
    files: normalizeFiles(candidate.files),
  };
}

function mergeElements(base: WhiteboardScene['elements'], incoming: WhiteboardScene['elements']) {
  const merged = new Map(base.map((element) => [String(element.id ?? ''), element]));

  for (const element of incoming) {
    const elementId = String(element.id ?? '');
    if (!elementId) {
      continue;
    }

    const current = merged.get(elementId);
    const currentVersion = typeof current?.version === 'number' ? current.version : 0;
    const nextVersion = typeof element.version === 'number' ? element.version : 0;

    if (!current || nextVersion >= currentVersion) {
      merged.set(elementId, element);
    }
  }

  return Array.from(merged.values());
}

function mergeWhiteboardScene(base: WhiteboardScene, incoming: WhiteboardScene): WhiteboardScene {
  return {
    elements: mergeElements(base.elements, incoming.elements),
    files: incoming.files,
  };
}

async function loadDocUpdatesInRange(
  repository: DocCollabSyncRepository,
  docId: string,
  minSeqExclusive: number,
  maxSeqInclusive: number
) {
  const updates: DocUpdateRecord[] = [];
  let cursor = minSeqExclusive;

  while (cursor < maxSeqInclusive) {
    const batch = await repository.getUpdatesInRange(docId, cursor, maxSeqInclusive, COLLAB_SYNC_BATCH_SIZE);
    if (batch.length === 0) {
      break;
    }

    updates.push(...batch);
    cursor = getUpdatesBatchRange(batch, maxSeqInclusive);
  }

  return updates;
}

async function loadWhiteboardUpdatesInRange(
  repository: WhiteboardCollabSyncRepository,
  whiteboardId: string,
  minSeqExclusive: number,
  maxSeqInclusive: number
) {
  const updates: WhiteboardUpdateRecord[] = [];
  let cursor = minSeqExclusive;

  while (cursor < maxSeqInclusive) {
    const batch = await repository.getUpdatesInRange(whiteboardId, cursor, maxSeqInclusive, COLLAB_SYNC_BATCH_SIZE);
    if (batch.length === 0) {
      break;
    }

    updates.push(...batch);
    cursor = getUpdatesBatchRange(batch, maxSeqInclusive);
  }

  return updates;
}

async function compactDocHistory(
  repository: DocCollabSyncRepository,
  docId: string,
  snapshotRecord: DocSnapshotRecord | null,
  latestSeq: number
) {
  const doc = new Y.Doc();

  if (snapshotRecord) {
    Y.applyUpdate(doc, toUint8Array(snapshotRecord.snapshot), 'remote');
  }

  const updates = await loadDocUpdatesInRange(repository, docId, snapshotRecord?.seq ?? 0, latestSeq);
  for (const update of updates) {
    Y.applyUpdate(doc, toUint8Array(update.update), 'remote');
  }

  const snapshot = Y.encodeStateAsUpdate(doc);
  await repository.createSnapshot(docId, snapshot, latestSeq);
  await repository.compactHistory(docId, latestSeq);
  return snapshot;
}

async function compactWhiteboardHistory(
  repository: WhiteboardCollabSyncRepository,
  stateRepository: WhiteboardStateRepository,
  whiteboardId: string,
  baseScene: WhiteboardScene,
  baseSeq: number,
  latestSeq: number
) {
  let merged = baseScene;
  const updates = await loadWhiteboardUpdatesInRange(repository, whiteboardId, baseSeq, latestSeq);

  for (const update of updates) {
    merged = mergeWhiteboardScene(merged, normalizeWhiteboardScene(update.update));
  }

  await repository.createSnapshot(whiteboardId, merged, latestSeq);
  await repository.compactHistory(whiteboardId, latestSeq);
  await stateRepository.update(whiteboardId, { data: merged });
  return merged;
}

export async function buildDocSyncState(repository: DocCollabSyncRepository, docId: string): Promise<DocSyncState> {
  const snapshotRecord = (await repository.getLatestSnapshot(docId)) ?? null;
  const snapshot = snapshotRecord ? toUint8Array(snapshotRecord.snapshot) : null;
  const baseSeq = snapshotRecord?.seq ?? 0;
  const latestSeq = await repository.getLatestSeq(docId);

  if (latestSeq <= baseSeq) {
    return { snapshot, updates: [], latestSeq };
  }

  const updateCount = await repository.countUpdatesInRange(docId, baseSeq, latestSeq);
  if (updateCount <= MAX_COLLAB_SYNC_UPDATES) {
    const updates = await loadDocUpdatesInRange(repository, docId, baseSeq, latestSeq);
    return {
      snapshot,
      updates: updates.map((update) => toUint8Array(update.update)),
      latestSeq,
    };
  }

  const compactedSnapshot = await compactDocHistory(repository, docId, snapshotRecord, latestSeq);
  const trailingLatestSeq = await repository.getLatestSeq(docId);
  const trailingUpdates = trailingLatestSeq > latestSeq
    ? await loadDocUpdatesInRange(repository, docId, latestSeq, trailingLatestSeq)
    : [];

  return {
    snapshot: compactedSnapshot,
    updates: trailingUpdates.map((update) => toUint8Array(update.update)),
    latestSeq: trailingLatestSeq,
  };
}

export async function buildWhiteboardSyncState(
  repository: WhiteboardCollabSyncRepository,
  stateRepository: WhiteboardStateRepository,
  whiteboardId: string,
  fallbackSnapshot: unknown
): Promise<WhiteboardSyncState> {
  const snapshotRecord = (await repository.getLatestSnapshot(whiteboardId)) ?? null;
  const baseScene = normalizeWhiteboardScene(snapshotRecord?.snapshot ?? fallbackSnapshot);
  const baseSeq = snapshotRecord?.seq ?? 0;
  const latestSeq = await repository.getLatestSeq(whiteboardId);

  if (latestSeq <= baseSeq) {
    return {
      snapshot: baseScene,
      updates: [],
      latestSeq,
    };
  }

  const updateCount = await repository.countUpdatesInRange(whiteboardId, baseSeq, latestSeq);
  if (updateCount <= MAX_COLLAB_SYNC_UPDATES) {
    const updates = await loadWhiteboardUpdatesInRange(repository, whiteboardId, baseSeq, latestSeq);
    return {
      snapshot: baseScene,
      updates: updates.map((update) => normalizeWhiteboardScene(update.update)),
      latestSeq,
    };
  }

  const compactedSnapshot = await compactWhiteboardHistory(
    repository,
    stateRepository,
    whiteboardId,
    baseScene,
    baseSeq,
    latestSeq
  );
  const trailingLatestSeq = await repository.getLatestSeq(whiteboardId);
  const trailingUpdates = trailingLatestSeq > latestSeq
    ? await loadWhiteboardUpdatesInRange(repository, whiteboardId, latestSeq, trailingLatestSeq)
    : [];

  return {
    snapshot: compactedSnapshot,
    updates: trailingUpdates.map((update) => normalizeWhiteboardScene(update.update)),
    latestSeq: trailingLatestSeq,
  };
}
