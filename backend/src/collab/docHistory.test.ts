import { describe, expect, it } from 'bun:test';
import * as Y from 'yjs';
import {
  applyAndValidateDocUpdate,
  decodeStrictBase64,
  DocInvalidUpdateError,
  DocUpdateTooLargeError,
  materializeDocHistory,
  MAX_DOC_UPDATE_BYTES,
} from './docHistory';

function captureNextUpdate(doc: Y.Doc, mutate: () => void): Uint8Array {
  let captured: Uint8Array | null = null;
  const listener = (update: Uint8Array) => {
    captured = new Uint8Array(update);
  };
  doc.once('update', listener);
  mutate();
  if (!captured) {
    throw new Error('Expected Yjs update');
  }
  return captured;
}

describe('document Yjs history validation', () => {
  it('strictly decodes canonical base64', () => {
    expect(Array.from(decodeStrictBase64('AQID', 3))).toEqual([1, 2, 3]);
    expect(() => decodeStrictBase64('AQID\n', 10)).toThrow(DocInvalidUpdateError);
    expect(() => decodeStrictBase64('AQI', 10)).toThrow(DocInvalidUpdateError);
    expect(() => decodeStrictBase64('AQID', 2)).toThrow(DocUpdateTooLargeError);
  });

  it('rejects malformed and unresolved updates', () => {
    expect(() => materializeDocHistory(null, [new Uint8Array([1, 2, 3])]))
      .toThrow(DocInvalidUpdateError);

    const source = new Y.Doc();
    captureNextUpdate(source, () => source.getMap('content').set('first', true));
    const dependent = captureNextUpdate(source, () => source.getMap('content').set('second', true));
    expect(() => materializeDocHistory(null, [dependent])).toThrow('unresolved dependencies');

    const deleteSource = new Y.Doc();
    captureNextUpdate(deleteSource, () => deleteSource.getMap('content').set('deleted', true));
    const unresolvedDelete = captureNextUpdate(deleteSource, () => deleteSource.getMap('content').delete('deleted'));
    expect(() => materializeDocHistory(null, [unresolvedDelete])).toThrow('unresolved dependencies');
  });

  it('accepts a resolved document containing ordinary deletions', () => {
    const source = new Y.Doc();
    const baseline = captureNextUpdate(source, () => source.getMap('content').set('key', 'value'));
    const deletion = captureNextUpdate(source, () => source.getMap('content').delete('key'));

    const result = applyAndValidateDocUpdate(baseline, [], deletion);

    expect(result.doc.getMap('content').has('key')).toBe(false);
    expect(result.blocks).toEqual([]);
  });

  it('rejects decoded updates over one MiB before applying them', () => {
    expect(() => applyAndValidateDocUpdate(null, [], new Uint8Array(MAX_DOC_UPDATE_BYTES + 1)))
      .toThrow(DocUpdateTooLargeError);
  });
});
