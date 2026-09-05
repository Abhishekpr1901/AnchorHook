const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const SECRET = process.env.WEBHOOK_SECRET;

// ─────────────────────────────────────────────
// NOTES — Milestone 5
// ─────────────────────────────────────────────
// FORCE_FAIL lets us simulate a broken receiver on demand, so we can
// actually test retry/backoff behavior instead of always succeeding.
// In a real system, this would just be an actual outage — we're
// deliberately triggering the same condition to observe the retry logic.
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

  if (receivedSignature === expectedSignature) {
    console.log('✅ Signature verified! Payload:', req.body);
    res.status(200).json({ received: true });
  } else {
    console.log('❌ Signature mismatch — rejecting');
    res.status(401).json({ error: 'invalid signature' });
  }
});

app.listen(4000, () => {
  console.log('Mock receiver listening on port 4000');
});

