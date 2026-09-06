const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ─────────────────────────────────────────────
// NOTES — Milestone 9
// ─────────────────────────────────────────────
// End-to-end idempotency: we track every event ID we've already
// processed. If the same ID arrives again (e.g. because the worker
// retried after losing our response, even though we DID process it
// the first time), we skip re-processing but still return success —
// from the sender's point of view, this event is handled either way.
//
// This is an in-memory Set — resets on container restart. A real
// system would use Redis or a database so this survives restarts.
const seenEventIds = new Set();

const SECRET = process.env.WEBHOOK_SECRET;
const FORCE_FAIL = process.env.FORCE_FAIL === 'true';

app.post('/webhook', (req, res) => {
  if (FORCE_FAIL) {
    console.log('💥 Simulating failure (FORCE_FAIL is on)');
    return res.status(500).json({ error: 'simulated failure' });
  }

  const receivedSignature = req.headers['x-anchorhook-signature'];
  const expectedSignature = crypto
    .createHmac('sha256', SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (receivedSignature !== expectedSignature) {
    console.log('❌ Signature mismatch — rejecting');
    return res.status(401).json({ error: 'invalid signature' });
  }

  const eventId = req.body.id;

  if (seenEventIds.has(eventId)) {
    console.log(`🔁 Duplicate event ${eventId} — already processed, skipping`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  seenEventIds.add(eventId);
  console.log('✅ Signature verified! New event processed:', req.body);
  res.status(200).json({ received: true, duplicate: false });
});

app.listen(4000, () => {
  console.log('Mock receiver listening on port 4000');
});

