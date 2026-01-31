import { spawn } from 'child_process';

function getFlagValue(flag, args) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) return null;
  return value;
}

const args = process.argv.slice(2);
const maxPosts = getFlagValue('--max', args) || process.env.MAX_POSTS_PER_BLOG || '100';
const feedTimeout = getFlagValue('--timeout', args) || process.env.FEED_TIMEOUT_MS || '45000';
const feedConcurrency = getFlagValue('--concurrency', args) || process.env.FEED_CONCURRENCY || '4';
const excerptConcurrency = getFlagValue('--excerpt-concurrency', args) || process.env.EXCERPT_CONCURRENCY || '3';

const env = {
  ...process.env,
  MAX_POSTS_PER_BLOG: String(maxPosts),
  FEED_TIMEOUT_MS: String(feedTimeout),
  FEED_CONCURRENCY: String(feedConcurrency),
  EXCERPT_CONCURRENCY: String(excerptConcurrency),
};

console.log('=== Backfill RSS Feeds ===');
console.log(`MAX_POSTS_PER_BLOG=${env.MAX_POSTS_PER_BLOG}`);
console.log(`FEED_TIMEOUT_MS=${env.FEED_TIMEOUT_MS}`);
console.log(`FEED_CONCURRENCY=${env.FEED_CONCURRENCY}`);
console.log(`EXCERPT_CONCURRENCY=${env.EXCERPT_CONCURRENCY}`);
console.log('Running fetch-feeds...\n');

const child = spawn(process.execPath, ['scripts/fetch-feeds.js'], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
