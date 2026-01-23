# The Small Web

A curated feed of indie blogs. Hand-picked writing from independent voices who care about their craft.

**[smallweb.blog](https://smallweb.blog)**

---

## What is this?

The Small Web is a collection of indie blogs and publications I've come across over time. Instead of doomscrolling on Twitter, you could doomscroll here and actually find interesting links—rabbit holes worth going down.

The only filter is whether I've actually read something from each writer. These are some really smart people, and I think more people should read them.

## Features

- **Curated blogs** — Hand-picked writing from independent voices
- **No algorithms** — Posts appear chronologically, newest first
- **No ads, no tracking** — Just content
- **RSS feeds** — Subscribe via your favorite reader
- **OPML export** — Take the full blogroll with you
- **Dark mode** — Easy on the eyes
- **Discover mode** — Card-stack interface to find new reads

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | [Astro](https://astro.build) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Hosting | [Cloudflare Workers](https://workers.cloudflare.com) |
| Feed Refresh | GitHub Actions (twice daily) |

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Fetch latest RSS feeds
node scripts/fetch-feeds.js
```

## Project Structure

```
├── data/
│   ├── blogs.json           # Curated blog list
│   └── cache/
│       └── posts.json       # Aggregated posts (auto-generated)
├── scripts/
│   └── fetch-feeds.js       # RSS fetcher
├── src/
│   ├── pages/               # Astro pages
│   ├── layouts/             # Page layouts
│   └── styles/              # CSS
├── worker/
│   └── index.js             # Cloudflare Worker (RSS proxy)
└── wrangler.toml            # Cloudflare config
```

## Adding a Blog

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

Categories: `tech`, `design`, `life`, `culture`, `economics`, `finance`, `history`, `psychology`, `philosophy`

## Deployment

Pushes to `main` automatically deploy to Cloudflare Workers via GitHub Actions.

## RSS Proxy

The Worker includes an RSS proxy at `/api/fetch-rss?url=<feed-url>` to bypass rate limiting from services like Substack.

## License

MIT

---

Built with [Claude](https://claude.ai)
