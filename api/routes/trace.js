const express = require('express');
const pool = require('../db');

const router = express.Router();

// ─────────────────────────────────────────────
// NOTES — Milestone 11
// ─────────────────────────────────────────────
// GET /trace/:correlationId — one event's whole journey, oldest first:
// every delivery attempt, skip and retry that carries this correlationId.
// This is the payoff of Milestone 10: because every attempt row stores the
// id, one indexed query reconstructs the story.
//
// The id is checked against a UUID pattern first, so garbage input is
// rejected with a 400 instead of reaching the database.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:correlationId', async (req, res) => {
  const { correlationId } = req.params;

  if (!UUID.test(correlationId)) {
    return res.status(400).json({ error: 'correlationId must be a UUID' });
  }

  try {
    const result = await pool.query(
      `SELECT id, endpoint_id, event_id, event_type, status, status_code,
              error_message, attempt_number, attempted_at
       FROM delivery_attempts
       WHERE correlation_id = $1
       ORDER BY attempted_at ASC, id ASC`,
      [correlationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'no attempts found for this correlationId' });
    }

    const first = result.rows[0];
    res.json({
      correlationId,
      eventId: first.event_id,
      endpointId: first.endpoint_id,
      eventType: first.event_type,
      delivered: result.rows.some((r) => r.status === 'success'),
      attemptCount: result.rows.length,
      timeline: result.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'failed to load trace', details: err.message });
  }
});

module.exports = router;

