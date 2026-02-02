# The Small Web

### [smallweb.blog](https://smallweb.blog)

*Small blogs, singular voices.*

---

A curated collection of indie blogs — hand-picked writing from independent voices who care about their craft. No algorithms, no ads, just great reads.

The Small Web aggregates RSS feeds from 100+ independent blogs across tech, design, life, culture, economics, finance, history, psychology, philosophy, and science. Feeds are refreshed twice daily. The site is built with Astro and served from Cloudflare Workers.

## How it works

```
GitHub Actions (twice daily)
  → fetch RSS/Atom feeds → write to SQLite → export cache JSON

Astro static build
  → reads cached JSON (from SQLite) → generates pages

Cloudflare Workers
  → serves the static site
```

Substack feeds are routed through a Cloudflare Pages proxy to avoid IP blocks.

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
src/pages/             ← Astro pages
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

## Deployment

Pushes to `main` trigger a build and deploy via GitHub Actions. Feeds refresh on a twice-daily schedule.

---

Built by [Bhuvanesh](https://twitter.com/bebhuvan).

## License

MIT. See `LICENSE`.
