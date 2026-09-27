'use server';

import { pageRegistry } from '@/src/generated/pageRegistry';
import type { PageRegistryEntry } from '@/src/system/content/registryTypes';
import type { PageSeo } from '@/src/system/content/seo';
import { checkEditorSession } from '@/src/system/lib/auth/actions';
import { translations } from '@/src/project/config/translations';

export type SeoPage = {
  pathname: string;
  label: string;
  seo: PageSeo;
};

export type SeoPagesResult =
  | { success: true; pages: SeoPage[] }
  | { success: false; error: string };

/**
 * Published SEO values of all pages for the SEO dialog – the state of the last build, i.e. the same
 * base the publish merge uses. Loaded on demand so the client bundle does not contain them.
 */
export async function loadSeoPages(): Promise<SeoPagesResult> {
  const isAuthenticated = await checkEditorSession();
  if (!isAuthenticated) {
    return { success: false, error: translations.errors.notAuthenticated };
  }
  const registry = pageRegistry as Record<string, PageRegistryEntry>;
  const pages = Object.entries(registry).map(([pathname, { content }]) => ({
    pathname,
    label: content.label,
    seo: content.seo,
  }));

  return { success: true, pages };
}
