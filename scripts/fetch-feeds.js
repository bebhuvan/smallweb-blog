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
import { loadFetchConfig, formatFetchConfig } from './lib/fetch-config.js';
import { sleep, mapWithLimit } from './lib/fetch/concurrency.js';
import { fetchPageExcerpt } from './lib/fetch/excerpt.js';
import { coerceToString, decodeHtmlEntities, createExcerpt } from './lib/fetch/html.js';
import { normalizeUrl } from './lib/fetch/urls.js';
import { generatePostId, getPostKey, makeLookupKey, getLookupKeyForPost } from './lib/fetch/dedupe.js';
import { createDateResolver } from './lib/fetch/dates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FETCH_CONFIG = loadFetchConfig(process.env);
const {
  PROXY_URL,
  FEED_TIMEOUT_MS,
  DEFAULT_MAX_POSTS_PER_BLOG,
  MAX_FUTURE_DAYS,
  RECENT_PRIMARY_DAYS,
  INFERRED_DATE_MAX_DIFF_DAYS,
  FEED_CONCURRENCY,
  SUBSTACK_BATCH_SIZE,
  SUBSTACK_BATCH_DELAY_MS,
  EXCERPT_CONCURRENCY,
  FETCH_PAGE_EXCERPTS,
  MAX_PAGE_EXCERPTS_PER_FEED,
} = FETCH_CONFIG;

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});

const { resolvePostDate } = createDateResolver({
  maxFutureDays: MAX_FUTURE_DAYS,
  recentPrimaryDays: RECENT_PRIMARY_DAYS,
  inferredDateMaxDiffDays: INFERRED_DATE_MAX_DIFF_DAYS,
});

// Check if a feed URL is from Substack
function isSubstackFeed(url) {
  return url.includes('substack.com');
}

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

const BLOGS_PATH = join(__dirname, '../data/blogs.json');
const CACHE_PATH = join(__dirname, '../data/cache/posts.json');
const STATUS_PATH = join(__dirname, '../data/cache/status.json');

// Substack Rate Limiting Workaround
// ---------------------------------
// Substack blocks RSS requests from GitHub Actions IPs (returns 403).
// Solution: Route Substack feeds through a Cloudflare Pages proxy
// (Pages IPs are not blocked by Substack, unlike Workers IPs).
//
// Strategies used:
// 1. Cloudflare proxy with browser User-Agent (avoids bot detection)
// 2. Sequential fetching for Substack feeds in small delayed batches
// 3. Parallel fetching for non-Substack feeds (faster)
// 4. Set PROXY_URL env var to override the proxy endpoint if needed
// 5. Use "proxy": true in blogs.json for custom-domain Substack feeds

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

        const existingExcerpt = coerceToString(existingPost?.excerpt).trim();

        // Try to get excerpt from RSS first
        let excerpt = createExcerpt(coerceToString(item.contentSnippet || item.content || item.summary || ''));

        // Prefer cached excerpts for existing posts to avoid re-fetching pages every run
        if (!excerpt && existingExcerpt) {
          excerpt = existingExcerpt;
        }

        // Only fetch page excerpts for a few new posts per feed (CI-safe default)
        if (!excerpt && !existingPost && FETCH_PAGE_EXCERPTS && link && index < MAX_PAGE_EXCERPTS_PER_FEED) {
          console.log(`    → Fetching page for excerpt: ${itemTitle.substring(0, 40)}...`);
          excerpt = await fetchPageExcerpt(link);
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
  console.log(`Config: ${formatFetchConfig(FETCH_CONFIG)}`);
  if (FETCH_CONFIG.warnings.length > 0) {
    for (const warning of FETCH_CONFIG.warnings) {
      console.warn(`Config warning: ${warning}`);
    }
  }

  const blogsData = JSON.parse(readFileSync(BLOGS_PATH, 'utf-8'));
  const blogs = blogsData.blogs;

  let db;
  try {
    db = openDb();
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

    // Fetch Substack feeds in small parallel batches with delays between batches
    console.log(`\n--- Fetching Substack feeds in batches of ${SUBSTACK_BATCH_SIZE} via proxy ---\n`);
    const substackResults = [];
    for (let i = 0; i < substackBlogs.length; i += SUBSTACK_BATCH_SIZE) {
      const batch = substackBlogs.slice(i, i + SUBSTACK_BATCH_SIZE);
      const batchNum = Math.floor(i / SUBSTACK_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(substackBlogs.length / SUBSTACK_BATCH_SIZE);
      console.log(`  Batch ${batchNum}/${totalBatches} (${batch.map(b => b.name).join(', ')})`);

      const batchResults = await Promise.all(
        batch.map(blog => fetchFeed(blog, true, existingPostsByKey))
      );
      substackResults.push(...batchResults);

      // Add delay between batches to avoid rate limiting
      if (i + SUBSTACK_BATCH_SIZE < substackBlogs.length) {
        console.log(`    → Waiting ${SUBSTACK_BATCH_DELAY_MS / 1000}s before next batch...`);
        await sleep(SUBSTACK_BATCH_DELAY_MS);
      }
    }

    console.log('\n--- Persisting merged posts and status to SQLite/cache ---');
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

    console.log(`  → Upserting ${allPosts.length} posts`);
    upsertPosts(db, allPosts, nowIso);
    console.log(`  → Inserting ${allStatuses.length} fetch log rows`);
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

    console.log('  → Writing cache files');
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    writeFileSync(STATUS_PATH, JSON.stringify(statusData, null, 2));

    console.log(`\n=== Summary ===`);
    console.log(`Total posts fetched: ${allPosts.length}`);
    console.log(`Feeds healthy: ${statusData.summary.healthy}/${statusData.summary.total}`);
    console.log(`Cache updated: ${cache.lastUpdated}`);
  } finally {
    if (db) db.close();
  }
}

async function closeGlobalFetchDispatcher() {
  try {
    const { getGlobalDispatcher } = await import('undici');
    const dispatcher = getGlobalDispatcher?.();
    if (dispatcher?.close) {
      await dispatcher.close();
    }
  } catch {
    // Best-effort cleanup; ignore if unavailable.
  }
}

main()
  .then(async () => {
    await closeGlobalFetchDispatcher();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeGlobalFetchDispatcher();
    process.exit(1);
  });
