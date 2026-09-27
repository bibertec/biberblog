import { pageLinks } from '@/src/generated/pageLinks';

/**
 * Lightweight list of all pages (path + label) for the richtext link dialog, the "Pages" flyout of the
 * editor navbar and the validation of internal links. Generated separately from `pageRegistry` so that the client does not load the
 * complete content JSON of every page into its bundle.
 */
export { pageLinks };

export type PagePathname = (typeof pageLinks)[number]['pathname'];

export function isKnownPagePath(href: string): boolean {
  return pageLinks.some((page) => page.pathname === href);
}
