const { Pool } = require('pg');

// Connection pool: instead of opening a new DB connection every time
// we run a query, we keep a small set of connections open and reuse them.
// Opening a fresh TCP connection per query is slow — pooling avoids that.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;


// ─────────────────────────────────────────────
// NOTES — Milestone 1
// ─────────────────────────────────────────────
// This sets up a connection POOL instead of opening a new Postgres
// connection every time we run a query. Opening a fresh TCP connection
// per query is slow and resource-heavy — the pool keeps a small set of
// connections open and reuses them.
//
// In Mongoose (MERN), mongoose.connect() hid this from us entirely.
// With raw `pg`, we set it up explicitly — this is the tradeoff of
// skipping an ORM: more visibility into what's actually happening,
// less abstraction doing it for us.
//
// process.env.DATABASE_URL comes from docker-compose.yml, and uses the
// hostname "postgres" (the service name), not "localhost" — because
// inside Docker's network, services reach each other by service name.