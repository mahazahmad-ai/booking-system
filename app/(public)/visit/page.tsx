import type { Metadata } from 'next'
import { Mail, MapPin, Phone } from 'lucide-react'
import { Container, Section, Eyebrow } from '@/components/ui/container'
import { ButtonLink } from '@/components/ui/button'
import { brand } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Visit',
  description: `Where to find ${brand.name} in ${brand.city}, opening hours, parking and contact details.`,
}

const practicalities = [
  {
    title: 'Getting here',
    body: 'Second floor, above the pharmacy. The entrance is the glass door to the left of the shopfront — there is a lift.',
  },
  {
    title: 'Parking',
    body: 'Street parking along Khayaban-e-Bukhari, free after 18:00. The lane behind the building is usually quieter.',
  },
  {
    title: 'Arriving',
    body: 'Come five minutes early if it is your first visit — there is a short form. After that, just come at your time.',
  },
  {
    title: 'Running late',
    body: 'Call rather than rebook. We can usually still fit you in if you let us know before your slot starts.',
  },
]

export default function VisitPage() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-16 sm:py-20">
          <Eyebrow>Visit</Eyebrow>
          <h1 className="mt-5 max-w-2xl font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Where to find us
          </h1>
        </Container>
      </section>

      <Section>
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7">
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <MapPin className="size-4 text-accent" aria-hidden="true" />
                Address
              </h2>
              <address className="mt-4 space-y-1 text-sm not-italic leading-relaxed text-ink-muted">
                <p>{brand.address.line1}</p>
                <p>{brand.address.line2}</p>
                <p>{brand.address.city}</p>
                <p>Pakistan</p>
              </address>

              <div className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
                <a
                  href={`tel:${brand.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  <Phone className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  {brand.phone}
                </a>
                <a
                  href={`mailto:${brand.email}`}
                  className="flex items-center gap-2 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  <Mail className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  {brand.email}
                </a>
              </div>
            </div>

            <div className="mt-5 rounded-[var(--radius-card)] border border-line bg-surface p-7">
              <h2 className="text-base font-semibold text-ink">Opening hours</h2>
              <dl className="mt-4 space-y-2.5 text-sm">
                {brand.openingHours.map((row) => (
                  <div key={row.days} className="flex justify-between gap-4">
                    <dt className="text-ink-muted">{row.days}</dt>
                    <dd className="tabular-nums text-ink">{row.hours}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 border-t border-line pt-4 text-xs text-ink-subtle">
                All appointment times are shown in {brand.timezoneLabel}.
              </p>
            </div>
          </div>

          <div>
            <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2">
              {practicalities.map((item) => (
                <div key={item.title} className="bg-surface p-7">
                  <dt className="text-base font-semibold text-ink">{item.title}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</dd>
                </div>
              ))}
            </dl>

            {/*
              No embedded map. A third-party iframe would load tracking scripts and leak the
              referrer — and this page is one click from the manage link, where that matters
              more (NFR-7). A plain address and a link do the job.
            */}
            <div className="mt-5 rounded-[var(--radius-card)] bg-accent px-8 py-12 text-center">
              <h2 className="font-display text-3xl leading-tight text-accent-ink">
                Ready when you are
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-accent-ink/75">
                Live availability for every therapist, and you can change it yourself
                afterwards.
              </p>
              <ButtonLink
                href="/book"
                size="lg"
                className="mt-7 bg-accent-ink text-accent hover:bg-accent-ink/90"
              >
                Book an appointment
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  )
}
