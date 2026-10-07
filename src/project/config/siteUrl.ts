/**
 * Absolute origin for robots.txt and sitemap.xml. On Vercel this is the production domain
 * (custom domain if configured); locally it falls back to the Next.js default port.
 */
export const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';
