const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check route — confirms the API is up AND can reach Postgres.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`AnchorHook API running on port ${PORT}`);
});


// ─────────────────────────────────────────────
// NOTES — Milestone 1
// ─────────────────────────────────────────────
// The /health route doesn't just return {status: "ok"} directly —
// it runs `SELECT 1` against Postgres first. This is a deep health
// check: it confirms the database connection is ALIVE, not just that
// Express itself is running. A shallow health check would say "ok"
// even if Postgres were completely down, which defeats the purpose.
//
// - Success  → { status: "ok", db: "connected" }
// - Failure  → caught in the catch block → { status: "error", db: "disconnected" }
//
// In production, this route is usually the first thing checked when
// something breaks — it tells you WHERE the problem is (API itself,
// vs. API's connection to its database), which changes how you'd fix it.

