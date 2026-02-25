import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { openDb, countPosts } from './lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BLOGS_PATH = join(__dirname, '../data/blogs.json');
const POSTS_CACHE_PATH = join(__dirname, '../data/cache/posts.json');
const STATUS_CACHE_PATH = join(__dirname, '../data/cache/status.json');

function fail(message) {
  console.error(`VERIFY FAIL: ${message}`);
  process.exitCode = 1;
}

function warn(message) {
  console.warn(`VERIFY WARN: ${message}`);
}

function hasFailures() {
  return Boolean(process.exitCode);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !value) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function main() {
  if (!existsSync(POSTS_CACHE_PATH)) {
    fail(`Missing posts cache: ${POSTS_CACHE_PATH}`);
    return;
  }
  if (!existsSync(STATUS_CACHE_PATH)) {
    fail(`Missing status cache: ${STATUS_CACHE_PATH}`);
    return;
  }

  const blogs = loadJson(BLOGS_PATH).blogs || [];
  const postsCache = loadJson(POSTS_CACHE_PATH);
  const statusCache = loadJson(STATUS_CACHE_PATH);

  const posts = Array.isArray(postsCache.posts) ? postsCache.posts : null;
  const feeds = Array.isArray(statusCache.feeds) ? statusCache.feeds : null;

  if (!posts) fail('posts.json missing `posts` array');
  if (!feeds) fail('status.json missing `feeds` array');
  if (!posts || !feeds) return;

  if (!isValidIsoDate(postsCache.lastUpdated)) fail('posts.json `lastUpdated` is missing/invalid');
  if (!isValidIsoDate(statusCache.lastUpdated)) fail('status.json `lastUpdated` is missing/invalid');

  if (posts.length === 0) fail('posts cache is empty');
  if (feeds.length === 0) fail('status feeds list is empty');

  const duplicateIds = new Set();
  const seenIds = new Set();
  for (const post of posts) {
    if (!post?.id) {
      fail('Found post without id');
      break;
    }
    if (seenIds.has(post.id)) duplicateIds.add(post.id);
    seenIds.add(post.id);
    if (!post.blogId) fail(`Post ${post.id} missing blogId`);
    if (!post.title) fail(`Post ${post.id} missing title`);
    if (!post.link) fail(`Post ${post.id} missing link`);
    if (!isValidIsoDate(post.date)) fail(`Post ${post.id} has invalid date: ${post.date}`);
  }
  if (duplicateIds.size > 0) fail(`Duplicate post ids detected (${duplicateIds.size})`);

  for (let i = 1; i < posts.length; i++) {
    const prev = Date.parse(posts[i - 1].date);
    const curr = Date.parse(posts[i].date);
    if (curr > prev) {
      fail(`Posts cache is not sorted desc by date at index ${i - 1}/${i}`);
      break;
    }
  }

  const feedBlogIds = new Set();
  for (const feed of feeds) {
    if (!feed?.blogId) {
      fail('Found feed status row without blogId');
      continue;
    }
    if (feedBlogIds.has(feed.blogId)) fail(`Duplicate feed status row for blogId=${feed.blogId}`);
    feedBlogIds.add(feed.blogId);
    if (!['ok', 'error'].includes(feed.status)) warn(`Unexpected feed status "${feed.status}" for ${feed.blogId}`);
    if (!isValidIsoDate(feed.lastFetched)) fail(`Feed ${feed.blogId} has invalid lastFetched`);
  }

  const summary = statusCache.summary || {};
  if (summary.total !== feeds.length) fail(`status.summary.total (${summary.total}) != feeds.length (${feeds.length})`);
  const healthy = feeds.filter((f) => f.status === 'ok').length;
  const errors = feeds.filter((f) => f.status === 'error').length;
  if (summary.healthy !== healthy) fail(`status.summary.healthy (${summary.healthy}) != computed (${healthy})`);
  if (summary.errors !== errors) fail(`status.summary.errors (${summary.errors}) != computed (${errors})`);

  if (blogs.length && feeds.length !== blogs.length) {
    warn(`Feed status count (${feeds.length}) != configured blogs count (${blogs.length})`);
  }

  const newestPostDate = posts[0]?.date;
  if (newestPostDate && postsCache.lastUpdated && Date.parse(postsCache.lastUpdated) + (1000 * 60 * 60) < Date.parse(newestPostDate)) {
    warn('posts.json lastUpdated is older than newest post date by >1h');
  }

  try {
    const db = openDb();
    const dbPostCount = countPosts(db);
    db.close();
    if (dbPostCount < posts.length) {
      warn(`SQLite posts count (${dbPostCount}) is less than cache posts count (${posts.length}); local DB may be stale`);
    }
    if (hasFailures()) return;
    console.log(`VERIFY OK: cache posts=${posts.length}, db posts=${dbPostCount}, feeds=${feeds.length}, healthy=${healthy}, errors=${errors}`);
  } catch (error) {
    warn(`SQLite verification skipped: ${error.message}`);
    if (hasFailures()) return;
    console.log(`VERIFY OK (cache-only): posts=${posts.length}, feeds=${feeds.length}, healthy=${healthy}, errors=${errors}`);
  }
}

main();

if (process.exitCode) {
  process.exit(process.exitCode);
}
