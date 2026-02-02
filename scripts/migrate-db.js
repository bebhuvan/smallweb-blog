import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  openDb,
  upsertBlogs,
  upsertPosts,
  insertFetchLogs,
  countPosts,
  hasFetchLogs,
} from './lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BLOGS_PATH = join(__dirname, '../data/blogs.json');
const CACHE_PATH = join(__dirname, '../data/cache/posts.json');
const STATUS_PATH = join(__dirname, '../data/cache/status.json');

const force = process.argv.includes('--force');

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function main() {
  const blogsData = loadJson(BLOGS_PATH);
  if (!blogsData?.blogs?.length) {
    console.error('No blogs found in data/blogs.json');
    process.exit(1);
  }

  const db = openDb();
  upsertBlogs(db, blogsData.blogs);

  const postCount = countPosts(db);
  if (postCount === 0 || force) {
    const cache = loadJson(CACHE_PATH);
    const posts = cache?.posts || [];
    if (posts.length > 0) {
      upsertPosts(db, posts, cache?.lastUpdated || new Date().toISOString());
      console.log(`Imported ${posts.length} posts into SQLite.`);
    } else {
      console.log('No posts.json cache found to import.');
    }
  } else {
    console.log('Posts table already populated. Use --force to re-import.');
  }

  const hasLogs = hasFetchLogs(db);
  if (!hasLogs || force) {
    const status = loadJson(STATUS_PATH);
    const feeds = status?.feeds || [];
    if (feeds.length > 0) {
      insertFetchLogs(db, feeds);
      console.log(`Imported ${feeds.length} fetch log rows.`);
    } else {
      console.log('No status.json cache found to import.');
    }
  } else {
    console.log('Fetch log already populated. Use --force to re-import.');
  }

  db.close();
}

main();
