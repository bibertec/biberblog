import type { MetadataRoute } from 'next';
import { siteUrl } from '@/src/project/config/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
