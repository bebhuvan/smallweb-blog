export type Blog = {
  id: string;
  name: string;
  url: string;
  categories?: string[];
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
