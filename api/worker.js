const amqp = require('amqplib');
const crypto = require('crypto');
const axios = require('axios');
const pool = require('./db');

// ─────────────────────────────────────────────
// NOTES — Milestone 7
// ─────────────────────────────────────────────
// Circuit breaker: if an endpoint fails too many times in a row, we stop
// even attempting deliveries to it for a cooldown period. This protects
// worker time/retry-queue churn from being wasted on an endpoint we
// already know is broken.
//
// States: 'closed' (normal) -> 'open' (stop trying) -> 'half_open'
// (cooldown passed, test with exactly one attempt) -> back to 'closed'
// on success, or 'open' again on failure.
//
// Important: a skipped delivery (circuit open) is NOT a real attempt —
// it gets re-queued (without incrementing retry count) so the circuit
// eventually gets a chance to test recovery once the cooldown passes.

const QUEUE_NAME = 'events_queue';
const RETRY_QUEUE_NAME = 'events_retry_queue';
const DLQ_NAME = 'events_dlq';
const MAX_RETRIES = 5;

const FAILURE_THRESHOLD = 3;   // consecutive failures before opening the circuit
const COOLDOWN_MS = 30000;     // how long to stay open before testing recovery

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

    // ── Circuit breaker check — before attempting anything ──
    const endpoint = await getEndpointCircuitState(event.endpointId);
    const circuitCheck = evaluateCircuit(endpoint);

    if (circuitCheck.skip) {
      console.log(`⛔ Circuit OPEN for endpoint ${event.endpointId}, skipping delivery`);
      await logAttempt(event, 'skipped', null, 'circuit breaker open', attemptNumber);

      // Re-queue for a later retry so we eventually get a chance to test
      // recovery once the cooldown passes — otherwise this message just
      // disappears and the circuit never gets tested again.
      channel.sendToQueue(RETRY_QUEUE_NAME, Buffer.from(JSON.stringify(event)), {
        persistent: true,
        expiration: COOLDOWN_MS.toString(),
        headers: { 'x-retry-count': retryCount }, // not incremented — not a real attempt
      });

      channel.ack(msg);
      return;
    }

    if (circuitCheck.isHalfOpenTest) {
      console.log(`🧪 Circuit HALF_OPEN for endpoint ${event.endpointId}, testing recovery`);
    }

    try {
      const statusCode = await deliverEvent(event);
      console.log('✅ Delivered successfully');
      await logAttempt(event, 'success', statusCode, null, attemptNumber);
      await recordSuccess(event.endpointId);
      channel.ack(msg);
    } catch (err) {
      console.log('❌ Delivery failed:', err.message);
      const statusCode = err.response ? err.response.status : null;
      await logAttempt(event, 'failed', statusCode, err.message, attemptNumber);
      await recordFailure(event.endpointId);
      await handleFailure(channel, msg, event, retryCount);
    }
  });
}

// Fetches the endpoint's current circuit breaker fields.
async function getEndpointCircuitState(endpointId) {
  const result = await pool.query(
    'SELECT circuit_state, consecutive_failures, circuit_opened_at FROM endpoints WHERE id = $1',
    [endpointId]
  );
  return result.rows[0];
}

// Decides what to do based on current circuit state.
// Returns { skip: bool, isHalfOpenTest: bool }
function evaluateCircuit(endpoint) {
  if (!endpoint || endpoint.circuit_state === 'closed') {
    return { skip: false, isHalfOpenTest: false };
  }

  if (endpoint.circuit_state === 'open') {
    const openedAt = new Date(endpoint.circuit_opened_at).getTime();
    const now = Date.now();

    if (now - openedAt >= COOLDOWN_MS) {
      // Cooldown has passed — allow exactly one test attempt (half-open).
      return { skip: false, isHalfOpenTest: true };
    }

    // Still cooling down — skip this delivery entirely.
    return { skip: true, isHalfOpenTest: false };
  }

  // half_open state shouldn't normally persist between messages in this
  // simple version — treat it like open, waiting for the next cooldown check.
  return { skip: false, isHalfOpenTest: true };
}

// On success: reset failure count, close the circuit.
async function recordSuccess(endpointId) {
  await pool.query(
    `UPDATE endpoints
     SET consecutive_failures = 0, circuit_state = 'closed', circuit_opened_at = NULL
     WHERE id = $1`,
    [endpointId]
  );
}

// On failure: increment failure count, open the circuit if threshold crossed.
async function recordFailure(endpointId) {
  const result = await pool.query(
    'UPDATE endpoints SET consecutive_failures = consecutive_failures + 1 WHERE id = $1 RETURNING consecutive_failures, circuit_state',
    [endpointId]
  );

  const { consecutive_failures, circuit_state } = result.rows[0];

  if (consecutive_failures >= FAILURE_THRESHOLD && circuit_state !== 'open') {
    console.log(`🔴 Opening circuit for endpoint ${endpointId} after ${consecutive_failures} consecutive failures`);
    await pool.query(
      `UPDATE endpoints SET circuit_state = 'open', circuit_opened_at = NOW() WHERE id = $1`,
      [endpointId]
    );
  }
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

async function logAttempt(event, status, statusCode, errorMessage, attemptNumber) {
  await pool.query(
    `INSERT INTO delivery_attempts
      (endpoint_id, event_type, status, status_code, error_message, attempt_number)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.endpointId, event.type, status, statusCode, errorMessage, attemptNumber]
  );
}

startWorker();

