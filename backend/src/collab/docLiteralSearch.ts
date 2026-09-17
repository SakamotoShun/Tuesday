import * as Y from 'yjs';
import { materializeDocHistory } from './docHistory';

export interface InlineTextTarget { blockId: string; blockType: string; inlineIndex: number; eligible: boolean; text: string; runs: Array<{ from: number; to: number }> }

/** Join formatting runs within one XmlText only. Never flatten across containers. */
export function inspectInlineText(state: Uint8Array): InlineTextTarget[] {
  const doc = materializeDocHistory(state, []);
  try {
    const targets: InlineTextTarget[] = [];
    for (const block of doc.getXmlFragment('prosemirror').createTreeWalker(() => true)) {
      if (!(block instanceof Y.XmlElement) || block.nodeName !== 'blockContainer') continue;
      const body = block.get(0);
      if (!(body instanceof Y.XmlElement)) continue;
      let inlineIndex = 0;
      for (const text of body.createTreeWalker(() => true)) {
        if (!(text instanceof Y.XmlText)) continue;
        const target: InlineTextTarget = { blockId: block.getAttribute('id')!, blockType: body.nodeName, inlineIndex: inlineIndex++,
          eligible: body.nodeName === 'paragraph' && body.length === 1 && text.parent === body, text: '', runs: [] };
        for (const part of text.toDelta()) {
          if (typeof part.insert !== 'string') continue;
          target.runs.push({ from: target.text.length, to: target.text.length + part.insert.length });
          target.text += part.insert;
        }
        targets.push(target);
      }
    }
    return targets;
  } finally { doc.destroy(); }
}

export function selectLiteralSpans(state: Uint8Array, query: string | undefined, limit: number, offset: number) {
  const selections: Array<{ blockId: string; blockType: string; inlineIndex: number; from: number; to: number;
    excerpt: string; referenceEligible: boolean }> = [];
  let skipped = 0;
  for (const target of inspectInlineText(state)) {
    let cursor = 0, runIndex = 0;
    while (cursor < target.text.length) {
      const from = query === undefined ? target.runs[runIndex]!.from : target.text.indexOf(query, cursor);
      if (from < 0) break;
      const to = query === undefined ? target.runs[runIndex++]!.to : from + query.length;
      cursor = query === undefined ? to : from + 1; // Report overlapping literal matches individually.
      if (skipped++ < offset) continue;
      if (selections.length === limit) return { selections, hasMore: true };
      selections.push({ blockId: target.blockId, blockType: target.blockType, inlineIndex: target.inlineIndex,
        from, to, referenceEligible: target.eligible && target.runs.some(run => run.from <= from && to <= run.to),
        excerpt: target.text.slice(Math.max(0, from - 40), Math.min(target.text.length, to + 40)).slice(0, 600) });
    }
  }
  return { selections, hasMore: false };
}
