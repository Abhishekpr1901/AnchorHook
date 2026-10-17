const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

// POST /endpoints — registers a new endpoint URL and returns a signing secret.
// The secret is shown here ONCE — it's the client's job to store it safely.
router.post('/', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  // Generate a 256-bit (32 byte) secure random secret.
  const secret = crypto.randomBytes(32).toString('hex');

  try {
    const result = await pool.query(
      'INSERT INTO endpoints (url, secret) VALUES ($1, $2) RETURNING id, url, secret, created_at',
      [url, secret]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'failed to create endpoint', details: err.message });
  }
});

// ─────────────────────────────────────────────
// NOTES — Milestone 11
// ─────────────────────────────────────────────
// GET /endpoints — the dashboard's endpoint table. Each row has the
// endpoint's health (circuit state, token bucket) plus how many deliveries
// succeeded, failed or were skipped. The secret is deliberately NOT
// selected: it is shown once at creation and never again.
//
// The LEFT JOIN uses a subquery that counts attempts per endpoint in one
// pass. COUNT(*) FILTER (WHERE ...) counts only the rows matching a
// condition, so we get three counts from a single scan of the table.
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const result = await pool.query(
      `SELECT e.id, e.url, e.created_at, e.circuit_state, e.consecutive_failures,
              e.available_tokens, e.max_tokens, e.refill_rate_ms,
              COALESCE(a.delivered, 0) AS delivered,
              COALESCE(a.failed, 0) AS failed,
              COALESCE(a.skipped, 0) AS skipped,
              a.last_attempt_at
       FROM endpoints e
       LEFT JOIN (
         SELECT endpoint_id,
                COUNT(*) FILTER (WHERE status = 'success')::int AS delivered,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
                MAX(attempted_at) AS last_attempt_at
         FROM delivery_attempts
         GROUP BY endpoint_id
       ) a ON a.endpoint_id = e.id
       ORDER BY e.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ count: result.rows.length, endpoints: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'failed to list endpoints', details: err.message });
  }
});

// GET /endpoints/:id/deliveries — returns delivery history for one
// endpoint, most recent first. Supports basic pagination via ?limit
// and ?offset query params.
router.get('/:id/deliveries', async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const result = await pool.query(
      `SELECT * FROM delivery_attempts
       WHERE endpoint_id = $1
       ORDER BY attempted_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json({
      endpointId: id,
      count: result.rows.length,
      deliveries: result.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'failed to fetch deliveries', details: err.message });
  }
});

module.exports = router;

