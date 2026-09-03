const amqp = require('amqplib');
const crypto = require('crypto');
const axios = require('axios');
const pool = require('./db');

// ─────────────────────────────────────────────
// NOTES — Milestone 4
// ─────────────────────────────────────────────
// Standalone consumer — no Express, no HTTP server, no port. Just an
// infinite loop: connect → wait for a message → process it → repeat.

const QUEUE_NAME = 'events_queue';

async function startWorker() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });

  console.log('Worker started, waiting for events...');

  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    const event = JSON.parse(msg.content.toString());
    console.log('Received event:', event);

    try {
      await deliverEvent(event);
      console.log('✅ Delivered successfully');
    } catch (err) {
      console.log('❌ Delivery failed:', err.message);
      // Retry logic comes in Milestone 5 — for now, we just log and move on.
    }

    // Always ack, even on failure — otherwise RabbitMQ would redeliver
    // this same message forever, in an infinite loop. Milestone 5's
    // retry/DLQ system will handle failures properly.
    channel.ack(msg);
  });
}

async function deliverEvent(event) {
  // 1. Look up the endpoint's URL + secret from Postgres.
  const result = await pool.query(
    'SELECT url, secret FROM endpoints WHERE id = $1',
    [event.endpointId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No endpoint found for id ${event.endpointId}`);
  }

  const { url, secret } = result.rows[0];

  // 2. Build the actual payload we'll send to the receiver.
  const payload = {
    id: crypto.randomUUID(), // unique event ID — enables idempotency on the receiver's side
    type: event.type,
    data: event.data,
    createdAt: event.createdAt,
  };

  const payloadString = JSON.stringify(payload);

  // 3. Sign the payload using HMAC-SHA256 + the endpoint's secret.
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

  // 4. Actually deliver it — POST to the client's registered URL.
  await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-AnchorHook-Signature': signature,
    },
    timeout: 5000, // don't wait forever if the receiver is unresponsive
  });
}

startWorker();

