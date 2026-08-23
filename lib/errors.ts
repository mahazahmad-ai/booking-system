/**
 * Domain errors the route layer maps to HTTP responses.
 *
 * Each carries a stable `code` the UI can switch on, and a message already safe to show a
 * customer — never a stack trace, never a raw database error.
 */

export type BookingErrorCode =
  | 'SLOT_TAKEN'
  | 'TIME_OFF'
  | 'TOO_SOON'
  | 'TOO_FAR'
  | 'IN_PAST'
  | 'CANCEL_WINDOW_CLOSED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INVALID'

export class BookingError extends Error {
  constructor(
    readonly code: BookingErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'BookingError'
  }
}

/**
 * The slot went while the customer was typing.
 *
 * Raised when the exclusion constraint rejects the insert — after every qualified staff
 * member has been tried. The UI turns this into a refreshed slot list and a plain
 * sentence, never a stack trace and never a silent failure.
 */
export class SlotTakenError extends BookingError {
  constructor() {
    super('SLOT_TAKEN', 'That time was just booked. Here are the times still open.', 409)
  }
}

/** The trigger rejected the booking because it lands on time off. */
export class TimeOffConflictError extends BookingError {
  constructor() {
    super('TIME_OFF', 'That time is no longer available. Please choose another.', 409)
  }
}

export class PolicyError extends BookingError {
  constructor(code: BookingErrorCode, message: string) {
    super(code, message, 422)
  }
}

export class NotFoundError extends BookingError {
  constructor(message = 'Not found.') {
    super('NOT_FOUND', message, 404)
  }
}

export class RateLimitedError extends BookingError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', 'Too many attempts. Please try again shortly.', 429)
  }
}
