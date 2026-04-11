import type { APIRoute } from 'astro';
import { getBlogs, getPosts } from '../lib/site-data';

const SITE_URL = 'https://smallweb.blog';
const FEED_LIMIT = 100;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeXml(text).replace(/"/g, '&quot;');
}

export const GET: APIRoute = async () => {
  const blogs = getBlogs();
  const posts = getPosts();
  const blogMap = new Map(blogs.map((b) => [b.id, b]));

  const now = new Date();
  const currentYear = now.getFullYear();
  const MIN_YEAR = currentYear - 2;
  const MAX_YEAR = currentYear + 1;

  // Sort by date desc, drop bogus/missing dates, take top N.
  const items = posts
    .map((p) => ({ post: p, ts: new Date(p.date).getTime() }))
    .filter((it) => {
      if (Number.isNaN(it.ts)) return false;
      const y = new Date(it.ts).getFullYear();
      return y >= MIN_YEAR && y <= MAX_YEAR;
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, FEED_LIMIT)
    .map(({ post, ts }) => {
      const blog = blogMap.get(post.blogId);
      const pubDate = new Date(ts).toUTCString();
      const writer = blog?.name || 'Unknown';
      const categories = (blog?.categories || [])
        .map((c: string) => `      <category>${escapeXml(c)}</category>`)
        .join('\n');
      const description = post.excerpt
        ? `      <description><![CDATA[${post.excerpt}]]></description>\n`
        : '';
      const sourceUrl = blog?.feed ? ` url="${escapeAttr(blog.feed)}"` : '';

      return `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${escapeXml(post.link)}</link>
      <guid isPermaLink="true">${escapeXml(post.link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <dc:creator><![CDATA[${writer}]]></dc:creator>
      <source${sourceUrl}>${escapeXml(writer)}</source>
${description}${categories}
    </item>`;
    })
    .join('\n');

  const lastBuildDate = now.toUTCString();

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>smallweb</title>
    <link>${SITE_URL}</link>
    <description>A reading room for the unhurried web. Hand-picked essays from ${blogs.length} independent writers, refreshed every few hours.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>smallweb on Astro</generator>
    <ttl>360</ttl>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE_URL}/og-image.png</url>
      <title>smallweb</title>
      <link>${SITE_URL}</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
