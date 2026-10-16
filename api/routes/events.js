const express = require('express');
const crypto = require('crypto');
const { getChannel, QUEUE_NAME } = require('../queue');

const router = express.Router();

router.post('/', async (req, res) => {
  const { endpointId, type, data } = req.body;

  if (!endpointId || !type || !data) {
    return res.status(400).json({ error: 'endpointId, type, and data are required' });
  }

  const eventId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();

  const event = {
    eventId,
    correlationId,
    endpointId,
    type,
    data,
    createdAt: new Date().toISOString(),
  };

  try {
    const channel = await getChannel();
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(event)));

    console.log(JSON.stringify({
      level: 'info',
      service: 'api',
      msg: 'event queued',
      correlationId,
      eventId,
      endpointId,
      type,
    }));

    res.status(202).json({ status: 'queued', eventId, correlationId, event });
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      service: 'api',
      msg: 'failed to queue event',
      correlationId,
      error: err.message,
    }));
    res.status(500).json({ error: 'failed to queue event', details: err.message });
  }
});

module.exports = router;

