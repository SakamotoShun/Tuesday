import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

export type DocSourceFormat = 'auto' | 'markdown' | 'html' | 'text';

export type DocBlock = Record<string, unknown>;

type HtmlChildNode = DefaultTreeAdapterTypes.ChildNode;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlTextNode = DefaultTreeAdapterTypes.TextNode;

const EMPTY_BLOCK_PROPS = {
  textColor: 'default',
  backgroundColor: 'default',
  textAlignment: 'left',
};

const DANGEROUS_HTML_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript']);
const BLOCK_HTML_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'details', 'table', 'thead', 'tbody', 'tr', 'ul', 'ol']);

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

function isHtmlTextNode(node: HtmlChildNode): node is HtmlTextNode {
  return node.nodeName === '#text';
}

function isHtmlIgnoredNode(node: HtmlChildNode): node is DefaultTreeAdapterTypes.CommentNode | DefaultTreeAdapterTypes.DocumentType {
  return node.nodeName === '#comment' || node.nodeName === '#documentType';
}

function isHtmlElementNode(node: HtmlChildNode): node is HtmlElement {
  return !isHtmlTextNode(node) && !isHtmlIgnoredNode(node);
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

function getElementAttribute(node: HtmlElement, name: string): string | undefined {
  return node.attrs.find((attr) => attr.name === name)?.value;
}

function getHtmlTextContent(node: HtmlChildNode): string {
  if (isHtmlTextNode(node)) {
    return node.value;
  }

  if (isHtmlIgnoredNode(node)) {
    return '';
  }

  if (!isHtmlElementNode(node) || DANGEROUS_HTML_TAGS.has(node.tagName)) {
    return '';
  }

  return node.childNodes.map(getHtmlTextContent).join('');
}

function renderHtmlNodes(nodes: HtmlChildNode[]): string {
  return nodes.map(renderHtmlNode).join('');
}

function renderHtmlNode(node: HtmlChildNode): string {
  if (isHtmlTextNode(node)) {
    return node.value;
  }

  if (isHtmlIgnoredNode(node)) {
    return '';
  }

  if (!isHtmlElementNode(node) || DANGEROUS_HTML_TAGS.has(node.tagName)) {
    return '';
  }

  if (node.tagName === 'br') {
    return '\n';
  }

  if (node.tagName === 'hr') {
    return '\n---\n';
  }

  if (/^h[1-6]$/.test(node.tagName)) {
    const level = Number(node.tagName.slice(1));
    return `\n${'#'.repeat(level)} ${renderHtmlNodes(node.childNodes)}\n`;
  }

  if (node.tagName === 'summary') {
    return `\n### ${renderHtmlNodes(node.childNodes)}\n`;
  }

  if (node.tagName === 'li') {
    const marker = node.parentNode && 'tagName' in node.parentNode && node.parentNode.tagName === 'ol' ? '1. ' : '- ';
    return `\n${marker}${renderHtmlNodes(node.childNodes)}`;
  }

  if (node.tagName === 'pre') {
    const code = node.childNodes.map(getHtmlTextContent).join('').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
    return code ? `\n\`\`\`\n${code}\n\`\`\`\n` : '';
  }

  if (node.tagName === 'img') {
    const src = getElementAttribute(node, 'src');
    if (!src) {
      return '';
    }

    const alt = getElementAttribute(node, 'alt') ?? '';
    return `\n![${alt}](${src})\n`;
  }

  if (node.tagName === 'a') {
    const text = renderHtmlNodes(node.childNodes);
    const href = getElementAttribute(node, 'href');
    if (!href) {
      return text;
    }

    return `${text || href} (${href})`;
  }

  if (node.tagName === 'td' || node.tagName === 'th') {
    return `${renderHtmlNodes(node.childNodes)} | `;
  }

  if (BLOCK_HTML_TAGS.has(node.tagName)) {
    return `\n${renderHtmlNodes(node.childNodes)}\n`;
  }

  return renderHtmlNodes(node.childNodes);
}

function normalizeMarkdownish(value: string): string {
  const lines = value.split('\n');
  let inCodeBlock = false;

  const normalized = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      return line.trim();
    }

    if (inCodeBlock) {
      return line.replace(/\r/g, '');
    }

    return line.replace(/[ \t\f\v]+/g, ' ').trim();
  }).join('\n');

  return normalized.replace(/\n{3,}/g, '\n\n').trim();
}

function htmlToMarkdownish(html: string): string {
  const fragment = parseFragment(html);
  return normalizeMarkdownish(renderHtmlNodes(fragment.childNodes));
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
    : trimmed;
  return parseMarkdownBlocks(markdown);
}
