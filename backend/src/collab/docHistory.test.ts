import { describe, expect, it } from 'bun:test';
import * as Y from 'yjs';
import { blocksFromYDoc, yDocFromBlocks } from './docContent';
import {
  applyAndValidateDocUpdate,
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
