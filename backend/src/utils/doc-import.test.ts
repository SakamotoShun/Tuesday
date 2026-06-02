import { describe, expect, it } from 'bun:test';
import { convertDocSourceToBlocks } from './doc-import';

describe('convertDocSourceToBlocks', () => {
  it('converts markdown headings, lists, and code fences', () => {
    const blocks = convertDocSourceToBlocks(`# Title

Intro **text**.

- One
- Two

\`\`\`ts
const value = 1;
\`\`\``, 'markdown');

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'bulletListItem',
      'bulletListItem',
      'codeBlock',
    ]);
    expect((blocks[0].props as any).level).toBe(1);
    expect((blocks[4].props as any).language).toBe('ts');
  });

  it('converts html into formatted blocks instead of raw tags', () => {
    const blocks = convertDocSourceToBlocks('<h1>Title</h1><p>Hello <strong>there</strong></p><ul><li>Item</li></ul>', 'html');

    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'bulletListItem']);
    expect(JSON.stringify(blocks)).not.toContain('<h1>');
  });

  it('strips script blocks with spaced closing tags', () => {
    const blocks = convertDocSourceToBlocks('<script>alert(1)</script ><p>Safe</p>', 'html');

    expect(blocks).toHaveLength(1);
    expect(JSON.stringify(blocks)).not.toContain('alert(1)');
    expect(JSON.stringify(blocks)).not.toContain('<script');
  });

  it('treats plain text paragraphs as paragraph blocks', () => {
    const blocks = convertDocSourceToBlocks('First paragraph\n\nSecond paragraph', 'text');

    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.type === 'paragraph')).toBe(true);
  });
});
