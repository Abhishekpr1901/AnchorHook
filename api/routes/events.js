const express = require('express');
const { getChannel, QUEUE_NAME } = require('../queue');

const router = express.Router();

// ─────────────────────────────────────────────
// NOTES — Milestone 4 (update)
// ─────────────────────────────────────────────
// Added endpointId — the worker needs to know WHICH registered
// endpoint this event should be delivered to. Without this, the
// worker would have no way to look up the URL + secret to use.
router.post('/', async (req, res) => {
  const { endpointId, type, data } = req.body;

  if (!endpointId || !type || !data) {
    return res.status(400).json({ error: 'endpointId, type, and data are required' });
  }

  const event = {
    endpointId,
    type,
    data,
    createdAt: new Date().toISOString(),
  };

  try {
    const channel = await getChannel();
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(event)));

    res.status(202).json({ status: 'queued', event });
  } catch (err) {
    res.status(500).json({ error: 'failed to queue event', details: err.message });
  }
});

module.exports = router;

