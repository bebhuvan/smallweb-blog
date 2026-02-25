import { coerceToString } from './html.js';
import { normalizeGuid, normalizeUrl } from './urls.js';

export function generatePostId(blogId, key) {
  const str = `${blogId}-${key}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
}

export function getPostKey({ link, guid, title, baseUrl }) {
  const canonicalLink = normalizeUrl(link, baseUrl);
  if (canonicalLink) return canonicalLink;
  const normalizedGuid = normalizeGuid(guid, baseUrl);
  if (normalizedGuid) return normalizedGuid;
  return coerceToString(title).trim();
}

export function makeLookupKey(blogId, postKey) {
  return `${blogId}::${postKey}`;
}

export function getLookupKeyForPost(post) {
  const key = getPostKey({ link: post.link, title: post.title }) || post.id;
  return makeLookupKey(post.blogId, key);
}

