export type CategorySlug =
  | 'tech'
  | 'design'
  | 'life'
  | 'culture'
  | 'economics'
  | 'finance'
  | 'history'
  | 'psychology'
  | 'philosophy'
  | 'science';

export type CategoryDefinition = {
  slug: CategorySlug;
  name: string;
  description: string;
  colorVar: `--${CategorySlug}`;
};

export const CATEGORIES: CategoryDefinition[] = [
  {
    slug: 'tech',
    name: 'Tech',
    description: 'Code, tools, and digital innovation',
    colorVar: '--tech',
  },
  {
    slug: 'design',
    name: 'Design',
    description: 'Creativity, aesthetics, and user experience',
    colorVar: '--design',
  },
  {
    slug: 'life',
    name: 'Life',
    description: 'Personal growth, career, and daily reflections',
    colorVar: '--life',
  },
  {
    slug: 'culture',
    name: 'Culture',
    description: 'Society, trends, and the human experience',
    colorVar: '--culture',
  },
  {
    slug: 'economics',
    name: 'Economics',
    description: 'Policy, markets, and the science of choices',
    colorVar: '--economics',
  },
  {
    slug: 'finance',
    name: 'Finance',
    description: 'Investing, markets, and financial thinking',
    colorVar: '--finance',
  },
  {
    slug: 'history',
    name: 'History',
    description: 'Lessons and narratives from the past',
    colorVar: '--history',
  },
  {
    slug: 'psychology',
    name: 'Psychology',
    description: 'Understanding the mind and behavior',
    colorVar: '--psychology',
  },
  {
    slug: 'philosophy',
    name: 'Philosophy',
    description: 'Wisdom, ethics, and first principles',
    colorVar: '--philosophy',
  },
  {
    slug: 'science',
    name: 'Science',
    description: 'Physics, cosmology, and the nature of reality',
    colorVar: '--science',
  },
];

export const CATEGORY_SLUGS = CATEGORIES.map((category) => category.slug);

export const CATEGORY_MAP = new Map<CategorySlug, CategoryDefinition>(
  CATEGORIES.map((category) => [category.slug, category])
);

export const HOMEPAGE_CATEGORY_SLUGS: CategorySlug[] = [
  'tech',
  'culture',
  'life',
  'design',
  'economics',
  'finance',
  'history',
  'philosophy',
  'psychology',
  'science',
];

export const PROSE_CATEGORY_SLUGS: CategorySlug[] = [
  'philosophy',
  'culture',
  'life',
  'psychology',
  'history',
];
