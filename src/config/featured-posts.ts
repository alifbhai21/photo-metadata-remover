export const FEATURED_POSTS = [
  'what-is-photo-metadata',
  'what-information-is-hidden-in-a-photo',
  'how-to-remove-exif-data',
  'what-is-exif-data',
  'can-photos-reveal-your-location',
] as const;

export type FeaturedPostSlug = (typeof FEATURED_POSTS)[number];
