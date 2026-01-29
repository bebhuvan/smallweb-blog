# The Small Web — "Zine V2" Design Implementation Spec

## Reference Mock

The design mock is at `/tmp/mock-v2b-zine.html`. Open it in a browser to see the target. Everything below describes how to implement this design in the existing Astro codebase.

## Design Philosophy

Refined indie zine energy. NOT gimmicky rotations and dashes — real zine qualities: **dramatic scale contrast** (massive titles next to quiet dense text), **asymmetric layouts**, **bold font mixing** (heavy serif + light sans), and **intentional color restraint** with one bold color-band section breaking the page rhythm.

Hover interactions: title warms to terracotta (`--accent`), items get a subtle 3px left-padding nudge. **Nothing lifts. No translateY. No shadows. Stillness = sophistication.**

---

## Codebase Structure

```
src/
  layouts/Base.astro          — HTML shell, head, fonts, theme script
  styles/global.css           — All styles (CSS custom properties, no Tailwind classes)
  components/
    Header.astro              — Currently uses Tailwind classes — REWRITE to match zine design
    Footer.astro              — Currently uses Tailwind classes — REWRITE
    PostCard.astro            — Currently card-based — REWRITE or REMOVE (not needed in new design)
    ThemeToggle.astro         — REWRITE to square zine-style toggle
  pages/
    index.astro               — Homepage — REWRITE (main focus)
    blogs.astro               — Blogroll page — RESTYLE
    discover.astro            — Card-swipe page — RESTYLE header/footer only, keep swipe mechanic
    archive.astro             — Archive list — RESTYLE
    category/[slug].astro     — Category page — RESTYLE
    about.astro               — About page — RESTYLE
    feed.astro, status.astro  — Leave as-is
data/
  blogs.json                  — Blog entries: { id, name, url, feed, categories[], description }
  cache/posts.json            — Posts: { id, blogId, title, link, date, excerpt }
```

## Data Shape (for reference)

```typescript
// Post (from data/cache/posts.json)
{ id: string, blogId: string, title: string, link: string, date: string, excerpt: string }

// Blog (from data/blogs.json)
{ id: string, name: string, url: string, feed: string, categories: string[], description: string }

// Enriched post (computed in frontmatter)
{ ...post, blogName: string, blogUrl: string, category: string }
```

---

## CSS Variables — Replace Entire `:root` Block

Replace the current `global.css` `:root` and `.dark` with:

```css
:root {
  --bg: #FAF7F2;
  --bg-soft: #F0ECE4;
  --ink: #2C2825;
  --ink-muted: #6B645C;
  --ink-faint: #9E978F;
  --rule: #E2DCD3;
  --accent: #C45A35;

  /* Category colors */
  --tech: #4A8F7A;
  --tech-wash: #EEF5F2;
  --culture: #7D6A9A;
  --culture-wash: #F2EEF7;
  --life: #B87A4A;
  --life-wash: #F8F2EB;
  --design: #A86565;
  --design-wash: #F7EFEF;
  --economics: #4A8A9A;
  --economics-wash: #EDF3F6;
  --finance: #9A8345;
  --finance-wash: #F6F3EA;
  --history: #8B735B;
  --history-wash: #F4F0EB;
  --psychology: #A6658E;
  --psychology-wash: #F5EEF3;
  --philosophy: #5E6A96;
  --philosophy-wash: #EEEEF5;
  --science: #3A7CA5;
  --science-wash: #EBF1F5;

  /* Typography */
  --serif: 'Fraunces', Georgia, serif;
  --sans: 'Nunito Sans', system-ui, sans-serif;
}

.dark {
  --bg: #1A1816;
  --bg-soft: #242019;
  --ink: #E0DCD5;
  --ink-muted: #A8A29A;
  --ink-faint: #6E6960;
  --rule: #2E2A25;
  --accent: #D97A58;
  --tech-wash: #1A2622;
  --culture-wash: #221E28;
  --life-wash: #262018;
  --design-wash: #261E1E;
  --economics-wash: #1A2325;
  --finance-wash: #252218;
  --history-wash: #232018;
  --psychology-wash: #231E22;
  --philosophy-wash: #202228;
  --science-wash: #1C2225;
}
```

---

## Homepage (`index.astro`) — Full Layout Spec

### Page Structure (top to bottom)

```
1. Masthead
2. Category nav (rubber-stamp pills)
3. Lead section (5fr + 3fr asymmetric grid)
   - Left: lead story (stamp badge, massive title, byline, excerpt)
   - Right: "Editor's Picks" sidebar (4 items, left border divider)
4. Cut mark (✂ dashed line)
5. Asymmetric section: Tech (2fr) + Life (1fr)
   - Tech: section header + 1 featured post with excerpt + 2 list items
   - Life: section header + 3 tight list items
6. Pasted quote (rotated terracotta ghost background)
7. Cut mark (✕)
8. Color band section (full-width culture-wash background)
   - Asymmetric: Culture (2fr) + Design (1fr)
9. Cut mark (✂)
10. Bottom 3-column grid: Economics, Finance, History (equal width)
11. Footer
```

