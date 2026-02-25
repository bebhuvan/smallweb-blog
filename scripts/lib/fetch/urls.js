import { coerceToString } from './html.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_reader',
  'utm_source_platform',
  'utm_marketing_tactic',
  'utm_pubref',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'source',
  'sourceid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
]);

export function normalizeUrl(rawUrl, baseUrl) {
  if (!rawUrl) return '';
  try {
    const url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
        url.searchParams.delete(key);
      }
    }
    const query = url.searchParams.toString();
    url.search = query ? `?${query}` : '';
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return coerceToString(rawUrl).trim();
  }
}

export function normalizeGuid(rawGuid, baseUrl) {
  if (!rawGuid) return '';
  const guid = coerceToString(rawGuid).trim();
  if (guid.startsWith('http://') || guid.startsWith('https://')) {
    return normalizeUrl(guid, baseUrl);
  }
  return guid;
}

