import type { MetadataRoute } from 'next'
import { getBusiness, listServices } from '@/lib/repositories/catalogue.repo'

/**
 * NFR-8. Only the pages worth indexing: the marketing pages and one entry per treatment.
 *
 * Deliberately absent: /booking/[token] (a secret in the path) and everything under
 * /admin. Both are also noindex, but a sitemap that advertises them would undo that.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/services`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/team`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/visit`, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${base}/book`, changeFrequency: 'daily', priority: 0.9 },
  ]

  try {
    const business = await getBusiness()
    const services = await listServices(business.id)
    return [
      ...staticPages,
      ...services.map((service) => ({
        url: `${base}/book?service=${service.slug}`,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ]
  } catch {
    // A sitemap that omits treatments beats a build that fails because the database is
    // briefly unreachable.
    return staticPages
  }
}
