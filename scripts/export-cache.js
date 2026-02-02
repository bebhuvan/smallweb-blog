import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { openDb } from './lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = join(__dirname, '../data/cache');
const CACHE_PATH = join(CACHE_DIR, 'posts.json');
const STATUS_PATH = join(CACHE_DIR, 'status.json');

function getLatestLogs(db) {
  return db.prepare(`
    SELECT f.blog_id as blogId,
           f.status as status,
           f.post_count as postCount,
           f.latency_ms as latencyMs,
           f.error as error,
           f.fetched_at as lastFetched
    FROM fetch_log f
    JOIN (
      SELECT blog_id, MAX(id) as max_id
      FROM fetch_log
      GROUP BY blog_id
    ) latest
      ON latest.blog_id = f.blog_id AND latest.max_id = f.id
  `).all();
}

function getLastUpdated(logs) {
  const lastMs = logs.reduce((max, log) => {
    const ms = Date.parse(log.lastFetched || '');
    if (Number.isNaN(ms)) return max;
    return Math.max(max, ms);
  }, 0);
  return lastMs ? new Date(lastMs).toISOString() : new Date().toISOString();
}

function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  const db = openDb();
  const posts = db.prepare(`
    SELECT id, blog_id as blogId, title, link, date, excerpt
    FROM posts
    ORDER BY date DESC
  `).all().map((row) => ({ ...row, excerpt: row.excerpt || '' }));

  const cache = {
    lastUpdated: new Date().toISOString(),
    posts,
  };

  const logs = getLatestLogs(db);
  const statusData = {
    lastUpdated: getLastUpdated(logs),
    feeds: logs,
    summary: {
      total: logs.length,
      healthy: logs.filter((l) => l.status === 'ok').length,
      errors: logs.filter((l) => l.status === 'error').length,
    },
  };

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  writeFileSync(STATUS_PATH, JSON.stringify(statusData, null, 2));

  db.close();
  console.log(`Exported ${posts.length} posts to cache JSON.`);
}

main();
