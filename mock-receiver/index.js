const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ─────────────────────────────────────────────
// NOTES — Milestone 4
// ─────────────────────────────────────────────
// This simulates "the customer's server" — it receives webhooks and
// verifies the HMAC signature, exactly like a real receiver would.
// The secret here MUST match the secret generated when the endpoint
// was registered via POST /endpoints — that's how both sides "agree"
// on the shared secret.

const SECRET = process.env.WEBHOOK_SECRET; // we'll pass this in manually for testing

app.post('/webhook', (req, res) => {
  const receivedSignature = req.headers['x-anchorhook-signature'];
  const payloadString = JSON.stringify(req.body);

  const expectedSignature = crypto
    .createHmac('sha256', SECRET)
    .update(payloadString)
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

