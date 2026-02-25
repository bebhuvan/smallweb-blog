import type { APIRoute } from 'astro';
import { getBlogs, getPosts } from '../lib/site-data';

export const GET: APIRoute = async () => {
  const blogs = getBlogs();
  const posts = getPosts();
  const blogMap = new Map(blogs.map((b) => [b.id, b]));

  const siteUrl = 'https://smallweb.blog';
  const now = new Date().toUTCString();

  const items = posts.slice(0, 100).map((post) => {
    const blog = blogMap.get(post.blogId);
    const pubDate = new Date(post.date).toUTCString();
    const categories = blog?.categories?.map((cat: string) => `      <category>${cat}</category>`).join('\n') || '';

    return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${post.link}</link>
      <guid isPermaLink="true">${post.link}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>${blog?.name || 'Unknown'}</author>
      <source url="${blog?.feed || ''}">${blog?.name || 'Unknown'}</source>
      ${post.excerpt ? `<description><![CDATA[${post.excerpt}]]></description>` : ''}
${categories}
    </item>`;
  }).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The Small Web</title>
    <description>A curated collection of the best indie blogs. Hand-picked writing from independent voices who care about their craft.</description>
    <link>${siteUrl}</link>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>360</ttl>
    <image>
      <url>${siteUrl}/favicon.svg</url>
      <title>The Small Web</title>
      <link>${siteUrl}</link>
    </image>
    ${items}
  </channel>
</rss>`;

  return new Response(rss.trim(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
