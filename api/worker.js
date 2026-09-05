const amqp = require('amqplib');
const crypto = require('crypto');
const axios = require('axios');
const pool = require('./db');

// ─────────────────────────────────────────────
// NOTES — Milestone 6
// ─────────────────────────────────────────────
// Every delivery attempt now gets logged to Postgres — success, failure,
// or final DLQ outcome — via logAttempt(). This is what makes delivery
// history queryable later, instead of only existing in docker logs.

const QUEUE_NAME = 'events_queue';
const RETRY_QUEUE_NAME = 'events_retry_queue';
const DLQ_NAME = 'events_dlq';
const MAX_RETRIES = 5;

async function startWorker() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertQueue(QUEUE_NAME, { durable: true });

  await channel.assertQueue(RETRY_QUEUE_NAME, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': QUEUE_NAME,
    },
  });

  await channel.assertQueue(DLQ_NAME, { durable: true });

  console.log('Worker started, waiting for events...');

  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    const event = JSON.parse(msg.content.toString());
    const retryCount = msg.properties.headers['x-retry-count'] || 0;
    const attemptNumber = retryCount + 1;

    console.log(`Received event (attempt ${attemptNumber}):`, event);

    try {
      const statusCode = await deliverEvent(event);
      console.log('✅ Delivered successfully');
      await logAttempt(event, 'success', statusCode, null, attemptNumber);
      channel.ack(msg);
    } catch (err) {
      console.log('❌ Delivery failed:', err.message);
      const statusCode = err.response ? err.response.status : null;
      await logAttempt(event, 'failed', statusCode, err.message, attemptNumber);
      await handleFailure(channel, msg, event, retryCount);
    }
  });
}

async function handleFailure(channel, msg, event, retryCount) {
  if (retryCount >= MAX_RETRIES) {
    console.log(`🪦 Max retries reached, sending to DLQ`);
    channel.sendToQueue(DLQ_NAME, Buffer.from(JSON.stringify(event)), {
      persistent: true,
    });
    channel.ack(msg);
    return;
  }

  const delayMs = 5000 * Math.pow(2, retryCount);
  console.log(`🔁 Retrying in ${delayMs}ms (attempt ${retryCount + 1} of ${MAX_RETRIES})`);

  channel.sendToQueue(RETRY_QUEUE_NAME, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    expiration: delayMs.toString(),
    headers: { 'x-retry-count': retryCount + 1 },
  });

  channel.ack(msg);
}

async function deliverEvent(event) {
  const result = await pool.query(
    'SELECT url, secret FROM endpoints WHERE id = $1',
    [event.endpointId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No endpoint found for id ${event.endpointId}`);
  }

  const { url, secret } = result.rows[0];

  const payload = {
    id: crypto.randomUUID(),
    type: event.type,
    data: event.data,
    createdAt: event.createdAt,
  };

  const payloadString = JSON.stringify(payload);

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-AnchorHook-Signature': signature,
    },
    timeout: 5000,
  });

  return response.status;
}

// Writes one row per delivery attempt — this is the entire observability
// piece. Every attempt, success or failure, becomes a permanent record.
async function logAttempt(event, status, statusCode, errorMessage, attemptNumber) {
  await pool.query(
    `INSERT INTO delivery_attempts
      (endpoint_id, event_type, status, status_code, error_message, attempt_number)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.endpointId, event.type, status, statusCode, errorMessage, attemptNumber]
  );
}

startWorker();

