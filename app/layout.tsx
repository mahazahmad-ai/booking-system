import type { Metadata } from 'next'
import { Inter, Instrument_Serif } from 'next/font/google'
import { brand } from '@/lib/brand'
import './globals.css'

/**
 * next/font self-hosts and inlines the font files at build time: no request to
 * fonts.googleapis.com, no render-blocking stylesheet, and `display: swap` plus a
 * matched fallback keeps CLS at zero. Both are load-bearing for the SEO and
 * mobile-performance targets (NFR-5, NFR-8).
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${brand.name} — Book online`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  openGraph: {
    title: `${brand.name} — Book online`,
    description: brand.description,
    url: siteUrl,
    siteName: brand.name,
    locale: 'en_PK',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
