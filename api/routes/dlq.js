const express = require('express');
const { getChannel, QUEUE_NAME } = require('../queue');

const router = express.Router();

const DLQ_NAME = 'events_dlq';

// ─────────────────────────────────────────────
// NOTES — Milestone 11
// ─────────────────────────────────────────────
// The dead letter queue holds events that failed too many times. These two
// routes let a human look at them and send them back for another try.
//
// channel.get() takes ONE message off a queue. With noAck:false the message
// stays "unacknowledged" until we decide: ack() removes it for good, nack()
// with requeue:true puts it back. That is how we can LOOK at messages
// without losing them.

const parse = (msg) => {
  try {
    return JSON.parse(msg.content.toString());
  } catch {
    return { raw: msg.content.toString() };
  }
};

// GET /dlq?limit=20 — how many are parked, plus a peek at the first few.
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  try {
    const channel = await getChannel();

    // Read the count BEFORE we hold anything. Right after a nack RabbitMQ
    // can still report a stale (too low) number for a moment.
    const { messageCount } = await channel.assertQueue(DLQ_NAME, { durable: true });

    // Take up to `limit` messages and hold them (unacked) so the next get()
    // returns a different one, then put every one of them back.
    const held = [];
    for (let i = 0; i < limit; i++) {
      const msg = await channel.get(DLQ_NAME, { noAck: false });
      if (!msg) break;
      held.push(msg);
    }
    const messages = held.map(parse);
    held.forEach((msg) => channel.nack(msg, false, true));

    // Never report fewer than the messages we actually saw.
    res.json({ count: Math.max(messageCount, messages.length), messages });
  } catch (err) {
    res.status(500).json({ error: 'failed to read the dead letter queue', details: err.message });
  }
});

// POST /dlq/replay  {"limit": 10}  — send parked events back to the main
// queue for a fresh set of attempts. The retry counter is reset to 0, so
// they get the full retry schedule again.
router.post('/replay', async (req, res) => {
  const limit = Math.min(parseInt((req.body || {}).limit) || 100, 1000);

  try {
    const channel = await getChannel();
    await channel.assertQueue(DLQ_NAME, { durable: true });

    let replayed = 0;
    for (let i = 0; i < limit; i++) {
      const msg = await channel.get(DLQ_NAME, { noAck: false });
      if (!msg) break;

      // Put it back on the main queue first; only then remove it from the DLQ.
      channel.sendToQueue(QUEUE_NAME, msg.content, {
        persistent: true,
        headers: { 'x-retry-count': 0 },
      });
      channel.ack(msg);
      replayed++;
    }

    res.json({ replayed });
  } catch (err) {
    res.status(500).json({ error: 'failed to replay the dead letter queue', details: err.message });
  }
});

module.exports = router;

