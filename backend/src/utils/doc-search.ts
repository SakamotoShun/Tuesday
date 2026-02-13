const TEXT_KEYS = new Set(['text', 'content', 'title', 'name', 'caption', 'value', 'url']);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function collectTextFromJson(value: unknown, chunks: string[]): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFromJson(item, chunks);
    }
    return;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [key, nested] of Object.entries(record)) {
      if (TEXT_KEYS.has(key) || Array.isArray(nested) || (nested !== null && typeof nested === 'object')) {
        collectTextFromJson(nested, chunks);
      }
    }
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function extractSearchTextFromDocContent(content: unknown): string {
  const chunks: string[] = [];
  collectTextFromJson(content, chunks);
  return normalizeWhitespace(chunks.join(' '));
}

export function extractSearchTextFromCollabXml(xml: string): string {
  const withoutTags = xml.replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(decodeXmlEntities(withoutTags));
}

export function mergeSearchText(...parts: Array<string | null | undefined>): string {
  return normalizeWhitespace(parts.filter(Boolean).join(' '));
}
