import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getDbPath() {
  return process.env.DB_PATH || join(__dirname, '../../data/smallweb.db');
}

export function openDb() {
  const db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS blogs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      feed TEXT NOT NULL,
      categories_json TEXT NOT NULL,
      description TEXT DEFAULT '',
      proxy INTEGER DEFAULT 0,
      allow_missing_dates INTEGER DEFAULT 0,
      max_posts INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      blog_id TEXT NOT NULL REFERENCES blogs(id),
      title TEXT NOT NULL,
      link TEXT NOT NULL,
      date TEXT NOT NULL,
      excerpt TEXT DEFAULT '',
      fetched_at TEXT NOT NULL,
      summary TEXT,
      embedding BLOB
    );

    CREATE TABLE IF NOT EXISTS fetch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blog_id TEXT NOT NULL REFERENCES blogs(id),
      status TEXT NOT NULL,
      post_count INTEGER DEFAULT 0,
      latency_ms INTEGER,
      error TEXT,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_posts_date ON posts(date DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_blog ON posts(blog_id);
    CREATE INDEX IF NOT EXISTS idx_fetch_log_blog ON fetch_log(blog_id);
  `);

  return db;
}

function coerceInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function upsertBlogs(db, blogs) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO blogs (
      id, name, url, feed, categories_json, description, proxy, allow_missing_dates, max_posts, updated_at
    ) VALUES (
      @id, @name, @url, @feed, @categories_json, @description, @proxy, @allow_missing_dates, @max_posts, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      feed = excluded.feed,
      categories_json = excluded.categories_json,
      description = excluded.description,
      proxy = excluded.proxy,
      allow_missing_dates = excluded.allow_missing_dates,
      max_posts = excluded.max_posts,
      updated_at = excluded.updated_at;
  `);

  const rows = blogs.map((blog) => ({
    id: blog.id,
    name: blog.name,
    url: blog.url,
    feed: blog.feed,
    categories_json: JSON.stringify(blog.categories || []),
    description: blog.description || '',
    proxy: blog.proxy ? 1 : 0,
    allow_missing_dates: blog.allowMissingDates ? 1 : 0,
    max_posts: coerceInt(blog.maxPosts ?? blog.max_posts),
    updated_at: now,
  }));

  const tx = db.transaction((payload) => {
    for (const row of payload) stmt.run(row);
  });
  tx(rows);
}

export function loadPosts(db) {
  const rows = db.prepare(`
    SELECT id, blog_id as blogId, title, link, date, excerpt
    FROM posts
    ORDER BY date DESC
  `).all();
  return rows.map((row) => ({ ...row, excerpt: row.excerpt || '' }));
}

export function countPosts(db) {
  const row = db.prepare('SELECT COUNT(*) as count FROM posts').get();
  return row?.count || 0;
}

export function hasFetchLogs(db) {
  return Boolean(db.prepare('SELECT 1 FROM fetch_log LIMIT 1').get());
}

export function upsertPosts(db, posts, fetchedAt) {
  if (!posts.length) return;
  const stmt = db.prepare(`
    INSERT INTO posts (id, blog_id, title, link, date, excerpt, fetched_at)
    VALUES (@id, @blog_id, @title, @link, @date, @excerpt, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      link = excluded.link,
      date = excluded.date,
      excerpt = excluded.excerpt
  `);

  const tx = db.transaction((payload) => {
    for (const post of payload) {
      stmt.run({
        id: post.id,
        blog_id: post.blogId,
        title: post.title,
        link: post.link,
        date: post.date,
        excerpt: post.excerpt || '',
        fetched_at: fetchedAt,
      });
    }
  });
  tx(posts);
}

export function insertFetchLogs(db, logs) {
  if (!logs.length) return;
  const stmt = db.prepare(`
    INSERT INTO fetch_log (blog_id, status, post_count, latency_ms, error, fetched_at)
    VALUES (@blog_id, @status, @post_count, @latency_ms, @error, @fetched_at)
  `);

  const tx = db.transaction((payload) => {
    for (const log of payload) {
      stmt.run({
        blog_id: log.blogId,
        status: log.status,
        post_count: log.postCount || 0,
        latency_ms: log.latencyMs || null,
        error: log.error || null,
        fetched_at: log.lastFetched || new Date().toISOString(),
      });
    }
  });
  tx(logs);
}
