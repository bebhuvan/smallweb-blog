import type { APIRoute } from 'astro';
import blogsData from '../../data/blogs.json';
import postsData from '../../data/cache/posts.json';

export const GET: APIRoute = async () => {
  const blogs = blogsData.blogs;
  const posts = postsData.posts;
  const blogMap = new Map(blogs.map((b) => [b.id, b]));

  const siteUrl = 'https://smallweb.blog';
  const now = new Date().toUTCString();

  const items = posts.slice(0, 50).map((post) => {
    const blog = blogMap.get(post.blogId);
    const pubDate = new Date(post.date).toUTCString();

    return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${post.link}</link>
      <guid isPermaLink="true">${post.link}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>${blog?.name || 'Unknown'}</author>
      <source url="${blog?.feed || ''}">${blog?.name || 'Unknown'}</source>
      ${post.excerpt ? `<description><![CDATA[${post.excerpt}]]></description>` : ''}
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
