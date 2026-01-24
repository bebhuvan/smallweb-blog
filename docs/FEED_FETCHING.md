# Feed Fetching Infrastructure

This document explains how RSS feed fetching works for The Small Web blog.

## Overview

The blog aggregates posts from 90+ indie blogs via RSS feeds. Fetching runs automatically via GitHub Actions twice daily.

## The Substack Problem

Substack aggressively rate-limits RSS requests from datacenter IPs (like GitHub Actions). Direct fetches result in 403 errors.

### Solution: Cloudflare Proxy

Substack feeds are routed through a Cloudflare proxy at `/api/fetch-rss`. This works because:
1. Cloudflare's outbound IPs are different from GitHub Actions IPs
2. The proxy uses browser-like headers to appear as a normal user
3. Requests are spaced 30 seconds apart to avoid rate limiting

## Architecture

```
GitHub Actions (fetch-feeds.js)
    │
    ├── Non-Substack feeds → Direct fetch
    │
    └── Substack feeds → Cloudflare Proxy → Substack
                         (/api/fetch-rss)
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
- Increase delay between feeds (currently 30s)
- Check if Cloudflare Worker is deployed correctly
- Substack may have blocked the Cloudflare IP range

### Timeouts
- Some sites are slow; 30s timeout is set
- Connection resets are transient; will succeed on next run

### Checking feed health
```bash
# View summary
cat data/cache/status.json | jq '.summary'

# View failed feeds
cat data/cache/status.json | jq '.feeds[] | select(.status == "error")'
```

## GitHub Actions Workflow

The `refresh-feeds.yml` workflow:
1. Runs at 3 AM and 12 PM UTC daily
2. Fetches all feeds (non-Substack in parallel, Substack sequentially)
3. Commits updated cache to repo
4. Triggers deploy workflow

## Cloudflare Worker Proxy

The Worker at `worker/index.js`:
- Serves static site from `/dist`
- Handles `/api/fetch-rss?url=<encoded-feed-url>`
- Adds browser-like headers to RSS requests
- Returns XML content with CORS headers

### Proxy Request Flow
```
GET /api/fetch-rss?url=https://example.substack.com/feed
    ↓
Worker fetches with browser User-Agent
    ↓
Returns RSS XML with CORS headers
```

## Alternative: Using Paper Trails Proxy

If the smallweb.blog Worker proxy has issues, you can use paper trails' proxy:

In `scripts/fetch-feeds.js`, change:
```javascript
const PROXY_URL = process.env.PROXY_URL || 'https://papertrails.rabbitholes.garden/api/fetch-rss';
```

Paper trails uses Cloudflare Pages (vs Workers) which may have different outbound IPs that Substack doesn't block.
