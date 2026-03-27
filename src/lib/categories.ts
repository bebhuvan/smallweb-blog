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
  washVar: `--${CategorySlug}-wash`;
};

export const CATEGORIES: CategoryDefinition[] = [
  {
    slug: 'tech',
    name: 'Tech',
    description: 'Code, tools, and digital innovation',
    colorVar: '--tech',
    washVar: '--tech-wash',
  },
  {
    slug: 'design',
    name: 'Design',
    description: 'Creativity, aesthetics, and user experience',
    colorVar: '--design',
    washVar: '--design-wash',
  },
  {
    slug: 'life',
    name: 'Life',
    description: 'Personal growth, career, and daily reflections',
    colorVar: '--life',
    washVar: '--life-wash',
  },
  {
    slug: 'culture',
    name: 'Culture',
    description: 'Society, trends, and the human experience',
    colorVar: '--culture',
    washVar: '--culture-wash',
  },
  {
    slug: 'economics',
    name: 'Economics',
    description: 'Policy, markets, and the science of choices',
    colorVar: '--economics',
    washVar: '--economics-wash',
  },
  {
    slug: 'finance',
    name: 'Finance',
    description: 'Investing, markets, and financial thinking',
    colorVar: '--finance',
    washVar: '--finance-wash',
  },
  {
    slug: 'history',
    name: 'History',
    description: 'Lessons and narratives from the past',
    colorVar: '--history',
    washVar: '--history-wash',
  },
  {
    slug: 'psychology',
    name: 'Psychology',
    description: 'Understanding the mind and behavior',
    colorVar: '--psychology',
    washVar: '--psychology-wash',
  },
  {
    slug: 'philosophy',
    name: 'Philosophy',
    description: 'Wisdom, ethics, and first principles',
    colorVar: '--philosophy',
    washVar: '--philosophy-wash',
  },
  {
    slug: 'science',
    name: 'Science',
    description: 'Physics, cosmology, and the nature of reality',
    colorVar: '--science',
    washVar: '--science-wash',
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
