-- 039_group_alert_kind.sql
-- The safety flow is a group alert, never "SOS" (launch readiness D8).
--
--   * ride_live_incidents.kind accepts 'group_alert'. 'sos' stays allowed
--     for this release so app builds that still send it keep working; the
--     server stores what they send as 'group_alert'. A later migration drops
--     'sos' from the CHECK once no build sends it.
--
-- Changes data: existing 'sos' incidents are relabelled 'group_alert'. Same
-- meaning, new name; nothing else on the row changes.
-- Rollback: UPDATE ride_live_incidents SET kind = 'sos' WHERE kind = 'group_alert';
-- then restore the original CHECK from 014.

ALTER TABLE ride_live_incidents
  DROP CONSTRAINT IF EXISTS ride_live_incidents_kind_check;

ALTER TABLE ride_live_incidents
  ADD CONSTRAINT ride_live_incidents_kind_check
  CHECK (kind IN ('group_alert', 'sos', 'crash', 'medical', 'mechanical', 'other'));

UPDATE ride_live_incidents
   SET kind = 'group_alert'
 WHERE kind = 'sos';