### Masthead

```html
<header class="masthead">
  <div class="masthead-issue">{issue string like "Issue No. 29 · January 2026"}</div>
  <h1 class="masthead-title">The <span class="word-accent">Small</span> Web</h1>
  <p class="masthead-sub">hand-picked indie blogs, never algorithmic</p>
  <hr class="masthead-rule">
</header>
```

Key CSS:
- `.masthead-title`: `font-size: clamp(3.2rem, 7vw, 5rem)`, `font-weight: 900`, `line-height: 0.92`, `letter-spacing: -0.04em`
- `.word-accent`: `color: var(--accent)` — the word "Small" is terracotta
- `.masthead-issue`: `font-size: 0.62rem`, `font-weight: 600`, `letter-spacing: 0.14em`, uppercase, `color: var(--ink-faint)`
- `.masthead-sub`: `font-family: var(--serif)`, `font-style: italic`, `font-size: 0.95rem`
- `.masthead-rule`: `border-top: 2.5px solid var(--ink)` — thick dark rule

### Category Nav — "Rubber Stamp" Style

```html
<nav class="nav">
  <a href="/" class="stamp active">All</a>
  <a href="/category/tech" class="stamp">
    <span class="stamp-dot" style="background:var(--tech)"></span>Tech
  </a>
  <!-- ...etc -->
</nav>
```

Key CSS:
- `.stamp`: rectangular (NO border-radius), `border: 1.5px solid var(--rule)`, `font-size: 0.65rem`, `font-weight: 700`, `letter-spacing: 0.1em`, `text-transform: uppercase`
- `.stamp.active`: `background: var(--ink)`, `color: var(--bg)`, `border-color: var(--ink)`
- `.stamp:hover`: `border-color: var(--ink)`, `color: var(--ink)`
- `.stamp-dot`: 6px circle in category color

### Lead Section

5fr/3fr grid. Left: lead story as a single `<a>` block. Right: sidebar with left border.

**Lead stamp badge** (NOT a pill — a rectangular stamp with border):
```css
.lead-stamp {
  display: inline-block;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 0.25rem 0.6rem;
  border: 1.5px solid;
  margin-bottom: 1.25rem;
  transform: rotate(-1deg); /* very subtle */
}
.lead-stamp.tech { border-color: var(--tech); color: var(--tech); }
/* etc for each category */
```

**Lead title**: `clamp(1.8rem, 3.5vw, 2.6rem)`, `font-weight: 700`, `line-height: 1.12`, `letter-spacing: -0.025em`

**Lead sidebar**: `border-left: 1.5px solid var(--rule)`, `padding-left: 2rem`. Header label "Editor's Picks" in `font-size: 0.6rem`, `font-weight: 700`, `letter-spacing: 0.12em`, uppercase, `color: var(--accent)`.

Each pick item: category label (tiny, colored) + serif title (0.92rem) + meta (0.68rem faint). On hover: `padding-left: 3px` transition + title color → accent.

### Cut Marks

```html
<div class="cut">✂</div>
```

```css
.cut {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  color: var(--ink-faint);
  font-size: 0.7rem;
}
.cut::before, .cut::after {
  content: '';
  flex: 1;
  border-top: 1px dashed var(--rule);
}
```

Alternate between `✂` and `✕` symbols.

### Asymmetric Sections

2fr + 1fr grid. The wide column has a **featured post with excerpt** (inside a 1.5px solid border box) + regular list items below. The narrow column is a tight list.

**Featured post box**: `border: 1.5px solid var(--rule)`, `padding: 1.25rem`. On hover: `border-color: var(--accent)`. Title is `font-size: 1.15rem`, `font-weight: 600`.

**Regular list items**: just title + meta, separated by `border-bottom: 1px solid var(--rule)`. On hover: 3px left padding nudge + title → accent color.

**Tight list items**: same but smaller — title `font-size: 0.88rem`.

### Color Band Section

ONE section (Culture) gets a full-width wash background. It breaks out of the `.page` container:

```css
.color-band {
  background: var(--culture-wash);
  margin: 0 -2.5rem;    /* break out of page padding */
  padding: 2rem 2.5rem; /* restore inner padding */
  transition: background 0.5s ease;
}
```

The category header text inside the band uses the category color: `.color-band .asym-head-text { color: var(--culture); }`

### Pasted Quote

```html
<div class="pasted-quote">
  <div class="pasted-quote-bg"></div>
  <div class="pasted-quote-inner">
    <p class="pasted-quote-text">"Quote text..."</p>
    <div class="pasted-quote-src">— Source</div>
  </div>
</div>
```

The `-bg` div is absolutely positioned, offset by 0.5rem, `background: var(--accent)`, `opacity: 0.08`, `transform: rotate(-0.5deg)`. The inner content sits on top with `z-index: 1`. Quote text is italic Fraunces, source is `color: var(--accent)`.

