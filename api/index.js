const express = require('express');
const pool = require('./db');
const endpointsRouter = require('./routes/endpoints');
const eventsRouter = require('./routes/events');
const statsRouter = require('./routes/stats');
const traceRouter = require('./routes/trace');




const app = express();

// ─────────────────────────────────────────────
// NOTES — Milestone 11
// ─────────────────────────────────────────────
// CORS: a browser blocks a website from calling an API on a different
// origin unless the API says it is allowed. The dashboard and the API
// will live on different origins, so the API must send these headers.
// CORS_ORIGIN lets us lock it to the dashboard's URL in production;
// "*" is fine for local development.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  // Browsers send an OPTIONS "preflight" request first. Answer it and stop.
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
app.use('/stats', statsRouter);
app.use('/trace', traceRouter);



// Always answer with JSON, never an HTML stack trace.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  console.log(JSON.stringify({ level: 'error', service: 'api', msg: 'unhandled error', error: err.message }));
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`AnchorHook API running on port ${PORT}`);
});

