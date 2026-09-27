import { z } from 'zod';
import type { Metadata } from 'next';

/**
 * Field id of a page's SEO draft: `draftKey(pathname, SEO_FIELD_ID)`. Cannot collide with module
 * fields, whose ids always have the form `moduleId.fieldName`.
 */
export const SEO_FIELD_ID = 'seo';

export const seoSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type PageSeo = z.infer<typeof seoSchema>;

/** Recommended maximum lengths (search result snippets) – a hint in the SEO dialog, not enforced. */
export const SEO_RECOMMENDED_LENGTH = {
  title: 60,
  description: 160,
} as const satisfies Record<keyof PageSeo, number>;

/**
 * Page metadata from the page's `seo` values: `export const metadata = pageMetadata(homeContent);`.
 * Empty values are omitted, so the defaults from `app/layout.tsx` apply.
 */
export function pageMetadata({ seo }: { seo: PageSeo }): Metadata {
  const metadata: Metadata = {};
  const title = seo.title.trim();
  const description = seo.description.trim();
  if (title) metadata.title = title;
  if (description) metadata.description = description;

  return metadata;
}
