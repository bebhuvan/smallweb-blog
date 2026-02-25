import { coerceToString } from './html.js';

export function normalizeDate(value) {
  if (!value) return null;
  const dateValue =
    typeof value === 'string' || typeof value === 'number'
      ? value
      : coerceToString(value);
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function inferDateFromText(text) {
  const value = typeof text === 'string' ? text : '';
  if (!value) return null;
  const patterns = [
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/,
    /(\d{4})(\d{2})(\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) continue;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return null;
}

function normalizeHost(rawUrl) {
  try {
    const url = new URL(rawUrl);
    let host = url.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return '';
  }
}

function hostsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(`.${b}`)) return true;
  if (b.endsWith(`.${a}`)) return true;
  return false;
}

export function shouldInferDateFromLink(blog, link, guid) {
  if (blog?.ignoreLinkDateInference) return false;
  if (blog?.allowLinkDateInference) return true;
  const candidate = link || guid || '';
  const blogHost = normalizeHost(blog?.url || blog?.feed || '');
  const linkHost = normalizeHost(candidate);
  if (!blogHost || !linkHost) return false;
  return hostsMatch(blogHost, linkHost);
}

function offsetDate(dateIso, minutes) {
  const date = new Date(dateIso);
  date.setMinutes(date.getMinutes() - minutes);
  return date.toISOString();
}

function isFutureDate(dateIso, nowMs, maxFutureDays) {
  if (!dateIso) return false;
  const dateMs = new Date(dateIso).getTime();
  if (Number.isNaN(dateMs)) return false;
  return dateMs - nowMs > maxFutureDays * 24 * 60 * 60 * 1000;
}

function shouldPreferInferredDate(primaryIso, inferredIso, nowMs, opts) {
  if (!primaryIso || !inferredIso) return false;
  const primaryMs = new Date(primaryIso).getTime();
  const inferredMs = new Date(inferredIso).getTime();
  if (Number.isNaN(primaryMs) || Number.isNaN(inferredMs)) return false;
  if (inferredMs >= primaryMs) return false;
  const diffDays = Math.abs(primaryMs - inferredMs) / (1000 * 60 * 60 * 24);
  const primaryAgeDays = Math.abs(nowMs - primaryMs) / (1000 * 60 * 60 * 24);
  return diffDays >= opts.inferredDateMaxDiffDays && primaryAgeDays <= opts.recentPrimaryDays;
}

function resolvePostDateWithConfig(item, feed, blog, index, existingDate, nowMs, opts) {
  const primary =
    item.isoDate ||
    item.pubDate ||
    item.published ||
    item.updated ||
    item['dc:date'] ||
    item.date;
  const normalizedPrimary = normalizeDate(primary);
  const inferred = shouldInferDateFromLink(blog, item.link, item.guid)
    ? (inferDateFromText(item.link) || inferDateFromText(item.guid))
    : null;
  const normalizedInferred = normalizeDate(inferred);
  const existing = blog?.ignoreLinkDateInference ? null : normalizeDate(existingDate);

  const primaryValid = normalizedPrimary && !isFutureDate(normalizedPrimary, nowMs, opts.maxFutureDays);
  const inferredValid = normalizedInferred && !isFutureDate(normalizedInferred, nowMs, opts.maxFutureDays);
  const existingValid = existing && !isFutureDate(existing, nowMs, opts.maxFutureDays);

  if (primaryValid && inferredValid && shouldPreferInferredDate(normalizedPrimary, normalizedInferred, nowMs, opts)) {
    return normalizedInferred;
  }

  if (primaryValid) return normalizedPrimary;
  if (inferredValid) return normalizedInferred;
  if (existingValid) return existing;

  if (blog.allowMissingDates) {
    const fallback = normalizeDate(feed.lastBuildDate || feed.pubDate || feed.updated);
    const fallbackBase =
      fallback && !isFutureDate(fallback, nowMs, opts.maxFutureDays)
        ? fallback
        : new Date(nowMs).toISOString();
    return offsetDate(fallbackBase, index);
  }

  return null;
}

export function createDateResolver(options = {}) {
  const opts = {
    maxFutureDays: 2,
    recentPrimaryDays: 7,
    inferredDateMaxDiffDays: 30,
    ...options,
  };

  return {
    normalizeDate,
    inferDateFromText,
    shouldInferDateFromLink,
    resolvePostDate(item, feed, blog, index, existingDate, nowMs) {
      return resolvePostDateWithConfig(item, feed, blog, index, existingDate, nowMs, opts);
    },
  };
}

