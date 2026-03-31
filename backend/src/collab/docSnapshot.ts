export const isDocSnapshotContent = (value: unknown): value is Array<Record<string, unknown>> =>
  Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item));

export const resolveDocSnapshotSeq = (value: unknown, latestSeq: number) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return null;
  }

  if (value < 0 || value > latestSeq) {
    return null;
  }

  return value;
};

export const shouldPersistCanonicalDocContent = (snapshotSeq: number, latestSeq: number, content: unknown) =>
  snapshotSeq === latestSeq && isDocSnapshotContent(content);
