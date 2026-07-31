import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

/**
 * Deliberately minimal — T-21 (marketing site) hasn't built the pricing/
 * occasion/legal pages yet, so this only lists what's real today. Extend as
 * those routes land rather than listing pages that 404.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/try`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
  ];
}
