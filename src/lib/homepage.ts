import { pickFeaturedPost, type Blog, type EnrichedPost } from './posts';

const PROSE_CATEGORIES = ['philosophy', 'culture', 'life', 'psychology', 'history'];
const HOMEPAGE_CATEGORIES = ['tech', 'culture', 'life', 'design', 'economics', 'finance', 'history', 'philosophy', 'psychology', 'science'];

export type HomepageCuration<T extends EnrichedPost = EnrichedPost> = {
  leadPost: T | null;
  secondaryLead: T | null;
  alsoNew: T[];
  featuredExcerpt: T | null;
  categoryPosts: Map<string, T[]>;
  archivePicks: T[];
  allCategories: string[];
};

export function curateHomepage<T extends EnrichedPost & { id?: string; excerpt?: string }>(
  enrichedPosts: T[],
  blogMap: Map<string, Blog>
): HomepageCuration<T> {
  const usedIds = new Set<string>();

  const leadPick = pickFeaturedPost(enrichedPosts, blogMap, { minExcerptLength: 0 });
  const leadPost = (leadPick.featured || enrichedPosts[0] || null) as T | null;
  if (leadPost?.id) usedIds.add(leadPost.id);

  const secondaryLead = enrichedPosts.find((p) =>
    (!p.id || !usedIds.has(p.id)) && p.category !== leadPost?.category
  ) || null;
  if (secondaryLead?.id) usedIds.add(secondaryLead.id);

  const alsoNew = enrichedPosts.filter((p) => !p.id || !usedIds.has(p.id)).slice(0, 5);
  for (const post of alsoNew) {
    if (post.id) usedIds.add(post.id);
  }

  const featuredExcerpt = enrichedPosts
    .filter((p) =>
      PROSE_CATEGORIES.includes(p.category) &&
      Boolean(p.excerpt) &&
      (p.excerpt?.length || 0) > 80 &&
      (!p.id || !usedIds.has(p.id))
    )
    .sort((a, b) => (b.excerpt?.length || 0) - (a.excerpt?.length || 0))[0] || null;
  if (featuredExcerpt?.id) usedIds.add(featuredExcerpt.id);

  const categoryPosts = new Map<string, T[]>();
  for (const cat of HOMEPAGE_CATEGORIES) {
    const catPosts = enrichedPosts
      .filter((p) => p.category === cat && (!p.id || !usedIds.has(p.id)))
      .slice(0, 5);
    for (const post of catPosts) {
      if (post.id) usedIds.add(post.id);
    }
    categoryPosts.set(cat, catPosts);
  }

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );

  const archiveCandidates = enrichedPosts.filter((p) => {
    if (p.id && usedIds.has(p.id)) return false;
    return new Date(p.date) < twoWeeksAgo;
  });

  const archivePicks: T[] = [];
  const archiveCatsUsed = new Set<string>();
  const rotatedCategories = [...HOMEPAGE_CATEGORIES].sort((a, b) => {
    const ai = (HOMEPAGE_CATEGORIES.indexOf(a) + dayOfYear) % HOMEPAGE_CATEGORIES.length;
    const bi = (HOMEPAGE_CATEGORIES.indexOf(b) + dayOfYear) % HOMEPAGE_CATEGORIES.length;
    return ai - bi;
  });

  for (const cat of rotatedCategories) {
    if (archivePicks.length >= 5) break;
    const candidate = archiveCandidates.find((p) => p.category === cat && !archiveCatsUsed.has(cat));
    if (!candidate) continue;
    archivePicks.push(candidate);
    archiveCatsUsed.add(cat);
    if (candidate.id) usedIds.add(candidate.id);
  }

  return {
    leadPost,
    secondaryLead,
    alsoNew,
    featuredExcerpt,
    categoryPosts,
    archivePicks,
    allCategories: [...HOMEPAGE_CATEGORIES],
  };
}

