import Image from 'next/image'
import { ArrowRight, Clock } from 'lucide-react'
import { Container } from '@/components/ui/container'
import { ButtonLink } from '@/components/ui/button'
import { brand } from '@/lib/brand'

/**
 * Full-width hero.
 *
 * The light blue is a CSS colour, not part of the photograph. That is what lets the
 * background extend edge to edge at any viewport width without a wide banner image that
 * would be cropped on a phone and oversized on a desktop.
 *
 * The photo is positioned right and the copy left, so the subject never sits under text.
 * Below `lg` the layout stacks: copy first, image beneath, because a hero that puts a
 * face above the headline on a 360px screen pushes the call to action off the fold.
 */

/**
 * Sampled from the photograph's own backdrop so the CSS colour and the image meet
 * invisibly. Resample these two if you swap the photo — a mismatch shows as a hard seam
 * down the middle of the hero.
 *
 * These are fixed rather than theme tokens: the photograph is bright regardless of the
 * viewer's colour scheme, so the hero is a deliberate light island in dark mode. The text
 * colours below are pinned for the same reason.
 */
const HERO_BG = '#f4f1ec'
const HERO_BG_WARM = '#eae4db'
const HERO_INK = '#2b2724'
const HERO_INK_SOFT = '#5a534b'

export function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ backgroundColor: HERO_BG }}
      aria-labelledby="hero-heading"
    >
      {/* Soft vignette so the flat colour doesn't read as a plain block. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 80% at 78% 45%, ${HERO_BG_WARM} 0%, transparent 62%)`,
        }}
        aria-hidden="true"
      />

      <Container className="relative">
        <div className="grid items-center gap-10 py-16 sm:py-20 lg:min-h-[36rem] lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:py-0">
          {/* ── Copy, deliberately left ───────────────────────────────────── */}
          <div className="max-w-xl">
            <p
              className="text-2xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: HERO_INK_SOFT }}
            >
              {brand.city} · Skin &amp; wellness studio
            </p>

            <h1
              id="hero-heading"
              className="mt-5 font-display text-[2.75rem] leading-[1.05] tracking-tight sm:text-6xl lg:text-[4rem]"
              style={{ color: HERO_INK }}
            >
              {brand.tagline}
            </h1>

            <p
              className="mt-6 max-w-md text-lg leading-relaxed"
              style={{ color: HERO_INK_SOFT }}
            >
              {brand.description}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink
                href="/book"
                size="lg"
                className="w-full bg-[#2b2724] text-[#f4f1ec] hover:bg-[#1a1715] sm:w-auto"
              >
                Book an appointment
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink
                href="/services"
                size="lg"
                variant="secondary"
                className="w-full border-[#2b2724]/15 bg-white/70 text-[#2b2724] backdrop-blur hover:bg-white sm:w-auto"
              >
                See treatments
              </ButtonLink>
            </div>

            <p
              className="mt-6 flex items-center gap-2 text-sm"
              style={{ color: HERO_INK_SOFT }}
            >
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              Takes about a minute. All times {brand.timezoneLabel}.
            </p>
          </div>

          {/* ── Photograph, right ─────────────────────────────────────────── */}
          <div className="relative -mx-5 h-72 sm:-mx-8 sm:h-96 lg:mx-0 lg:h-full lg:min-h-[36rem]">
            <Image
              src="/hero.jpg"
              alt=""
              fill
              // Above the fold, so it must not lazy-load — this is the LCP element.
              priority
              // Tells the browser it only ever needs about half the viewport on desktop,
              // so it downloads a smaller file than the full width would imply.
              sizes="(max-width: 1024px) 100vw, 50vw"
              /*
                Focus the crop on her face and shoulders rather than the centre of the
                frame. The desktop container is close to square while the source is wide,
                so a centred crop would cut her awkwardly and foreground the product
                bottles — whose labels are misspelt in this photograph.
              */
              className="object-cover object-[54%_28%] lg:object-[56%_26%]"
            />
            {/*
              Feathers the photo's left edge into the CSS colour, so the join reads as a
              gradient rather than a hard seam where the two tones don't quite match.
            */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-24 lg:w-40"
              style={{ background: `linear-gradient(to right, ${HERO_BG}, transparent)` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </Container>
    </section>
  )
}
