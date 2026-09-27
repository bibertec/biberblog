import { z } from 'zod';
// Relative import with `.ts` extension on purpose: `npm run generate` loads this file via plain Node.
import { seoSchema } from './seo.ts';

const moduleEntrySchema = z.object({
  type: z.string(),
  content: z.unknown(),
});

export const pageContentSchema = z.object({
  /** Name of the page in the editor (e.g. the page list of the link dialog) – not shown on the website. */
  label: z.string().trim().min(1),
  seo: seoSchema,
  modules: z.record(z.string(), moduleEntrySchema),
});

export type PageContent = z.infer<typeof pageContentSchema>;
