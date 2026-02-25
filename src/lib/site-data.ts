import blogsData from '../../data/blogs.json';
import postsData from '../../data/cache/posts.json';
import { createBlogMap, enrichPosts, type Blog } from './posts';

type CachePost = {
  id: string;
  blogId: string;
  title: string;
  link: string;
  date: string;
  excerpt?: string;
};

type PostsCache = {
  lastUpdated?: string;
  posts: CachePost[];
};

export type FeedStatusRow = {
  blogId: string;
  status: 'ok' | 'error' | string;
  postCount: number;
  latencyMs?: number;
  error?: string | null;
  lastFetched: string;
};

export type StatusCache = {
  lastUpdated: string | null;
  feeds: FeedStatusRow[];
  summary: {
    total: number;
    healthy: number;
    errors: number;
  };
};

const EMPTY_STATUS: StatusCache = {
  lastUpdated: null,
  feeds: [],
  summary: { total: 0, healthy: 0, errors: 0 },
};

export function getBlogs() {
  return (blogsData.blogs || []) as Blog[];
}

export function getPostsCache() {
  return postsData as PostsCache;
}

export function getPosts() {
  return getPostsCache().posts || [];
}

export function getBlogMap(blogs = getBlogs()) {
  return createBlogMap(blogs);
}

export function getEnrichedPosts(options: { blogs?: Blog[]; blogMap?: ReturnType<typeof createBlogMap> } = {}) {
  const blogs = options.blogs || getBlogs();
  const blogMap = options.blogMap || createBlogMap(blogs);
  return enrichPosts(getPosts(), blogMap);
}

export async function getStatusCacheSafe(): Promise<StatusCache> {
  try {
    const mod = await import('../../data/cache/status.json');
    const data = (mod.default || mod) as Partial<StatusCache>;
    return {
      lastUpdated: data.lastUpdated ?? null,
      feeds: Array.isArray(data.feeds) ? data.feeds : [],
      summary: {
        total: Number(data.summary?.total || 0),
        healthy: Number(data.summary?.healthy || 0),
        errors: Number(data.summary?.errors || 0),
      },
    };
  } catch {
    return EMPTY_STATUS;
  }
}

