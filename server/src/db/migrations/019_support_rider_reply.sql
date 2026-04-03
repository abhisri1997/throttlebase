-- 019_support_rider_reply.sql
-- Description: Allow riders to add follow-up replies on support tickets.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS rider_reply TEXT;