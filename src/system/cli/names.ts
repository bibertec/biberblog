/** Naming conventions shared by generators, templates and codemods. */

export function toCamelCase(slug: string): string {
  return slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function toPascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Variable name of the imported page content JSON in the page file: `about-us` → `aboutUsContent`. */
export function pageContentVarFor(pageSlug: string): string {
  return `${toCamelCase(pageSlug)}Content`;
}

export function pagePathFor(pageSlug: string): string {
  return pageSlug === 'home' ? 'app/page.tsx' : `app/${pageSlug}/page.tsx`;
}

/** Default page label from the slug: `about-us` → `About us` (`home` → `Home`). */
export function defaultPageLabel(pageSlug: string): string {
  if (pageSlug === 'home') return 'Home';
  const words = pageSlug.replace(/-/g, ' ');

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function pathnameFor(pageSlug: string): string {
  return pageSlug === 'home' ? '/' : `/${pageSlug}`;
}
