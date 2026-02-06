import Parser from 'rss-parser';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  openDb,
  upsertBlogs,
  loadPosts,
  hasFetchLogs,
  upsertPosts,
  insertFetchLogs,
} from './lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseEnvInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Cloudflare Pages proxy URL for Substack feeds (bypasses rate limiting)
const PROXY_URL = process.env.PROXY_URL || 'https://smallweb-rss.pages.dev/api/fetch-rss';

const FEED_TIMEOUT_MS = parseEnvInt(process.env.FEED_TIMEOUT_MS, 30000);
const DEFAULT_MAX_POSTS_PER_BLOG = parseEnvInt(process.env.MAX_POSTS_PER_BLOG, 25);
const MAX_FUTURE_DAYS = parseEnvInt(process.env.MAX_FUTURE_DAYS, 2);
const RECENT_PRIMARY_DAYS = parseEnvInt(process.env.RECENT_PRIMARY_DAYS, 7);
const INFERRED_DATE_MAX_DIFF_DAYS = parseEnvInt(process.env.INFERRED_DATE_MAX_DIFF_DAYS, 30);

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});

// Check if a feed URL is from Substack
function isSubstackFeed(url) {
  return url.includes('substack.com');
}

// Sleep utility for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch RSS content through the Cloudflare proxy with retry logic
async function fetchViaProxy(feedUrl, retries = 3, timeoutMs = FEED_TIMEOUT_MS) {
  const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(feedUrl)}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (response.ok) {
        return await response.text();
      }

      // If rate limited (403), wait and retry
      if (response.status === 403 && attempt < retries) {
        const backoffMs = attempt * 5000; // 5s, 10s, 15s
        console.log(`    → Rate limited, waiting ${backoffMs/1000}s before retry ${attempt + 1}/${retries}...`);
        await sleep(backoffMs);
        continue;
      }

      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Proxy returned ${response.status}: ${errorData.error || response.statusText}`);
    } catch (error) {
      if (attempt === retries) throw error;
      if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
        console.log(`    → Timeout, retrying ${attempt + 1}/${retries}...`);
        await sleep(2000);
      } else {
        throw error;
      }
    }
  }
}

// Fetch page and extract first meaningful paragraph
async function fetchPageExcerpt(url, maxLength = 300) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return '';

    const html = await response.text();

    // Try to find article content - look for common content selectors
    // Extract text from <p> tags, skip very short ones (likely navigation)
    const paragraphs = html.match(/<p[^>]*>([^<]+(?:<[^/p][^>]*>[^<]*<\/[^p][^>]*>)*[^<]*)<\/p>/gi) || [];

    for (const p of paragraphs) {
      const text = stripHtml(p);
      // Skip short paragraphs, timestamps, bylines, etc.
      if (text.length > 80 && !text.match(/^\d{4}|^by\s|^posted|^published|^share|^comment/i)) {
        return text.length > maxLength ? text.substring(0, maxLength).trim() + '...' : text;
      }
    }

    return '';
  } catch (error) {
    // Silently fail - we'll just have no excerpt
    return '';
  }
}

const BLOGS_PATH = join(__dirname, '../data/blogs.json');
const CACHE_PATH = join(__dirname, '../data/cache/posts.json');
const STATUS_PATH = join(__dirname, '../data/cache/status.json');

const FEED_CONCURRENCY = parseEnvInt(process.env.FEED_CONCURRENCY, 8);
const EXCERPT_CONCURRENCY = parseEnvInt(process.env.EXCERPT_CONCURRENCY, 4);

// Substack Rate Limiting Workaround
// ---------------------------------
// Substack blocks RSS requests from GitHub Actions IPs (returns 403).
// Solution: Route Substack feeds through a Cloudflare Pages proxy
// (Pages IPs are not blocked by Substack, unlike Workers IPs).
//
// Strategies used:
// 1. Cloudflare proxy with browser User-Agent (avoids bot detection)
// 2. Sequential fetching for Substack feeds with 30s delays
// 3. Parallel fetching for non-Substack feeds (faster)
// 4. Set PROXY_URL env var to override the proxy endpoint if needed
// 5. Use "proxy": true in blogs.json for custom-domain Substack feeds

function coerceToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return String(value);
  } catch (error) {
    try {
      return JSON.stringify(value);
    } catch (innerError) {
      return '';
    }
  }
}

function decodeHtmlEntities(text) {
  const normalized = coerceToString(text);
  if (!normalized) return '';
  return normalized
    // Numeric entities (decimal)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    // Numeric entities (hex)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Named entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019');
}

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

function normalizeUrl(rawUrl, baseUrl) {
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

function normalizeGuid(rawGuid, baseUrl) {
  if (!rawGuid) return '';
  const guid = coerceToString(rawGuid).trim();
  if (guid.startsWith('http://') || guid.startsWith('https://')) {
    return normalizeUrl(guid, baseUrl);
  }
  return guid;
}

function stripHtml(html) {
  const normalized = coerceToString(html);
  if (!normalized) return '';
  const withoutTags = normalized.replace(/<[^>]*>/g, '');
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded.replace(/\s+/g, ' ').trim();
}

function createExcerpt(content, maxLength = 300) {
  const stripped = stripHtml(content);
  if (stripped.length <= maxLength) return stripped;
  return stripped.substring(0, maxLength).trim() + '...';
}

function normalizeDate(value) {
  if (!value) return null;
  const dateValue =
    typeof value === 'string' || typeof value === 'number'
      ? value
      : coerceToString(value);
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function inferDateFromText(text) {
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

function shouldInferDateFromLink(blog, link, guid) {
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

function isFutureDate(dateIso, nowMs) {
  if (!dateIso) return false;
  const dateMs = new Date(dateIso).getTime();
  if (Number.isNaN(dateMs)) return false;
  return dateMs - nowMs > MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
}

function shouldPreferInferredDate(primaryIso, inferredIso, nowMs) {
  if (!primaryIso || !inferredIso) return false;
  const primaryMs = new Date(primaryIso).getTime();
  const inferredMs = new Date(inferredIso).getTime();
  if (Number.isNaN(primaryMs) || Number.isNaN(inferredMs)) return false;
  if (inferredMs >= primaryMs) return false;
  const diffDays = Math.abs(primaryMs - inferredMs) / (1000 * 60 * 60 * 24);
  const primaryAgeDays = Math.abs(nowMs - primaryMs) / (1000 * 60 * 60 * 24);
  return diffDays >= INFERRED_DATE_MAX_DIFF_DAYS && primaryAgeDays <= RECENT_PRIMARY_DAYS;
}

function resolvePostDate(item, feed, blog, index, existingDate, nowMs) {
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

  const primaryValid = normalizedPrimary && !isFutureDate(normalizedPrimary, nowMs);
  const inferredValid = normalizedInferred && !isFutureDate(normalizedInferred, nowMs);
  const existingValid = existing && !isFutureDate(existing, nowMs);

  if (primaryValid && inferredValid && shouldPreferInferredDate(normalizedPrimary, normalizedInferred, nowMs)) {
    return normalizedInferred;
  }

  if (primaryValid) return normalizedPrimary;
  if (inferredValid) return normalizedInferred;
  if (existingValid) return existing;

  if (blog.allowMissingDates) {
    const fallback = normalizeDate(feed.lastBuildDate || feed.pubDate || feed.updated);
    const fallbackBase = fallback && !isFutureDate(fallback, nowMs) ? fallback : new Date(nowMs).toISOString();
    return offsetDate(fallbackBase, index);
  }

  return null;
}

function generatePostId(blogId, key) {
  const str = `${blogId}-${key}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function getPostKey({ link, guid, title, baseUrl }) {
  const canonicalLink = normalizeUrl(link, baseUrl);
  if (canonicalLink) return canonicalLink;
  const normalizedGuid = normalizeGuid(guid, baseUrl);
  if (normalizedGuid) return normalizedGuid;
  return coerceToString(title).trim();
}

