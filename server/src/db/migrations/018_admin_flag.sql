-- 018_admin_flag.sql
-- Description: Add is_admin flag to riders and agent_reply to support tickets.

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_riders_is_admin ON riders(is_admin) WHERE is_admin = true;

-- Add agent_reply column to support_tickets for admin responses
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS agent_reply TEXT;
