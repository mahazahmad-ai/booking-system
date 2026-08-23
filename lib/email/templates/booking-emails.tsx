import { Button, Hr, Section, Text } from '@react-email/components'
import { DetailRow, EmailShell, Footer, styles } from './shared'

/**
 * Every customer-facing and staff-facing email.
 *
 * All times arrive pre-formatted as local strings from the caller. These components never
 * touch a Date, so there is no chance of an email rendering a different hour than the
 * confirmation page.
 */

export type BookingEmailData = {
  businessName: string
  businessPhone: string
  customerName: string
  serviceName: string
  staffName: string
  /** e.g. "Thursday, 26 August 2026" */
  dateLabel: string
  /** e.g. "11:30 – 12:30 (Asia/Karachi)" */
  timeLabel: string
  reference: string
  manageUrl: string
  priceLabel: string
  note?: string | null
}

export function BookingConfirmation(props: BookingEmailData & { requiresApproval?: boolean }) {
  const { requiresApproval } = props

  return (
    <EmailShell
      preview={`${requiresApproval ? 'Requested' : 'Confirmed'}: ${props.serviceName} on ${props.dateLabel}`}
    >
      <Text style={styles.heading}>
        {requiresApproval ? 'We’ve got your request' : 'You’re booked in'}
      </Text>
      <Text style={styles.paragraph}>
        {requiresApproval
          ? `Thanks ${props.customerName}. We're holding this time for you and will confirm shortly.`
          : `Thanks ${props.customerName}. Here are the details, and there's a calendar invite attached.`}
      </Text>

      <Text style={styles.label}>Reference</Text>
      <Text style={styles.reference}>{props.reference}</Text>

      <Hr style={styles.hr} />

      <DetailRow label="Treatment" value={props.serviceName} />
      <DetailRow label="When" value={`${props.dateLabel}, ${props.timeLabel}`} />
      <DetailRow label="With" value={props.staffName} />
      <DetailRow label="Price" value={props.priceLabel} />
      {props.note ? <DetailRow label="Your note" value={props.note} /> : null}

      <Section style={{ margin: '8px 0 0' }}>
        <Button href={props.manageUrl} style={styles.button}>
          Change or cancel
        </Button>
      </Section>
      <Text style={{ ...styles.footer, margin: '12px 0 0' }}>
        That link is private to you — please don&rsquo;t forward it.
      </Text>

      <Footer businessName={props.businessName} phone={props.businessPhone} />
    </EmailShell>
  )
}

export function BookingCancelled(props: BookingEmailData & { reason?: string | null }) {
  return (
    <EmailShell preview={`Cancelled: ${props.serviceName} on ${props.dateLabel}`}>
      <Text style={styles.heading}>Your appointment is cancelled</Text>
      <Text style={styles.paragraph}>
        {props.customerName}, we&rsquo;ve cancelled the appointment below. Nothing further to
        do — and you&rsquo;re very welcome to book another time.
      </Text>

      <Text style={styles.label}>Reference</Text>
      <Text style={styles.reference}>{props.reference}</Text>

      <Hr style={styles.hr} />

      <DetailRow label="Was" value={`${props.serviceName}, ${props.dateLabel}, ${props.timeLabel}`} />
      {props.reason ? <DetailRow label="Reason" value={props.reason} /> : null}

      <Footer businessName={props.businessName} phone={props.businessPhone} />
    </EmailShell>
  )
}

export function BookingRescheduled(
  props: BookingEmailData & { previousLabel: string },
) {
  return (
    <EmailShell preview={`Moved: ${props.serviceName} is now ${props.dateLabel}`}>
      <Text style={styles.heading}>Your appointment has moved</Text>
      <Text style={styles.paragraph}>
        {props.customerName}, your appointment is now at the time below. The updated calendar
        invite is attached — accepting it will replace the old entry.
      </Text>

      <Text style={styles.label}>Reference</Text>
      <Text style={styles.reference}>{props.reference}</Text>

      <Hr style={styles.hr} />

      <DetailRow label="Now" value={`${props.dateLabel}, ${props.timeLabel}`} />
      <DetailRow label="Previously" value={props.previousLabel} />
      <DetailRow label="Treatment" value={props.serviceName} />
      <DetailRow label="With" value={props.staffName} />

      <Section style={{ margin: '8px 0 0' }}>
        <Button href={props.manageUrl} style={styles.button}>
          View appointment
        </Button>
      </Section>

      <Footer businessName={props.businessName} phone={props.businessPhone} />
    </EmailShell>
  )
}

export function BookingReminder(props: BookingEmailData) {
  return (
    <EmailShell preview={`Tomorrow: ${props.serviceName} at ${props.timeLabel}`}>
      <Text style={styles.heading}>See you tomorrow</Text>
      <Text style={styles.paragraph}>
        {props.customerName}, a quick reminder about your appointment.
      </Text>

      <DetailRow label="When" value={`${props.dateLabel}, ${props.timeLabel}`} />
      <DetailRow label="Treatment" value={props.serviceName} />
      <DetailRow label="With" value={props.staffName} />

      <Section style={{ margin: '8px 0 0' }}>
        <Button href={props.manageUrl} style={styles.button}>
          Change or cancel
        </Button>
      </Section>

      <Footer businessName={props.businessName} phone={props.businessPhone} />
    </EmailShell>
  )
}

/** FR-N2 — the assigned therapist and the owner need to know, immediately. */
export function StaffAlert(
  props: BookingEmailData & { kind: 'NEW' | 'CANCELLED' | 'RESCHEDULED'; customerEmail: string; customerPhone: string | null },
) {
  const headline =
    props.kind === 'NEW'
      ? 'New booking'
      : props.kind === 'CANCELLED'
        ? 'Booking cancelled'
        : 'Booking moved'

  return (
    <EmailShell preview={`${headline}: ${props.serviceName}, ${props.dateLabel}`}>
      <Text style={styles.heading}>{headline}</Text>
      <Text style={styles.paragraph}>
        {props.staffName} · {props.reference}
      </Text>

      <Hr style={styles.hr} />

      <DetailRow label="When" value={`${props.dateLabel}, ${props.timeLabel}`} />
      <DetailRow label="Treatment" value={props.serviceName} />
      <DetailRow label="Customer" value={props.customerName} />
      <DetailRow label="Contact" value={`${props.customerEmail}${props.customerPhone ? ` · ${props.customerPhone}` : ''}`} />
      {props.note ? <DetailRow label="Note" value={props.note} /> : null}

      <Footer businessName={props.businessName} phone={props.businessPhone} />
    </EmailShell>
  )
}
