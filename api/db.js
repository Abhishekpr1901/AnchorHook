const { Pool } = require('pg');

// Connection pool: instead of opening a new DB connection every time
// we run a query, we keep a small set of connections open and reuse them.
// Opening a fresh TCP connection per query is slow — pooling avoids that.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
