const express = require('express');
const { getChannel, QUEUE_NAME } = require('../queue');

const router = express.Router();

// ─────────────────────────────────────────────
// NOTES — Milestone 3
// ─────────────────────────────────────────────
// POST /events — this is the PRODUCER. It does NOT deliver the webhook
// itself. It just publishes the event onto RabbitMQ and responds
// immediately (202 Accepted = "received, will process later").
//
// This is the core shift from a normal MERN route: instead of doing the
// slow work (an outbound HTTP call to some other server) inline and
// making the client wait, we hand it off to a queue. A separate worker
// (built in Milestone 4) will pick it up and actually deliver it,
// independent of this request's lifecycle.
//
// sendToQueue() takes a Buffer, not a plain object — RabbitMQ deals in
// raw bytes, so we JSON.stringify() the event first.
router.post('/', async (req, res) => {
  const { type, data } = req.body;

  if (!type || !data) {
    return res.status(400).json({ error: 'type and data are required' });
  }

  const event = {
    type,
    data,
    createdAt: new Date().toISOString(),
  };

  try {
    const channel = await getChannel();
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(event)));

    // 202 Accepted: request understood, work queued, not yet complete.
    res.status(202).json({ status: 'queued', event });
  } catch (err) {
    res.status(500).json({ error: 'failed to queue event', details: err.message });
  }
});

module.exports = router;
