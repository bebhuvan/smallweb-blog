# Feed Fetching Infrastructure

This document explains how RSS feed fetching works for The Small Web blog.

## Overview

The blog aggregates posts from 90+ indie blogs via RSS feeds. Fetching runs automatically via GitHub Actions twice daily.

## The Substack Problem

Substack aggressively rate-limits RSS requests from datacenter IPs (like GitHub Actions). Direct fetches result in 403 errors.

### Solution: Cloudflare Pages Proxy

Substack feeds are routed through a **Cloudflare Pages** proxy. This works because:
1. Cloudflare Pages has different outbound IPs than Workers
2. The proxy uses browser-like headers to appear as a normal user
3. Requests are spaced 30 seconds apart to avoid rate limiting

**Important:** Cloudflare Workers IPs are blocked by Substack, but Pages IPs are not. This is why we use a separate Cloudflare Pages project for the proxy.

## Architecture

```
GitHub Actions (fetch-feeds.js)
    │
    ├── Non-Substack feeds → Direct fetch (parallel)
    │
    └── Substack feeds → Cloudflare Pages Proxy → Substack
                         (rss-proxy project)
                         30s delay between each
```

## RSS Proxy Setup

The proxy is a separate Cloudflare Pages project: https://github.com/bebhuvan/rss-proxy

### Why a Separate Project?

- **Cloudflare Workers** (used by smallweb.blog): IPs are blocked by Substack
- **Cloudflare Pages**: IPs are NOT blocked by Substack

### Deploying the Proxy

1. Go to [Cloudflare Dashboard → Pages](https://dash.cloudflare.com/?to=/:account/pages)
2. Create a project → Connect to `bebhuvan/rss-proxy`
3. Build settings:
   - Build command: *(leave empty)*
   - Build output directory: `public`
4. Deploy
5. Note the URL (e.g., `https://rss-proxy.pages.dev`)

### Updating smallweb.blog to Use the Proxy

In `scripts/fetch-feeds.js`, update:
```javascript
const PROXY_URL = process.env.PROXY_URL || 'https://YOUR-PROXY.pages.dev/api/fetch-rss';
```

## Files

- `scripts/fetch-feeds.js` - Main fetcher script
- `worker/index.js` - Cloudflare Worker (serves site + RSS proxy)
- `data/blogs.json` - List of all blogs/feeds
- `data/cache/posts.json` - Cached posts (auto-updated)
- `data/cache/status.json` - Feed health status
- `.github/workflows/refresh-feeds.yml` - Scheduled fetching

## Adding a New Substack Feed

1. Add entry to `data/blogs.json`:
```json
{
  "id": "unique-slug",
  "name": "Newsletter Name",
  "url": "https://example.substack.com",
  "feed": "https://example.substack.com/feed",
  "categories": ["tech"],
  "description": "Brief description"
}
```

2. The feed will automatically:
   - Be detected as Substack (URL contains `substack.com`)
   - Route through the Cloudflare proxy
   - Wait 30 seconds before the next Substack fetch

3. Test locally: `npm run fetch-feeds`

## Adding a Non-Substack Feed

Same process, but these are fetched directly in parallel (faster).

## Rate Limiting Strategy

| Feed Type | Delay | Method |
|-----------|-------|--------|
| Non-Substack | Parallel | Direct fetch |
| Substack | 30s sequential | Via Cloudflare proxy |

## Troubleshooting

### Substack feeds returning 403

1. **Check proxy is using Cloudflare Pages** (not Workers)
   - Workers IPs are blocked by Substack
   - Pages IPs work fine

2. **Increase delay** between feeds if still failing
   - Currently 30s, can increase to 60s in `scripts/fetch-feeds.js`

3. **Test proxy directly:**
   ```bash
   curl "https://YOUR-PROXY.pages.dev/api/fetch-rss?url=https://thezvi.substack.com/feed"
   ```

### Timeouts / Connection Resets
- Some sites are slow; 30s timeout is set
- Connection resets are transient; will succeed on next run
- These are not proxy issues, just flaky servers

### Checking Feed Health
```bash
# View summary
cat data/cache/status.json | jq '.summary'

# View failed feeds
cat data/cache/status.json | jq '.feeds[] | select(.status == "error")'

# Count by error type
cat data/cache/status.json | jq '[.feeds[] | select(.status == "error") | .error] | group_by(.) | map({error: .[0], count: length})'
```

## GitHub Actions Workflow

The `refresh-feeds.yml` workflow:
1. Runs at 3 AM and 12 PM UTC daily (configurable)
2. Fetches non-Substack feeds in parallel (fast)
3. Fetches Substack feeds sequentially with 30s delays (via proxy)
4. Commits updated cache to repo
5. Triggers deploy workflow

### Permissions Required
```yaml
permissions:
  contents: write  # Push cache updates
  actions: write   # Trigger deploy workflow
```

## Project Structure

```
smallweb.blog/
├── scripts/fetch-feeds.js      # Feed fetcher (runs in GitHub Actions)
├── worker/index.js             # Cloudflare Worker (serves site)
├── data/blogs.json             # Feed list
├── data/cache/posts.json       # Cached posts
└── data/cache/status.json      # Feed health status

rss-proxy/ (separate repo)
├── functions/api/fetch-rss.js  # Cloudflare Pages Function (proxy)
└── public/index.html           # Placeholder
```

## Why Workers vs Pages Matters

| Platform | Substack Access | Use Case |
|----------|----------------|----------|
| Cloudflare Workers | ❌ Blocked | Serving the site |
| Cloudflare Pages | ✅ Works | RSS proxy |

Substack blocks datacenter IPs aggressively. Cloudflare Workers and Pages use different IP pools. Pages IPs happen to not be blocked (as of Jan 2025).

## Fallback: Paper Trails Proxy

If your proxy has issues, you can temporarily use paper trails' proxy:

```javascript
const PROXY_URL = 'https://papertrails.rabbitholes.garden/api/fetch-rss';
```

This is another Cloudflare Pages project that works reliably.
