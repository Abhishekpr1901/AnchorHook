CREATE TABLE IF NOT EXISTS endpoints (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id SERIAL PRIMARY KEY,
  endpoint_id INTEGER REFERENCES endpoints(id),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  status_code INTEGER,
  error_message TEXT,
  attempt_number INTEGER NOT NULL,
  attempted_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS circuit_state TEXT NOT NULL DEFAULT 'closed';
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS circuit_opened_at TIMESTAMP;




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