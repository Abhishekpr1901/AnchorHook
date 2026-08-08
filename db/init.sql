CREATE TABLE IF NOT EXISTS endpoints (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
-- ─────────────────────────────────────────────
-- NOTES — Milestone 2
-- ─────────────────────────────────────────────
-- Defines the `endpoints` table — where every registered webhook
-- destination URL and its signing secret live.
--
-- Columns:
--   id         → auto-incrementing primary key (SERIAL)
--   url        → the client's registered webhook URL
--   secret     → 256-bit random secret, generated in routes/endpoints.js,
--                will be used for HMAC signing in Milestone 4
--   created_at → auto-set timestamp, defaults to NOW()
--
-- This file only runs when manually executed via:
--   docker exec -i anchorhook-postgres psql -U anchorhook -d anchorhook < db/init.sql
-- It does NOT auto-run on every container restart — only intended to be
-- run once (or whenever the schema needs to be (re)applied).