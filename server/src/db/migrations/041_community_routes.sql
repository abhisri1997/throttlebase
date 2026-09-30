-- 041_community_routes.sql
-- A deleted rider's public routes can be kept for the community, anonymised,
-- once their account is purged (plans/account-deletion.md, decision B). A
-- kept route belongs to nobody: its creator is cleared rather than pointed
-- at the rider's tombstone or at a stand-in account, so nothing links it
-- back to them and nobody can edit, share or delete it. The app shows it as
-- a "Community route".
--
-- Additive: no existing row changes.
-- Rollback: delete the routes with no creator, then SET NOT NULL again.

ALTER TABLE routes ALTER COLUMN creator_id DROP NOT NULL;
