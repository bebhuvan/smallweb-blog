import { mkdirSync, writeFileSync } from 'fs';

export function getLatestLogs(db) {
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

export function getLastUpdated(logs) {
  const lastMs = logs.reduce((max, log) => {
    const ms = Date.parse(log.lastFetched || '');
    if (Number.isNaN(ms)) return max;
    return Math.max(max, ms);
  }, 0);
  return lastMs ? new Date(lastMs).toISOString() : new Date().toISOString();
}

export function buildPostsCache(posts, lastUpdated = new Date().toISOString()) {
  return {
    lastUpdated,
    posts,
  };
}

export function buildStatusCache(logs, lastUpdated = getLastUpdated(logs)) {
  return {
    lastUpdated,
    feeds: logs,
    summary: {
      total: logs.length,
      healthy: logs.filter((log) => log.status === 'ok').length,
      errors: logs.filter((log) => log.status === 'error').length,
    },
  };
}

export function writeCacheFiles({ cacheDir, postsPath, statusPath, postsCache, statusCache }) {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(postsPath, JSON.stringify(postsCache, null, 2));
  writeFileSync(statusPath, JSON.stringify(statusCache, null, 2));
}
