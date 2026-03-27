import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { openDb } from './lib/db.js';
import {
  buildPostsCache,
  buildStatusCache,
  getLatestLogs,
  writeCacheFiles,
} from './lib/cache-export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = join(__dirname, '../data/cache');
const CACHE_PATH = join(CACHE_DIR, 'posts.json');
const STATUS_PATH = join(CACHE_DIR, 'status.json');

function main() {
  const db = openDb();
  const posts = db.prepare(`
    SELECT id, blog_id as blogId, title, link, date, excerpt
    FROM posts
    ORDER BY date DESC
  `).all().map((row) => ({ ...row, excerpt: row.excerpt || '' }));

  const logs = getLatestLogs(db);
  const postsCache = buildPostsCache(posts);
  const statusCache = buildStatusCache(logs);
  writeCacheFiles({
    cacheDir: CACHE_DIR,
    postsPath: CACHE_PATH,
    statusPath: STATUS_PATH,
    postsCache,
    statusCache,
  });

  db.close();
  console.log(`Exported ${posts.length} posts to cache JSON.`);
}

main();
