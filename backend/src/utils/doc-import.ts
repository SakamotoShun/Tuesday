export type DocSourceFormat = 'auto' | 'markdown' | 'html' | 'text';

export type DocBlock = Record<string, unknown>;

const EMPTY_BLOCK_PROPS = {
  textColor: 'default',
  backgroundColor: 'default',
  textAlignment: 'left',
};

function inlineText(text: string): Array<Record<string, unknown>> {
  return text ? [{ type: 'text', text, styles: {} }] : [];
}

function block(type: string, text: string, props: Record<string, unknown> = {}): DocBlock {
  return {
    type,
    props: { ...EMPTY_BLOCK_PROPS, ...props },
    content: inlineText(text),
    children: [],
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => alt ? `${alt} (${url})` : url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

function htmlToMarkdownish(html: string): string {
  let output = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*hr\s*\/?\s*>/gi, '\n---\n')
    .replace(/<\s*h([1-6])[^>]*>([\s\S]*?)<\s*\/\s*h\1\s*>/gi, (_match, level, text) => `\n${'#'.repeat(Number(level))} ${text}\n`)
    .replace(/<\s*summary[^>]*>([\s\S]*?)<\s*\/\s*summary\s*>/gi, '\n### $1\n')
    .replace(/<\s*li[^>]*>([\s\S]*?)<\s*\/\s*li\s*>/gi, '\n- $1')
    .replace(/<\s*pre[^>]*>\s*<\s*code[^>]*>([\s\S]*?)<\s*\/\s*code\s*>\s*<\s*\/\s*pre\s*>/gi, '\n```\n$1\n```\n')
    .replace(/<\s*img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*>/gi, '\n![$1]($2)\n')
    .replace(/<\s*img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '\n![$2]($1)\n')
    .replace(/<\s*img[^>]*src=["']([^"']*)["'][^>]*>/gi, '\n![]($1)\n')
    .replace(/<\s*a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi, '$2 ($1)')
    .replace(/<\s*\/?\s*(p|div|section|article|header|footer|blockquote|details|table|thead|tbody|tr)[^>]*>/gi, '\n')
    .replace(/<\s*\/?\s*(td|th)[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '');

  output = decodeHtmlEntities(output)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n');

  return output.replace(/\n{3,}/g, '\n\n').trim();
}

function detectFormat(source: string, format: DocSourceFormat = 'auto'): Exclude<DocSourceFormat, 'auto'> {
  if (format !== 'auto') {
    return format;
  }

  if (/<\/?[a-z][\s\S]*>/i.test(source)) {
    return 'html';
  }

  if (/^\s{0,3}#{1,6}\s+/m.test(source) || /^\s*```/m.test(source) || /^\s*[-*+]\s+/m.test(source) || /^\s*\d+\.\s+/m.test(source)) {
    return 'markdown';
  }

  return 'text';
}

function parseMarkdownBlocks(markdown: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const paragraphLines: string[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let inCode = false;
  let codeLanguage = 'text';
  let codeLines: string[] = [];

  const flushParagraph = () => {
    const text = stripInlineMarkdown(paragraphLines.join(' ').replace(/\s+/g, ' ').trim());
    paragraphLines.length = 0;
    if (text) {
      blocks.push(block('paragraph', text));
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const codeFence = line.match(/^\s*```\s*([\w-]+)?\s*$/);
    if (codeFence) {
      if (inCode) {
        blocks.push(block('codeBlock', codeLines.join('\n'), { language: codeLanguage || 'text' }));
        codeLines = [];
        codeLanguage = 'text';
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
        codeLanguage = codeFence[1] || 'text';
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (line.trim() === '' || line.trim() === '---') {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push(block('heading', stripInlineMarkdown(heading[2]), {
        level: Math.min(3, heading[1].length),
        isToggleable: false,
      }));
      continue;
    }

    const taskItem = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskItem) {
      flushParagraph();
      blocks.push(block('checkListItem', stripInlineMarkdown(taskItem[2]), { checked: taskItem[1].toLowerCase() === 'x' }));
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      blocks.push(block('bulletListItem', stripInlineMarkdown(bullet[1])));
      continue;
    }

    const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      blocks.push(block('numberedListItem', stripInlineMarkdown(numbered[1])));
      continue;
    }

    const quote = line.match(/^\s*>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      blocks.push(block('paragraph', stripInlineMarkdown(quote[1])));
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph();
      if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)) {
        blocks.push(block('paragraph', line.replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cell.trim()).join(' | ')));
      }
      continue;
    }

    paragraphLines.push(line.trim());
  }

  if (inCode) {
    blocks.push(block('codeBlock', codeLines.join('\n'), { language: codeLanguage || 'text' }));
  }
  flushParagraph();

  return blocks;
}

function parseTextBlocks(text: string): DocBlock[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((part) => block('paragraph', part));
}

export function convertDocSourceToBlocks(source: string, format: DocSourceFormat = 'auto'): DocBlock[] {
  if (typeof source !== 'string') {
    throw new Error('Doc source must be a string');
  }

  const trimmed = source.trim();
  if (!trimmed) {
    return [];
  }

  const resolvedFormat = detectFormat(trimmed, format);
  if (resolvedFormat === 'text') {
    return parseTextBlocks(trimmed);
  }

  const markdown = resolvedFormat === 'html'
    ? htmlToMarkdownish(trimmed)
    : htmlToMarkdownish(trimmed);
  return parseMarkdownBlocks(markdown);
}
