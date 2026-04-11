import { getBlogMap, getBlogs, getEnrichedPosts } from './site-data';

export function getArchiveData() {
  const blogs = getBlogs();
  const blogMap = getBlogMap(blogs);

  const now = new Date();
  const currentYear = now.getFullYear();
  const MIN_YEAR = currentYear - 2;
  const MAX_YEAR = currentYear + 1;

  // Drop posts with garbage RSS dates (year outside reasonable window).
  const allPosts = getEnrichedPosts({ blogs, blogMap })
    .filter((p) => {
      const d = new Date(p.date);
      if (Number.isNaN(d.getTime())) return false;
      const y = d.getFullYear();
      return y >= MIN_YEAR && y <= MAX_YEAR;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const years = Array.from(new Set(allPosts.map((p) => new Date(p.date).getFullYear())))
    .sort((a, b) => b - a);

  const earliestYear = years[years.length - 1] || currentYear;

  return {
    allPosts,
    years,
    currentYear,
    earliestYear,
    totalPosts: allPosts.length,
    totalWriters: blogs.length,
  };
}

export const ARCHIVE_YEAR_LIMIT = 1000;

export function postsForYear<T extends { date: string }>(
  posts: T[],
  year: number,
  limit = ARCHIVE_YEAR_LIMIT
) {
  return posts.filter((p) => new Date(p.date).getFullYear() === year).slice(0, limit);
}

export function totalForYear<T extends { date: string }>(posts: T[], year: number) {
  return posts.filter((p) => new Date(p.date).getFullYear() === year).length;
}
