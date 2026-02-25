const DEFAULTS = {
  PROXY_URL: 'https://smallweb-rss.pages.dev/api/fetch-rss',
  FEED_TIMEOUT_MS: 30000,
  MAX_POSTS_PER_BLOG: 25,
  MAX_FUTURE_DAYS: 2,
  RECENT_PRIMARY_DAYS: 7,
  INFERRED_DATE_MAX_DIFF_DAYS: 30,
  FEED_CONCURRENCY: 8,
  SUBSTACK_BATCH_SIZE: 3,
  SUBSTACK_BATCH_DELAY_MS: 10000,
  EXCERPT_CONCURRENCY: 4,
  MAX_PAGE_EXCERPTS_PER_FEED: 3,
};

function parseEnvInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEnvNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseEnvBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeProxyUrl(rawValue, fallback, warnings) {
  const candidate = (rawValue || '').trim() || fallback;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) {
      warnings.push(`PROXY_URL must be http/https. Falling back to ${fallback}`);
      return fallback;
    }
    return url.toString();
  } catch {
    warnings.push(`Invalid PROXY_URL "${candidate}". Falling back to ${fallback}`);
    return fallback;
  }
}

export function loadFetchConfig(env = process.env) {
  const warnings = [];

  const config = {
    PROXY_URL: normalizeProxyUrl(env.PROXY_URL, DEFAULTS.PROXY_URL, warnings),
    FEED_TIMEOUT_MS: parseEnvInt(env.FEED_TIMEOUT_MS, DEFAULTS.FEED_TIMEOUT_MS),
    DEFAULT_MAX_POSTS_PER_BLOG: parseEnvInt(env.MAX_POSTS_PER_BLOG, DEFAULTS.MAX_POSTS_PER_BLOG),
    MAX_FUTURE_DAYS: parseEnvInt(env.MAX_FUTURE_DAYS, DEFAULTS.MAX_FUTURE_DAYS),
    RECENT_PRIMARY_DAYS: parseEnvInt(env.RECENT_PRIMARY_DAYS, DEFAULTS.RECENT_PRIMARY_DAYS),
    INFERRED_DATE_MAX_DIFF_DAYS: parseEnvInt(env.INFERRED_DATE_MAX_DIFF_DAYS, DEFAULTS.INFERRED_DATE_MAX_DIFF_DAYS),
    FEED_CONCURRENCY: parseEnvInt(env.FEED_CONCURRENCY, DEFAULTS.FEED_CONCURRENCY),
    SUBSTACK_BATCH_SIZE: parseEnvInt(env.SUBSTACK_BATCH_SIZE, DEFAULTS.SUBSTACK_BATCH_SIZE),
    SUBSTACK_BATCH_DELAY_MS: parseEnvInt(env.SUBSTACK_BATCH_DELAY_MS, DEFAULTS.SUBSTACK_BATCH_DELAY_MS),
    EXCERPT_CONCURRENCY: parseEnvInt(env.EXCERPT_CONCURRENCY, DEFAULTS.EXCERPT_CONCURRENCY),
    FETCH_PAGE_EXCERPTS: parseEnvBool(env.FETCH_PAGE_EXCERPTS, env.GITHUB_ACTIONS !== 'true'),
    MAX_PAGE_EXCERPTS_PER_FEED: parseEnvNonNegativeInt(
      env.MAX_PAGE_EXCERPTS_PER_FEED,
      DEFAULTS.MAX_PAGE_EXCERPTS_PER_FEED
    ),
    warnings,
  };

  if (config.SUBSTACK_BATCH_SIZE > config.FEED_CONCURRENCY * 4) {
    warnings.push(
      `SUBSTACK_BATCH_SIZE=${config.SUBSTACK_BATCH_SIZE} is high relative to FEED_CONCURRENCY=${config.FEED_CONCURRENCY}; expect more rate limits`
    );
  }
  if (!config.FETCH_PAGE_EXCERPTS && config.MAX_PAGE_EXCERPTS_PER_FEED > 0) {
    warnings.push('MAX_PAGE_EXCERPTS_PER_FEED is set but FETCH_PAGE_EXCERPTS=false, page excerpt fetching is disabled');
  }
  if (config.FEED_TIMEOUT_MS < 5000) {
    warnings.push(`FEED_TIMEOUT_MS=${config.FEED_TIMEOUT_MS} is low and may cause false timeouts`);
  }

  return config;
}

export function formatFetchConfig(config) {
  return [
    `FEED_CONCURRENCY=${config.FEED_CONCURRENCY}`,
    `EXCERPT_CONCURRENCY=${config.EXCERPT_CONCURRENCY}`,
    `FETCH_PAGE_EXCERPTS=${config.FETCH_PAGE_EXCERPTS}`,
    `MAX_PAGE_EXCERPTS_PER_FEED=${config.MAX_PAGE_EXCERPTS_PER_FEED}`,
    `SUBSTACK_BATCH_SIZE=${config.SUBSTACK_BATCH_SIZE}`,
    `SUBSTACK_BATCH_DELAY_MS=${config.SUBSTACK_BATCH_DELAY_MS}`,
    `FEED_TIMEOUT_MS=${config.FEED_TIMEOUT_MS}`,
    `MAX_POSTS_PER_BLOG=${config.DEFAULT_MAX_POSTS_PER_BLOG}`,
  ].join(', ');
}