function makeLookupKey(blogId, postKey) {
  return `${blogId}::${postKey}`;
}

function getLookupKeyForPost(post) {
  const key = getPostKey({ link: post.link, title: post.title }) || post.id;
  return makeLookupKey(post.blogId, key);
}

async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

function getMaxPostsForBlog(blog) {
  const override = Number.parseInt(blog.maxPosts, 10);
  if (Number.isFinite(override) && override > 0) return override;
  return DEFAULT_MAX_POSTS_PER_BLOG;
}

function shouldRetryViaProxy(error) {
  const status = error?.statusCode || error?.status;
  if (status && [401, 403, 408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = String(error?.message || '');
  return /status code 403|status code 401|status code 429|timed out|timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND/i.test(msg);
}

async function parseFeed(blog, useProxy) {
  if (useProxy) {
    const rssContent = await fetchViaProxy(blog.feed);
    return parser.parseString(rssContent);
  }
  return parser.parseURL(blog.feed);
}

async function fetchFeed(blog, useProxy = false, existingPostsByKey = new Map()) {
  const isSubstack = isSubstackFeed(blog.feed);
  const forceProxy = blog.proxy === true;
  const shouldUseProxy = useProxy || isSubstack || forceProxy;

  console.log(`Fetching: ${blog.name} (${blog.feed})${shouldUseProxy ? ' [via proxy]' : ''}`);
  const startTime = Date.now();
  const nowMs = Date.now();

  try {
    let feed;
    try {
      feed = await parseFeed(blog, shouldUseProxy);
    } catch (error) {
      if (!shouldUseProxy && shouldRetryViaProxy(error)) {
        console.log('    → Retrying via proxy after fetch error...');
        feed = await parseFeed(blog, true);
      } else {
        throw error;
      }
    }

    const maxPosts = getMaxPostsForBlog(blog);
    const items = feed.items.slice(0, maxPosts);
    const postsRaw = await mapWithLimit(
      items,
      EXCERPT_CONCURRENCY,
      async (item, index) => {
        try {
        let link = coerceToString(item.link || item.guid || blog.url);

        // URL Normalization for Paul Graham
        if (blog.id === 'paulgraham' && link.includes('turbifycdn.com')) {
          // Replace CDN links with something cleaner if possible
          // Strip query params which are often added by the CDN
          link = link.split('?')[0];
        }

        const canonicalLink = normalizeUrl(link, blog.url);
        const itemTitle = coerceToString(item.title);
        const postKey = getPostKey({
          link: canonicalLink || link,
          guid: coerceToString(item.guid),
          title: itemTitle || '',
          baseUrl: blog.url,
        }) || `${blog.id}-item-${index}`;
        const lookupKey = makeLookupKey(blog.id, postKey);
        const existingPost = existingPostsByKey.get(lookupKey);

        // Try to get excerpt from RSS first
        let excerpt = createExcerpt(coerceToString(item.contentSnippet || item.content || item.summary || ''));

        // If no excerpt from RSS, try fetching the page directly
        if (!excerpt && link) {
          console.log(`    → Fetching page for excerpt: ${itemTitle.substring(0, 40)}...`);
          excerpt = await fetchPageExcerpt(link);
        }

        if (!excerpt && existingPost?.excerpt) {
          excerpt = existingPost.excerpt;
        }

        const resolvedLink = canonicalLink || link;
        const postId = existingPost?.id || generatePostId(blog.id, postKey);
        const rawTitle = itemTitle || coerceToString(existingPost?.title) || 'Untitled';
        const title = decodeHtmlEntities(rawTitle) || 'Untitled';

        // Skip posts without proper dates unless explicitly allowed
        const postDate = resolvePostDate(item, feed, blog, index, existingPost?.date, nowMs);
        if (!postDate) {
          console.log(`    → Skipping "${itemTitle.substring(0, 40)}..." (no date)`);
          return null;
        }

        return {
          id: postId,
          blogId: blog.id,
          title,
          link: resolvedLink,
          date: postDate,
          excerpt,
        };
        } catch (itemError) {
          console.log(`    → Skipping item ${index} (${coerceToString(item.title).substring(0, 40) || 'untitled'}): ${itemError.message}`);
          return null;
        }
      }
    );

    // Filter out posts that were skipped (no date)
    const posts = postsRaw.filter(p => p !== null);

    const latency = Date.now() - startTime;
    console.log(`  ✓ Found ${posts.length} posts`);

    return {
      posts,
      status: {
        blogId: blog.id,
        status: 'ok',
        postCount: posts.length,
        lastFetched: new Date().toISOString(),
        latencyMs: latency,
        error: null,
      }
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(`  ✗ Error fetching ${blog.name}: ${error.message}`);

    return {
      posts: [],
      status: {
        blogId: blog.id,
        status: 'error',
        postCount: 0,
        lastFetched: new Date().toISOString(),
        latencyMs: latency,
        error: error.message,
      }
    };
  }
}

async function main() {
  console.log('=== The Small Web Feed Fetcher ===\n');

  const blogsData = JSON.parse(readFileSync(BLOGS_PATH, 'utf-8'));
  const blogs = blogsData.blogs;

  const db = openDb();
  upsertBlogs(db, blogs);

  // Load existing posts early for stable date fallbacks
  let existingPosts = loadPosts(db);
  let existingCacheLastUpdated = '';
  try {
    const existing = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
    existingCacheLastUpdated = existing.lastUpdated || '';
    const seedPosts = existing.posts || [];
    if (existingPosts.length === 0 && seedPosts.length > 0) {
      upsertPosts(db, seedPosts, existing.lastUpdated || new Date().toISOString());
      existingPosts = seedPosts;
    }
  } catch {
    // No existing cache, start fresh
  }

  if (!hasFetchLogs(db)) {
    try {
      const statusSeed = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));
      const seedLogs = statusSeed.feeds || [];
      if (seedLogs.length > 0) {
        insertFetchLogs(db, seedLogs);
      }
    } catch {
      // No status cache, skip
    }
  }
  const existingPostsByKey = new Map(
    existingPosts.map((post) => [
      makeLookupKey(post.blogId, getPostKey({ link: post.link, title: post.title })),
      post,
    ])
  );

  // Separate Substack feeds from others
  const substackBlogs = blogs.filter(b => isSubstackFeed(b.feed) || b.proxy === true);
  const otherBlogs = blogs.filter(b => !isSubstackFeed(b.feed) && b.proxy !== true);

  console.log(`Found ${blogs.length} blogs to fetch (${substackBlogs.length} Substack, ${otherBlogs.length} others)\n`);

  // Fetch non-Substack feeds in parallel (they don't rate limit)
  console.log('--- Fetching non-Substack feeds in parallel ---\n');
  const otherResults = await mapWithLimit(otherBlogs, FEED_CONCURRENCY, (blog) => fetchFeed(blog, false, existingPostsByKey));

  // Fetch Substack feeds sequentially with delays (to avoid rate limiting)
  console.log('\n--- Fetching Substack feeds sequentially via proxy ---\n');
  const substackResults = [];
  for (let i = 0; i < substackBlogs.length; i++) {
    const blog = substackBlogs[i];
    const result = await fetchFeed(blog, true, existingPostsByKey);
    substackResults.push(result);

    // Add delay between Substack feeds (30 seconds) to avoid rate limiting
    if (i < substackBlogs.length - 1) {
      console.log('    → Waiting 30s before next Substack feed...');
      await sleep(30000);
    }
  }

  const results = [...otherResults, ...substackResults];

  const freshPosts = results
    .flatMap(r => r.posts)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const seenLookupKeys = new Set();
  const allPosts = [];

  // Fresh posts take priority (they may have updated excerpts, etc.)
  for (const post of freshPosts) {
    const lookupKey = getLookupKeyForPost(post);
    if (!seenLookupKeys.has(lookupKey)) {
      seenLookupKeys.add(lookupKey);
      allPosts.push(post);
    }
  }
  for (const post of existingPosts) {
    const lookupKey = getLookupKeyForPost(post);
    if (!seenLookupKeys.has(lookupKey)) {
      seenLookupKeys.add(lookupKey);
      allPosts.push(post);
    }
  }

  allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const allStatuses = results.map(r => r.status);

  const nowIso = new Date().toISOString();

  upsertPosts(db, allPosts, nowIso);
  insertFetchLogs(db, allStatuses);

  const healthyCount = allStatuses.filter(s => s.status === 'ok').length;
  const cacheLastUpdated = healthyCount === 0 && existingCacheLastUpdated
    ? existingCacheLastUpdated
    : nowIso;
  const cachePosts = allPosts.length > 0 ? allPosts : existingPosts;

  const cache = {
    lastUpdated: cacheLastUpdated,
    posts: cachePosts,
  };

  const statusData = {
    lastUpdated: nowIso,
    feeds: allStatuses,
    summary: {
      total: allStatuses.length,
      healthy: healthyCount,
      errors: allStatuses.filter(s => s.status === 'error').length,
    }
  };

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  writeFileSync(STATUS_PATH, JSON.stringify(statusData, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`Total posts fetched: ${allPosts.length}`);
  console.log(`Feeds healthy: ${statusData.summary.healthy}/${statusData.summary.total}`);
  console.log(`Cache updated: ${cache.lastUpdated}`);

  db.close();
}

main().catch(console.error);
