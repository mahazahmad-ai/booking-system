-- Booking System — hand-written constraints migration
--
-- Apply AFTER the Prisma-generated table migration. Everything in this file is invisible to
-- `prisma migrate diff`, which means:
--
--   *** NEVER RUN `prisma db push` ON THIS PROJECT. ***
--
-- db push diffs schema.prisma against the live database and will silently drop every object
-- below — including the one guarantee the whole design rests on. Use `prisma migrate dev`
-- and `prisma migrate deploy` only. See docs/GAP-ANALYSIS.md [C10].
--
-- Migrations must run over the DIRECT (unpooled) Neon connection. PgBouncer transaction mode
-- cannot execute DDL. That URL lives in prisma.config.ts.

-- ============================================================================
-- 1. Extensions
-- ============================================================================

-- btree_gist is what allows an equality test (staffId) and a range-overlap test to share
-- one GiST index. Without it the exclusion constraint below cannot be created.
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ============================================================================
-- 2. Booking — internal time consistency  [GAP A1]
-- ============================================================================
--
--   startsAt / endsAt            the customer's appointment
--   blockStartsAt / blockEndsAt  the occupied window, buffers included
--
-- These CHECKs are what let the rest of the system trust the block range. If the service
-- layer ever writes an inconsistent pair, it fails loudly here instead of quietly
-- double-booking someone six weeks later.

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_appointment_window_valid
  CHECK ("endsAt" = "startsAt" + make_interval(mins => "durationMins"));

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_block_window_valid
  CHECK (
    "blockStartsAt" = "startsAt" - make_interval(mins => "bufferBeforeMins")
    AND "blockEndsAt" = "endsAt" + make_interval(mins => "bufferAfterMins")
  );

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_duration_positive
  CHECK ("durationMins" > 0 AND "bufferBeforeMins" >= 0 AND "bufferAfterMins" >= 0);

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_price_non_negative
  CHECK ("priceMinor" >= 0);

-- A cancelled booking must record when. Keeps FR-N4 and the audit trail honest.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_cancelled_has_timestamp
  CHECK (("status" <> 'CANCELLED') OR ("cancelledAt" IS NOT NULL));


