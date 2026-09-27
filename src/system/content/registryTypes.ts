import type { z } from 'zod';
import type { PageContent } from './pageContentSchema';

/** Entry types of the generated registries in `src/generated/` (see `npm run generate`). */

export type ModuleRegistryEntry = {
  schema: z.ZodType;
};

export type PageRegistryEntry = {
  repoPath: string;
  content: PageContent;
};

export type PageLink = {
  pathname: string;
  label: string;
};
