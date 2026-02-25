import { stripHtml } from './html.js';

export async function fetchPageExcerpt(url, maxLength = 300) {
  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!response.ok) return '';

    const html = await response.text();
    const paragraphs = html.match(/<p[^>]*>([^<]+(?:<[^/p][^>]*>[^<]*<\/[^p][^>]*>)*[^<]*)<\/p>/gi) || [];

    for (const p of paragraphs) {
      const text = stripHtml(p);
      if (text.length > 80 && !text.match(/^\d{4}|^by\s|^posted|^published|^share|^comment/i)) {
        return text.length > maxLength ? `${text.substring(0, maxLength).trim()}...` : text;
      }
    }

    return '';
  } catch {
    return '';
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

