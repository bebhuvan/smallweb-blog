export type Blog = {
  id: string;
  name: string;
  url: string;
  categories?: string[];
  allowMissingDates?: boolean;
};

export type Post = {
  blogId: string;
  date: string;
};

export type EnrichedPost<T extends Post = Post> = T & {
  blogName: string;
  blogUrl: string;
  category: string;
  blogCategories: string[];
};

export function createBlogMap(blogs: Blog[]) {
  return new Map(blogs.map((blog) => [blog.id, blog]));
}

export function enrichPosts<T extends Post>(
  posts: T[],
  blogMap: Map<string, Blog>,
  options: { categoryOverride?: string } = {}
): EnrichedPost<T>[] {
  const { categoryOverride } = options;
  return posts.map((post) => {
    const blog = blogMap.get(post.blogId);
    const blogCategories = blog?.categories || [];
    const category = categoryOverride || blogCategories[0] || 'tech';
    return {
      ...post,
      blogName: blog?.name || '',
      blogUrl: blog?.url || '',
      category,
      blogCategories,
    };
  });
}

type FeaturedOptions = {
  maxFutureDays?: number;
  recentDays?: number;
  minExcerptLength?: number;
  deprioritizeMissingDates?: boolean;
};

export function pickFeaturedPost<T extends Post & { excerpt?: string; id?: string }>(
  posts: T[],
  blogMap: Map<string, Blog>,
  options: FeaturedOptions = {}
) {
  const {
    maxFutureDays = 2,
    recentDays = 14,
    minExcerptLength = 80,
    deprioritizeMissingDates = true,
  } = options;

  const nowMs = Date.now();
  const futureCutoffMs = nowMs + maxFutureDays * 24 * 60 * 60 * 1000;
  const recentCutoffMs = nowMs - recentDays * 24 * 60 * 60 * 1000;

  const candidates = posts
    .map((post) => {
      const dateMs = new Date(post.date).getTime();
      if (Number.isNaN(dateMs)) return null;
      const blog = blogMap.get(post.blogId);
      const excerptLength = typeof post.excerpt === 'string' ? post.excerpt.trim().length : 0;
      return {
        post,
        dateMs,
        allowMissingDates: Boolean(blog?.allowMissingDates),
        excerptLength,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => item.dateMs <= futureCutoffMs);

  const rank = (a: (typeof candidates)[number], b: (typeof candidates)[number]) => {
    const aHasExcerpt = a.excerptLength >= minExcerptLength ? 1 : 0;
    const bHasExcerpt = b.excerptLength >= minExcerptLength ? 1 : 0;
    if (aHasExcerpt !== bHasExcerpt) return bHasExcerpt - aHasExcerpt;
    if (deprioritizeMissingDates && a.allowMissingDates !== b.allowMissingDates) {
      return a.allowMissingDates ? 1 : -1;
    }
    return b.dateMs - a.dateMs;
  };

  const recentCandidates = candidates.filter((item) => item.dateMs >= recentCutoffMs);
  const pool = recentCandidates.length > 0 ? recentCandidates : candidates;
  const featured = pool.sort(rank)[0]?.post ?? null;

  if (!featured) {
    return { featured: null as T | null, remaining: posts };
  }

  const remaining = posts.filter((post) => (post.id ? post.id !== featured.id : post !== featured));
  return { featured: featured as T, remaining };
}
