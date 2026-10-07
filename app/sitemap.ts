import type { MetadataRoute } from 'next';
import { pageLinks } from '@/src/generated/pageLinks';
import { siteUrl } from '@/src/project/config/siteUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  return pageLinks.map(({ pathname }) => ({ url: new URL(pathname, siteUrl).href }));
}
