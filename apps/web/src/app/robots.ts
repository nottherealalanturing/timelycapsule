import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Authenticated app surfaces and the private-link reveal pages have
      // nothing for a crawler to usefully index and shouldn't appear in
      // search results.
      disallow: ['/home', '/capsule/', '/settings/', '/c/', '/try/capsule/', '/received', '/people', '/collections', '/archive', '/trash'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
