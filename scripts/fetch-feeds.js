import Parser from 'rss-parser';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});

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
const MAX_POSTS_PER_BLOG = 10;

// NOTE: Substack Rate Limiting
// --------------------------
// Substack aggressively rate limits RSS feed requests. If adding Substack blogs,
// use a Cloudflare Pages Function as a proxy. See paper trails project for reference:
//   /home/bhuvanesh.r/AA/A main projects/paper trails/functions/api/fetch-rss.js
//   /home/bhuvanesh.r/AA/A main projects/paper trails/src/scripts/fetch-feeds-with-proxy.js
//
// Key strategies used:
// 1. Cloudflare proxy with browser User-Agent (avoids bot detection)
// 2. Sequential fetching (not parallel) for Substack feeds
// 3. 30 second delay between Substack feeds, 5s for normal feeds
// 4. Domain rate limiting: 1 min minimum between same-domain requests
// 5. Retry with exponential backoff (10s, 20s delays on failure)
//
// To implement: Deploy a CF Pages Function that proxies RSS requests,
// then set WORKER_URL env var to route Substack feeds through it.

function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
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

function stripHtml(html) {
  if (!html) return '';
  const withoutTags = html.replace(/<[^>]*>/g, '');
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded.replace(/\s+/g, ' ').trim();
}

function createExcerpt(content, maxLength = 300) {
  const stripped = stripHtml(content);
  if (stripped.length <= maxLength) return stripped;
  return stripped.substring(0, maxLength).trim() + '...';
}

function generatePostId(blogId, title, link) {
  const str = `${blogId}-${title}-${link}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function fetchFeed(blog) {
  console.log(`Fetching: ${blog.name} (${blog.feed})`);
  const startTime = Date.now();

  try {
    const feed = await parser.parseURL(blog.feed);
    const postsRaw = await Promise.all(
      feed.items.slice(0, MAX_POSTS_PER_BLOG).map(async (item) => {
        let link = item.link || blog.url;

        // URL Normalization for Paul Graham
        if (blog.id === 'paulgraham' && link.includes('turbifycdn.com')) {
          // Replace CDN links with something cleaner if possible
          // Strip query params which are often added by the CDN
          link = link.split('?')[0];
        }

        // Try to get excerpt from RSS first
        let excerpt = createExcerpt(item.contentSnippet || item.content || item.summary || '');

        // If no excerpt from RSS, try fetching the page directly
        if (!excerpt && link) {
          console.log(`    → Fetching page for excerpt: ${item.title?.substring(0, 40)}...`);
          excerpt = await fetchPageExcerpt(link);
        }

        // Skip posts without proper dates - they'll pollute the feed with old content
        const postDate = item.isoDate || item.pubDate;
        if (!postDate) {
          console.log(`    → Skipping "${item.title?.substring(0, 40)}..." (no date)`);
          return null;
        }

        return {
          id: generatePostId(blog.id, item.title || '', link),
          blogId: blog.id,
          title: decodeHtmlEntities(item.title || 'Untitled'),
          link: link,
          date: postDate,
          excerpt,
        };
      })
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

  console.log(`Found ${blogs.length} blogs to fetch\n`);

  const results = await Promise.all(blogs.map(fetchFeed));

  const allPosts = results
    .flatMap(r => r.posts)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const allStatuses = results.map(r => r.status);

  const cache = {
    lastUpdated: new Date().toISOString(),
    posts: allPosts,
  };

  const statusData = {
    lastUpdated: new Date().toISOString(),
    feeds: allStatuses,
    summary: {
      total: allStatuses.length,
      healthy: allStatuses.filter(s => s.status === 'ok').length,
      errors: allStatuses.filter(s => s.status === 'error').length,
    }
  };

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  writeFileSync(STATUS_PATH, JSON.stringify(statusData, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`Total posts fetched: ${allPosts.length}`);
  console.log(`Feeds healthy: ${statusData.summary.healthy}/${statusData.summary.total}`);
  console.log(`Cache updated: ${cache.lastUpdated}`);
}

main().catch(console.error);