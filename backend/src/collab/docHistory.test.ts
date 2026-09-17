import { describe, expect, it } from 'bun:test';
import * as Y from 'yjs';
import { blocksFromYDoc, yDocFromBlocks } from './docContent';
import {
  applyAndValidateDocUpdate,
  applyResolvedDocUpdate,
  decodeStrictBase64,
  deriveValidatedDocBlocks,
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
  it('projects an empty baseline without repairing or replacing its history', () => {
    const doc = yDocFromBlocks([]);
    try {
      const before = Y.encodeStateAsUpdate(doc);
      expect(deriveValidatedDocBlocks(doc)).toEqual([]);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { doc.destroy(); }
  });

  it.each(['malformed', 'missing insertion', 'missing deletion'])('rejects %s dependencies when reusing a document', kind => {
    const source = new Y.Doc(), reused = new Y.Doc();
    try {
      source.getText('text').insert(0, 'source');
      const update = kind === 'malformed' ? new Uint8Array([1, 2, 3])
        : captureNextUpdate(source, () => {
          if (kind === 'missing insertion') source.getText('text').insert(6, ' later');
          else source.getText('text').delete(0, 6);
        });
      expect(() => applyResolvedDocUpdate(reused, update)).toThrow(DocInvalidUpdateError);
    } finally { source.destroy(); reused.destroy(); }
  });

  it('reuses a GC-enabled preimage with the same binary history and snapshot as fresh replay', () => {
    const source = new Y.Doc();
    source.getText('text').insert(0, 'before TARGET after');
    const baseline = Y.encodeStateAsUpdate(source);
    const update = captureNextUpdate(source, () => source.transact(() => {
      source.getText('text').delete(7, 6);
      source.getText('text').insert(7, 'replacement', { bold: true });
    }));
    const reused = materializeDocHistory(baseline, []);
    const fresh = materializeDocHistory(baseline, [update]);
    try {
      applyResolvedDocUpdate(reused, update);
      expect(reused.gc).toBe(true);
      expect(Y.encodeStateAsUpdate(reused)).toEqual(Y.encodeStateAsUpdate(fresh));
      expect(Y.equalSnapshots(Y.snapshot(reused), Y.snapshot(fresh))).toBe(true);
      expect(reused.getText('text').toDelta()).toEqual(fresh.getText('text').toDelta());
    } finally { source.destroy(); reused.destroy(); fresh.destroy(); }
  });

  it('rejects updates that the canonical projector would silently rewrite', () => {
    const source = yDocFromBlocks([{ id: 'paragraph', type: 'paragraph', props: {}, children: [], content: [] }]);
    try {
      const baseline = Y.encodeStateAsUpdate(source);
      const update = captureNextUpdate(source, () => {
        source.getXmlFragment('prosemirror').push([new Y.XmlElement('unsupported-node')]);
      });
      expect(() => applyAndValidateDocUpdate(baseline, [], update)).toThrow(DocInvalidUpdateError);
    } finally { source.destroy(); }
  });

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

  it.each(['insert table', 'edit cell', 'edit adjacent paragraph'])('accepts and replays a table document update: %s', (operation) => {
    const source = yDocFromBlocks([
      {
        id: 'table-1', type: 'table', props: {}, children: [],
        content: { type: 'tableContent', rows: [{ cells: ['Cell', 'Other'] }] },
      },
      {
        id: 'paragraph-1', type: 'paragraph', props: {}, children: [],
        content: [{ type: 'text', text: 'Beside', styles: {} }],
      },
    ]);
    const baseline = operation === 'insert table' ? null : Y.encodeStateAsUpdate(source);
    let update: Uint8Array;
    if (operation === 'insert table') {
      update = Y.encodeStateAsUpdate(source);
    } else {
      const texts = Array.from(source.getXmlFragment('prosemirror').createTreeWalker(
        (node) => node instanceof Y.XmlText,
      )) as Y.XmlText[];
      const text = texts[operation === 'edit cell' ? 0 : 2];
      update = captureNextUpdate(source, () => text.insert(text.length, ' edited'));
    }

    const result = applyAndValidateDocUpdate(baseline, [], update);
    expect(result.blocks).toMatchObject([
      {
        id: 'table-1',
        content: {
          columnWidths: [null, null],
          rows: [{ cells: [
            { content: [{ text: operation === 'edit cell' ? 'Cell edited' : 'Cell' }] },
            { content: [{ text: 'Other' }] },
          ] }],
        },
      },
      {
        id: 'paragraph-1',
        content: [{ text: operation === 'edit adjacent paragraph' ? 'Beside edited' : 'Beside' }],
      },
    ]);
    expect(deriveValidatedDocBlocks(result.doc)).toEqual(result.blocks);
    expect(blocksFromYDoc(materializeDocHistory(baseline, [update]))).toEqual(result.blocks);
    expect(blocksFromYDoc(materializeDocHistory(Y.encodeStateAsUpdate(result.doc), [])))
      .toEqual(result.blocks);
    expect(blocksFromYDoc(yDocFromBlocks(result.blocks))).toEqual(result.blocks);
  });
});
