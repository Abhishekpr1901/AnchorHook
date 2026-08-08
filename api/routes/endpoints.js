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

module.exports = router;


// ─────────────────────────────────────────────
// NOTES — Milestone 2
// ─────────────────────────────────────────────
// POST /endpoints — registers a new webhook destination and returns a
// signing secret. The secret is only ever shown ONCE, right here, at
// creation time — same pattern as API keys on services like Stripe.
//
// - crypto.randomBytes(32) generates a 256-bit secret. 32 bytes (256 bits)
//   is the standard size for security tokens — small sizes (e.g. 4 bytes)
//   would have too few possible combinations, making brute-force guessing
//   realistic. 256 bits makes that practically impossible.
//
// - $1, $2 are parameterized placeholders — values are NEVER concatenated
//   directly into the SQL string. This prevents SQL injection: without
//   placeholders, a malicious `url` value could inject its own SQL
//   commands (e.g. DROP TABLE) into our query.
//
// - RETURNING ... on the INSERT means Postgres hands back the inserted
//   row immediately, so we don't need a second SELECT query to fetch
//   what we just created.
//
// This secret isn't used yet — it becomes active in Milestone 4, when
// the worker signs outgoing webhook payloads with it (HMAC).