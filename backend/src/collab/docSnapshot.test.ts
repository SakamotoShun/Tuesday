import { describe, expect, it } from 'bun:test';
import {
  isDocSnapshotContent,
  resolveDocSnapshotSeq,
  shouldPersistCanonicalDocContent,
} from './docSnapshot';

describe('docSnapshot helpers', () => {
  it('uses the provided snapshot seq when it is valid', () => {
    expect(resolveDocSnapshotSeq(12, 20)).toBe(12);
  });

  it('rejects legacy snapshots that do not include a seq', () => {
    expect(resolveDocSnapshotSeq(undefined, 20)).toBeNull();
  });

  it('rejects future or invalid snapshot seq values', () => {
    expect(resolveDocSnapshotSeq(21, 20)).toBeNull();
    expect(resolveDocSnapshotSeq(-1, 20)).toBeNull();
    expect(resolveDocSnapshotSeq(1.5, 20)).toBeNull();
  });

  it('recognizes valid block content arrays', () => {
    expect(isDocSnapshotContent([{ id: 'block-1', type: 'paragraph' }])).toBe(true);
    expect(isDocSnapshotContent([{ id: 'block-1' }, []])).toBe(false);
  });

  it('only persists canonical content when snapshot seq is current and content is valid', () => {
    const content = [{ id: 'block-1', type: 'paragraph' }];

    expect(shouldPersistCanonicalDocContent(5, 5, content)).toBe(true);
    expect(shouldPersistCanonicalDocContent(4, 5, content)).toBe(false);
    expect(shouldPersistCanonicalDocContent(5, 5, ['bad'])).toBe(false);
  });
});
