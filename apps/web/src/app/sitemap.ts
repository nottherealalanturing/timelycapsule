import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';
import { HELP_ARTICLES } from '../lib/marketing/help';
import { OCCASIONS } from '../lib/marketing/occasions';

/**
 * T-21 filled in the marketing surface, so the sitemap now lists it all.
 * `/legal/*` stays out until the reviewed documents are pasted in (the pages
 * are `noindex` placeholders — listing them would advertise stubs).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    ...OCCASIONS.map((o) => ({
      url: `${SITE_URL}/for/${o.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...HELP_ARTICLES.map((a) => ({
      url: `${SITE_URL}/help/${a.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    { url: `${SITE_URL}/try`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
