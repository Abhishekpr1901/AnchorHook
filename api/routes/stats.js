const express = require('express');
const pool = require('../db');
const { getChannel } = require('../queue');

const router = express.Router();

// ─────────────────────────────────────────────
// NOTES — Milestone 11
// ─────────────────────────────────────────────
// GET /stats — the dashboard's overview numbers: attempts in the last 24
// hours by outcome, how many endpoints have a tripped circuit, and how
// many messages are sitting in each queue.
//
// assertQueue() is used to read queue sizes. It creates the queue if it is
// missing and otherwise just reports it, so it can never crash the channel
// the way checkQueue() does on a queue that doesn't exist. The arguments
// MUST match how the worker declares each queue.
router.get('/', async (req, res) => {
  try {
    const attempts = await pool.query(
      `SELECT status, COUNT(*)::int AS n
       FROM delivery_attempts
       WHERE attempted_at > NOW() - interval '24 hours'
       GROUP BY status`
    );

    const endpoints = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE circuit_state <> 'closed')::int AS circuits_open
       FROM endpoints`
    );

    const channel = await getChannel();
    const events = await channel.assertQueue('events_queue', { durable: true });
    const retry = await channel.assertQueue('events_retry_queue', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'events_queue',
      },
    });
    const dlq = await channel.assertQueue('events_dlq', { durable: true });

    const last24h = { success: 0, failed: 0, skipped: 0 };
    for (const row of attempts.rows) last24h[row.status] = row.n;

    // Success rate ignores "skipped" (those are holds, not real attempts).
    const real = last24h.success + last24h.failed;

    res.json({
      last24h,
      successRate: real === 0 ? null : last24h.success / real,
      endpoints: { total: endpoints.rows[0].total, circuitsOpen: endpoints.rows[0].circuits_open },
      queues: { events: events.messageCount, retry: retry.messageCount, dlq: dlq.messageCount },
    });
  } catch (err) {
    res.status(500).json({ error: 'failed to load stats', details: err.message });
  }
});

module.exports = router;

