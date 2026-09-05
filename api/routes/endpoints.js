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
// NOTES — Milestone 6
// ─────────────────────────────────────────────
// GET /endpoints/:id/deliveries — returns delivery history for one
// endpoint, most recent first. Supports basic pagination via ?limit
// and ?offset query params, so large histories don't get dumped all
// at once.
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