-- ============================================================================
-- 3. THE constraint — no two active bookings may overlap for one staff member  [SPEC §8]
-- ============================================================================
--
-- Read as: no two rows may share a staffId and have overlapping BLOCK ranges, unless one of
-- them is cancelled, completed or a no-show.
--
-- '[)' — start-inclusive, end-exclusive. A booking ending at 14:00 and one starting at 14:00
-- do not overlap, which is exactly what back-to-back appointments require.
--
-- Note this is over blockStartsAt/blockEndsAt, NOT startsAt/endsAt. Buffers are part of the
-- occupied time; the appointment window is not.
--
-- The WHERE predicate matches §9 exactly: PENDING and CONFIRMED hold time, the other three
-- release it. That is why cancelling frees the slot with no cleanup job.
--
-- Violations arrive as SQLSTATE 23P01 (exclusion_violation) -> SlotTakenError -> HTTP 409.

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("blockStartsAt", "blockEndsAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));


-- ============================================================================
-- 4. Bookings may not land on time off  [GAP A5]
-- ============================================================================
--
-- The exclusion constraint above covers booking-vs-booking. It says nothing about time off,
-- so without this an admin can add "Tuesday off" between a customer loading the slot list and
-- clicking, and the insert succeeds. Same argument the spec makes for the constraint over an
-- app-level check: a trigger cannot be forgotten by a future feature, a manual admin insert,
-- or a seed script.
--
-- Raises custom SQLSTATE 'BK001' so booking.service.ts can map it to a TimeOffConflictError
-- distinct from 23P01, and show the customer a different message ("that staff member is away
-- then") rather than "just taken".
--
-- Deliberately one-directional. Adding TimeOff over an existing booking is NOT blocked — the
-- admin needs to be able to do that and then move the affected bookings. The admin UI warns
-- and lists them; it does not refuse. [GAP C9]

CREATE OR REPLACE FUNCTION booking_reject_timeoff_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_reason text;
BEGIN
  IF NEW."status" NOT IN ('PENDING', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(t."reason", 'unavailable')
    INTO v_reason
    FROM "TimeOff" t
   WHERE t."businessId" = NEW."businessId"
     AND (t."staffId" IS NULL OR t."staffId" = NEW."staffId")  -- NULL = business-wide closure
     AND t."startsAt" < NEW."blockEndsAt"                      -- overlap, not containment
     AND t."endsAt"   > NEW."blockStartsAt"
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Booking overlaps time off (%)', v_reason
      USING ERRCODE = 'BK001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_timeoff_guard
  BEFORE INSERT OR UPDATE OF "staffId", "blockStartsAt", "blockEndsAt", "status"
  ON "Booking"
  FOR EACH ROW
  EXECUTE FUNCTION booking_reject_timeoff_overlap();


-- ============================================================================
-- 5. Working time invariants  [GAP B3]
-- ============================================================================
--
-- Overnight shifts are represented as TWO rows (Mon 1320-1440 + Tue 0-60), never as a single
-- row with endMin > 1440. Interval merging in the availability engine reassembles them into
-- one continuous block, so the engine needs no special case — but only if this holds.

ALTER TABLE "AvailabilityRule"
  ADD CONSTRAINT availability_rule_day_valid
  CHECK ("dayOfWeek" BETWEEN 0 AND 6);

ALTER TABLE "AvailabilityRule"
  ADD CONSTRAINT availability_rule_minutes_valid
  CHECK ("startMin" >= 0 AND "endMin" <= 1440 AND "startMin" < "endMin");

ALTER TABLE "TimeOff"
  ADD CONSTRAINT timeoff_window_valid
  CHECK ("endsAt" > "startsAt");


-- ============================================================================
-- 6. Catalogue and settings invariants
-- ============================================================================

ALTER TABLE "Service"
  ADD CONSTRAINT service_duration_valid
  CHECK ("durationMins" > 0 AND "bufferBeforeMins" >= 0 AND "bufferAfterMins" >= 0);

ALTER TABLE "Service"
  ADD CONSTRAINT service_price_non_negative
  CHECK ("priceMinor" >= 0);

ALTER TABLE "Business"
  ADD CONSTRAINT business_policy_valid
  CHECK (
    "slotIntervalMins" > 0
    AND "minLeadTimeMins" >= 0
    AND "bookingWindowDays" > 0
    AND "cancelWindowHours" >= 0
    AND "currencyDecimals" BETWEEN 0 AND 4
  );

-- v1 is a single business. Caps the table at one row so every query can safely assume the
-- singleton. Drop this index on the day multi-tenancy lands. [GAP C5]
CREATE UNIQUE INDEX business_singleton_idx
  ON "Business" ("isSingleton")
  WHERE "isSingleton" = true;


-- ============================================================================
-- 7. Performance
-- ============================================================================

-- No separate GiST index for the availability overlap query: the booking_no_overlap
-- constraint above is already backed by exactly that index — same columns, same partial
-- predicate — and the planner will use it. Adding a second would double write cost for
-- nothing.

-- The reminder and close-out crons scan only active bookings. A partial index keeps
-- cancelled and completed history out of the hot path entirely, which matters as the table
-- grows and the active window stays roughly constant.
CREATE INDEX booking_active_starts_idx
  ON "Booking" ("businessId", "startsAt")
  WHERE "status" IN ('PENDING', 'CONFIRMED');

-- Retry sweep for NFR-9: "give me everything that failed and is due". [GAP B6]
CREATE INDEX notification_retry_idx
  ON "NotificationLog" ("nextAttemptAt")
  WHERE "status" = 'FAILED';
