import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container, Section, Eyebrow } from '@/components/ui/container'
import { brand } from '@/lib/brand'
import { getBusiness, listStaff } from '@/lib/repositories/catalogue.repo'

export const metadata: Metadata = {
  title: 'Our team',
  description: `The therapists at ${brand.name} — who they are, what they do, and how to book with a specific person.`,
}

export const revalidate = 3600

/** Initials stand in for photos until real ones exist. Better than a grey silhouette. */
function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
}

export default async function TeamPage() {
  const business = await getBusiness()
  const staff = await listStaff(business.id)

  return (
    <>
      <section className="border-b border-line">
        <Container className="py-16 sm:py-20">
          <Eyebrow>Our team</Eyebrow>
          <h1 className="mt-5 max-w-2xl font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
            {staff.length === 3 ? 'Three people, and you can pick' : 'The people you’ll see'}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
            Book with someone specific, or leave it to us and we&rsquo;ll show you every time
            anyone qualified is free.
          </p>
        </Container>
      </section>

      <Section>
        <Container>
          <ul className="grid gap-5 md:grid-cols-3">
            {staff.map((person) => (
              <li key={person.id}>
                <article className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-7">
                  <div
                    className="flex size-14 items-center justify-center rounded-full bg-accent-soft font-display text-xl text-accent"
                    aria-hidden="true"
                  >
                    {initials(person.name)}
                  </div>

                  <h2 className="mt-5 font-display text-2xl leading-tight text-ink">
                    {person.name}
                  </h2>

                  <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-muted">
                    {person.bio}
                  </p>

                  <div className="mt-6 border-t border-line pt-5">
                    <h3 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                      Treatments
                    </h3>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {person.services.map(({ service }) => (
                        <li
                          key={service.slug}
                          className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink-muted"
                        >
                          {service.name}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href={`/book?staff=${person.id}`}
                    className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline"
                  >
                    Book with {person.name.split(' ')[0]}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  )
}
