import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

/**
 * Shared shell for every transactional email.
 *
 * Deliberately plain: system fonts, no web fonts, no images, table-free layout. Email
 * clients are a hostile rendering target and a confirmation that arrives ugly still works,
 * whereas one that fails to render does not. Colours are inlined rather than tokenised —
 * email has no CSS custom property support worth relying on.
 */

const INK = '#1a1815'
const MUTED = '#5c5750'
const LINE = '#e5e1da'
const ACCENT = '#1f4d3d'
const CANVAS = '#faf9f7'

export const styles = {
  body: {
    backgroundColor: CANVAS,
    color: INK,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: '24px 0',
  },
  container: {
    backgroundColor: '#ffffff',
    border: `1px solid ${LINE}`,
    borderRadius: '12px',
    margin: '0 auto',
    maxWidth: '560px',
    padding: '32px',
  },
  heading: { color: INK, fontSize: '24px', fontWeight: 600, margin: '0 0 8px' },
  paragraph: { color: MUTED, fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' },
  label: {
    color: '#8b857c',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    margin: '0 0 4px',
    textTransform: 'uppercase' as const,
  },
  value: { color: INK, fontSize: '15px', fontWeight: 500, margin: '0 0 16px' },
  reference: {
    color: ACCENT,
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    margin: '0 0 24px',
  },
  button: {
    backgroundColor: ACCENT,
    borderRadius: '8px',
    color: '#faf9f7',
    display: 'inline-block',
    fontSize: '15px',
    fontWeight: 500,
    padding: '12px 24px',
    textDecoration: 'none',
  },
  hr: { borderColor: LINE, margin: '24px 0' },
  footer: { color: '#8b857c', fontSize: '13px', lineHeight: '20px', margin: 0 },
}

export function EmailShell({
  preview,
  children,
}: {
  preview: string
  children: React.ReactNode
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>{children}</Container>
      </Body>
    </Html>
  )
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Section>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </Section>
  )
}

export function Footer({ businessName, phone }: { businessName: string; phone: string }) {
  return (
    <>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        {businessName} · {phone}
        <br />
        You&rsquo;re receiving this because you booked an appointment with us. We don&rsquo;t
        send marketing email.
      </Text>
    </>
  )
}