### Bottom 3-Column Grid

Equal-width 3 columns for remaining categories. `border-top: 2px solid var(--ink)` above. Each column: header with dot + name, then list items.

### Footer

Flex row, `justify-content: space-between`. Left: stats text. Right: uppercase links. `border-top: 2.5px solid var(--ink)`.

---

## Other Pages

### `category/[slug].astro`
- Same masthead + nav as homepage (extract into shared component)
- Page header: category dot + name + description + article count
- Posts listed as simple items (same as `.asym-item` style): title + byline, separated by `border-bottom: 1px solid var(--rule)`. Grouped by month with month headers.

### `blogs.astro`
- Same masthead + nav
- Blog grid: keep 2-column grid but restyle cards — remove shadows, use `border: 1.5px solid var(--rule)` instead. Avatar circles using category color are fine. On hover: `border-color: var(--accent)`.
- Category tabs: use `.stamp` style from homepage

### `archive.astro`
- Same masthead + nav
- Archive list: date | title + byline | category stamp. Clean grid layout.

### `discover.astro`
- Keep the card-swipe mechanic as-is — it's the signature interaction
- Restyle header/footer/nav to match zine design
- Card styling: remove border-radius (use `border-radius: 0` or `2px` max), keep the colored top border stripe

### `about.astro`
- Same masthead + nav
- Content area: max-width 700px, centered. Keep existing content styles.

---

## Components to Create/Rewrite

### `ThemeToggle.astro` — Rewrite
Square button, no border-radius, `border: 1.5px solid var(--ink)`, `transform: rotate(2deg)`. On hover: accent background, rotate(-2deg). Shows ☽/☀.

### `Header.astro` — Rewrite
Should render the masthead + nav. Accept `currentPath` prop to highlight active nav stamp. Remove all Tailwind classes — use the CSS from global.css.

### `Footer.astro` — Rewrite
Flex row with stats left, nav links right. Uppercase link style, 2.5px top border.

### `PostCard.astro` — Remove or Replace
The card component is not needed in the new design. Posts are rendered inline as `.asym-item`, `.tight-item`, `.bottom-item`, or `.pick` depending on context. If you want a reusable component, make a simple `PostItem.astro` that renders:

```html
<a href={link} target="_blank" rel="noopener noreferrer" class="asym-item">
  <h4 class="asym-item-title">{title}</h4>
  <p class="asym-item-meta">{blogName} · {date}</p>
</a>
```

---

## Key Interaction Rules

1. **Hover on post titles**: color transitions to `var(--accent)` over `0.3s ease`. That's it.
2. **Hover on list items** (`.pick`, `.asym-item`, `.tight-item`, `.bottom-item`): `padding-left: 3px` transition. Subtle nudge.
3. **Hover on featured boxes** (`.asym-featured`): `border-color` transitions to `var(--accent)`.
4. **NO translateY anywhere.** No lift effects. No shadows. No scale transforms on content.
5. **Theme toggle**: rotate(2deg) → rotate(-2deg) on hover. Background → accent on hover.
6. **Nav stamps**: border-color darkens on hover. Active state inverts (dark bg, light text).

---

## Responsive Breakpoints

### ≤900px
- Lead grid → single column. Sidebar loses left border, gains top border.
- Asymmetric sections → single column. Tight column gets top border separator.
- Bottom 3-col grid → single column with top borders between.
- Color band: adjust negative margins to `-1.5rem`.

### ≤600px
- Base font: 16px (from 17px)
- Page padding: 1.5rem (from 2.5rem)
- Masthead title: 2.8rem
- Lead title: 1.65rem
- Footer: column layout instead of row

---

## Excerpts / Descriptions

- **Show excerpts ONLY on**: the lead story and featured posts inside asymmetric sections (1 per section, the first/top post).
- **Do NOT show excerpts**: in tight lists, sidebar picks, bottom grid items, or regular list items.
- Excerpts come from `post.excerpt` in the data. They're auto-generated from RSS and can be messy — truncate with CSS (`-webkit-line-clamp: 3`) or JS (first 200 chars).
- Blog descriptions (`blog.description`) are only shown on the blogroll page.

---

## Fonts

Already loaded in `Base.astro`. Keep the Google Fonts link but update weights:

```
Fraunces: 300, 400, 500, 600, 700, 900 (normal) + 400, 500 (italic)
Nunito Sans: 300, 400, 500, 600, 700 (normal) + 400 (italic)
```

The `font-optical-sizing: auto` property should be on the masthead title for Fraunces to look its best at large sizes.

---

## What NOT to Change

- `data/blogs.json` and `data/cache/posts.json` structure
- `scripts/fetch-feeds.js`
- `worker/index.js`
- `.github/workflows/`
- `pages/rss.xml.ts`
- `pages/status.astro`, `pages/offline.astro`
- The Discover page's card-swipe JavaScript mechanic (just restyle the chrome around it)
