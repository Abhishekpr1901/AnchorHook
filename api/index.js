const express = require('express');
const pool = require('./db');
const endpointsRouter = require('./routes/endpoints');

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

app.listen(PORT, () => {
  console.log(`AnchorHook API running on port ${PORT}`);
});


// ─────────────────────────────────────────────
// NOTES — Milestone 2 (update)
// ─────────────────────────────────────────────
// Added: app.use('/endpoints', endpointsRouter)
//
// This "mounts" the router defined in routes/endpoints.js under the
// /endpoints path — same modular routing pattern as Express apps in
// MERN (keeping route logic out of the main server file as the app grows).