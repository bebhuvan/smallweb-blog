# The Small Web

### [smallweb.blog](https://smallweb.blog)

*Small blogs, singular voices.*

---

A curated collection of indie blogs — hand-picked writing from independent voices who care about their craft. No algorithms, no ads, just great reads.

The Small Web aggregates RSS feeds from 100+ independent blogs across tech, design, life, culture, economics, finance, history, psychology, philosophy, and science. Feeds are refreshed three times daily. The site is built with Astro and served from Cloudflare Workers.

## How it works

```
GitHub Actions (scheduled + manual)
  → fetch RSS/Atom feeds → write SQLite + cache JSON → verify output → commit cache changes

Astro static build
  → reads cached JSON (from SQLite) → generates pages

Cloudflare Workers
  → serves the static site (headers + cache-control)
```

Substack feeds are routed through a Cloudflare Pages proxy to avoid IP blocks.

## Reliability notes

- Feed fetching runs in GitHub Actions (best fit for long-running batch jobs, retries, and file outputs).
- Cloudflare Worker is used for serving the site and for the Substack RSS proxy only.
- The refresh workflow now runs fetch + verify + commit + build + deploy in one run when cache data changes.
- The separate deploy workflow is for code pushes/manual deploys and ignores cache-only commits.
- `npm run verify-pipeline` validates `data/cache/posts.json` and `data/cache/status.json` before CI commits refresh output.

## Local development

```bash
npm install
npm run dev
```

To refresh feeds locally:

```bash
npm run fetch-feeds
```

To migrate existing cache JSON into SQLite (first-time setup):

```bash
npm run migrate-db
```

To export cache JSON from SQLite:

```bash
npm run export-cache
```

To verify cache/status output integrity:

```bash
npm run verify-pipeline
```

To run regression tests for fetcher helper logic:

```bash
npm run test:fetcher
```

To backfill more history (useful for feeds that cap items):

```bash
npm run backfill-feeds
```

Generate PNG icons for PWA and Apple touch:

```bash
npm run generate-pwa-icons
```

## Project structure

```
data/blogs.json        ← curated blog list (source of truth)
data/smallweb.db       ← SQLite data store (fetch/build time)
data/cache/            ← exported feed data (posts.json, status.json)
scripts/               ← feed fetching pipeline
scripts/lib/fetch/     ← fetcher helper modules (dates/urls/dedupe/html/etc.)
scripts/lib/fetch-config.js ← fetcher env config parsing + warnings
scripts/verify-pipeline.js  ← cache/status integrity checks
src/pages/             ← Astro pages
src/lib/site-data.ts   ← shared build-time data access for pages/routes
src/lib/homepage.ts    ← homepage curation logic
src/components/        ← Astro components
src/layouts/           ← base layout
src/styles/            ← global CSS + self-hosted fonts
public/fonts/          ← Fraunces + Nunito Sans (woff2)
worker/                ← Cloudflare Worker (headers, caching)
```

## Adding a blog

Edit `data/blogs.json`:

```json
{
  "id": "unique-slug",
  "name": "Blog Name",
  "url": "https://example.com",
  "feed": "https://example.com/rss.xml",
  "categories": ["tech"],
  "description": "Short description"
}
```

Add `"proxy": true` for Substack or feeds that need the RSS proxy.

Optional blog fields:
- `"allowMissingDates": true` — allow fallback dates when feeds omit them
- `"ignoreLinkDateInference": true` — don't infer dates from outbound links (curation feeds)
- `"maxPosts": 50` — override per-feed post cap

## Feed fetching configuration

The feed fetcher supports environment variables for tuning performance:

| Variable | Default | Description |
|---|---|---|
| `FEED_CONCURRENCY` | `8` | Max parallel fetches for non-Substack feeds |
| `SUBSTACK_BATCH_SIZE` | `3` | Number of Substack feeds fetched concurrently per batch |
| `SUBSTACK_BATCH_DELAY_MS` | `10000` | Delay (ms) between Substack batches to avoid rate limiting |
| `EXCERPT_CONCURRENCY` | `4` | Max parallel page fetches for excerpt extraction |
| `FEED_TIMEOUT_MS` | `30000` | Timeout (ms) per feed request |
| `MAX_POSTS_PER_BLOG` | `25` | Default max posts kept per blog |
| `FETCH_PAGE_EXCERPTS` | `true` locally / `false` in CI | Enable page-level excerpt fallback fetching |
| `MAX_PAGE_EXCERPTS_PER_FEED` | `3` | Max page fetches per feed for missing excerpts |
| `PROXY_URL` | Cloudflare Pages proxy | Override RSS proxy endpoint |

Substack feeds (and feeds with `"proxy": true`) are routed through a Cloudflare Pages proxy and fetched in small parallel batches rather than sequentially, to keep CI runs well under the 6-hour GitHub Actions limit.

## Deployment

- Pushes to `main` trigger build + deploy via GitHub Actions.
- Feed refreshes run on a three-times-daily schedule and can also be triggered manually.
- Refresh workflow commits cache changes and deploys in the same workflow run.
- `deploy.yml` ignores `data/cache/**` pushes to avoid duplicate deploys after scheduled refreshes.

## Docs

- `AGENTS.md` - repo-specific working context for coding agents
- `docs/reliability-refactor-plan.md` - current phased robustness/refactor plan
- `refactor.md` - older plan (historical context)

---

Built by [Bhuvanesh](https://twitter.com/bebhuvan).

## License

MIT. See `LICENSE`.
