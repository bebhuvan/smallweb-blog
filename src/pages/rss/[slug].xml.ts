import type { APIRoute, GetStaticPaths } from 'astro';
import { CATEGORIES } from '../../lib/categories';
import { getBlogs, getPosts } from '../../lib/site-data';

const SITE_URL = 'https://smallweb.blog';
const FEED_LIMIT = 60;

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(text: string): string {
  return escapeXml(text).replace(/"/g, '&quot;');
}

export const getStaticPaths: GetStaticPaths = () => {
  return CATEGORIES.map((c) => ({ params: { slug: c.slug }, props: { category: c } }));
};

export const GET: APIRoute = async ({ props }) => {
  const { category } = props as { category: (typeof CATEGORIES)[number] };

  const blogs = getBlogs();
  const posts = getPosts();
  const blogMap = new Map(blogs.map((b) => [b.id, b]));

  const now = new Date();
  const currentYear = now.getFullYear();
  const MIN_YEAR = currentYear - 2;

  const categoryBlogIds = new Set(
    blogs.filter((b) => (b.categories || []).includes(category.slug)).map((b) => b.id)
  );

  const items = posts
    .filter((p) => categoryBlogIds.has(p.blogId))
    .map((p) => ({ post: p, ts: new Date(p.date).getTime() }))
    .filter((it) => !Number.isNaN(it.ts) && new Date(it.ts).getFullYear() >= MIN_YEAR)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, FEED_LIMIT)
    .map(({ post, ts }) => {
      const blog = blogMap.get(post.blogId);
      const writer = blog?.name || 'Unknown';
      const pubDate = new Date(ts).toUTCString();
      const sourceUrl = blog?.feed ? ` url="${escapeAttr(blog.feed)}"` : '';
      const desc = post.excerpt
        ? `      <description><![CDATA[${post.excerpt}]]></description>\n`
        : '';
      return `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${escapeXml(post.link)}</link>
      <guid isPermaLink="true">${escapeXml(post.link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <dc:creator><![CDATA[${writer}]]></dc:creator>
      <source${sourceUrl}>${escapeXml(writer)}</source>
${desc}      <category>${escapeXml(category.slug)}</category>
    </item>`;
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>smallweb · ${escapeXml(category.name)}</title>
    <link>${SITE_URL}/category/${category.slug}</link>
    <description>${escapeXml(category.description)}. Essays from the ${category.name.toLowerCase()} shelf of smallweb.</description>
    <language>en-us</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <generator>smallweb on Astro</generator>
    <ttl>360</ttl>
    <atom:link href="${SITE_URL}/rss/${category.slug}.xml" rel="self" type="application/rss+xml"/>
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
