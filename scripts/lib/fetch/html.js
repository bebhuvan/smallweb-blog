export function coerceToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return String(value);
  } catch {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
}

export function decodeHtmlEntities(text) {
  const normalized = coerceToString(text);
  if (!normalized) return '';
  return normalized
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019');
}

export function stripHtml(html) {
  const normalized = coerceToString(html);
  if (!normalized) return '';
  const withoutTags = normalized.replace(/<[^>]*>/g, '');
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded.replace(/\s+/g, ' ').trim();
}

export function createExcerpt(content, maxLength = 300) {
  const stripped = stripHtml(content);
  if (stripped.length <= maxLength) return stripped;
  return `${stripped.substring(0, maxLength).trim()}...`;
}

