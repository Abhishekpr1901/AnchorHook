const express = require('express');
const pool = require('./db');
const endpointsRouter = require('./routes/endpoints');
const eventsRouter = require('./routes/events');

// ─────────────────────────────────────────────
// NOTES — Milestone 3 (update)
// ─────────────────────────────────────────────
// Added: app.use('/events', eventsRouter)
// Same modular pattern as /endpoints — the actual publish-to-queue
// logic lives in routes/events.js, this file just mounts it.

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

app.use('/endpoints', endpointsRouter);
app.use('/events', eventsRouter);

app.listen(PORT, () => {
  console.log(`AnchorHook API running on port ${PORT}`);
});
