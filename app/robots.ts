import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /booking/ holds a secret token in the path; /admin and /api are nobody's business.
      // These pages also send noindex — this is belt and braces, not the only control.
      disallow: ['/admin', '/api', '/booking/', '/login'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
