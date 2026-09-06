
  const amqp = require('amqplib');
const crypto = require('crypto');
const axios = require('axios');
const pool = require('./db');

// ─────────────────────────────────────────────
// NOTES — Milestone 8
// ─────────────────────────────────────────────
// Token bucket rate limiting: each endpoint has a bucket of tokens.
// Every delivery attempt spends 1 token. Tokens refill over time, up to
// a max capacity. If an endpoint has 0 tokens available, we hold off
// on delivering to it — even if the circuit is closed and nothing else
// is wrong — to avoid overwhelming that specific receiver.
//
// This is calculated lazily: rather than running a background timer
// that refills tokens constantly, we calculate "how many tokens SHOULD
// have refilled since last_refill_at" at the moment we actually check,
// based on elapsed time. This avoids needing any separate scheduler.

const QUEUE_NAME = 'events_queue';
const RETRY_QUEUE_NAME = 'events_retry_queue';
const DLQ_NAME = 'events_dlq';
const MAX_RETRIES = 5;

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30000;

const RATE_LIMIT_DELAY_MS = 3000; // how long to wait before re-checking when throttled

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

    // ── Circuit breaker check ──
    const endpoint = await getEndpointState(event.endpointId);
    const circuitCheck = evaluateCircuit(endpoint);

    if (circuitCheck.skip) {
      console.log(`⛔ Circuit OPEN for endpoint ${event.endpointId}, skipping delivery`);
      await logAttempt(event, 'skipped', null, 'circuit breaker open', attemptNumber);
      requeueForLater(channel, event, retryCount, COOLDOWN_MS);
      channel.ack(msg);
      return;
    }

    if (circuitCheck.isHalfOpenTest) {
      console.log(`🧪 Circuit HALF_OPEN for endpoint ${event.endpointId}, testing recovery`);
    }

    // ── Rate limit check — only if circuit allowed us this far ──
    const hasToken = await tryConsumeToken(event.endpointId);

    if (!hasToken) {
      console.log(`🐢 Rate limit reached for endpoint ${event.endpointId}, delaying delivery`);
      await logAttempt(event, 'skipped', null, 'rate limit exceeded', attemptNumber);
      requeueForLater(channel, event, retryCount, RATE_LIMIT_DELAY_MS);
      channel.ack(msg);
      return;
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

// Re-queues an event without counting it as a real delivery attempt
// (used by both the circuit breaker skip and the rate limit hold-back).
function requeueForLater(channel, event, retryCount, delayMs) {
  channel.sendToQueue(RETRY_QUEUE_NAME, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    expiration: delayMs.toString(),
    headers: { 'x-retry-count': retryCount }, // not incremented — not a real attempt
  });
}

async function getEndpointState(endpointId) {
  const result = await pool.query(
    `SELECT circuit_state, consecutive_failures, circuit_opened_at,
            available_tokens, max_tokens, refill_rate_ms, last_refill_at
     FROM endpoints WHERE id = $1`,
    [endpointId]
  );
  return result.rows[0];
}

function evaluateCircuit(endpoint) {
  if (!endpoint || endpoint.circuit_state === 'closed') {
    return { skip: false, isHalfOpenTest: false };
  }

  if (endpoint.circuit_state === 'open') {
    const openedAt = new Date(endpoint.circuit_opened_at).getTime();
    const now = Date.now();

    if (now - openedAt >= COOLDOWN_MS) {
      return { skip: false, isHalfOpenTest: true };
    }

    return { skip: true, isHalfOpenTest: false };
  }

  return { skip: false, isHalfOpenTest: true };
}

// The core token bucket logic. Calculates how many tokens should have
// refilled since last_refill_at, applies that (capped at max_tokens),
// then tries to spend 1 token. Returns true if a token was available
// and spent, false if the bucket was empty.
async function tryConsumeToken(endpointId) {
  const endpoint = await getEndpointState(endpointId);

  const now = Date.now();
  const lastRefill = new Date(endpoint.last_refill_at).getTime();
  const elapsedMs = now - lastRefill;

  const tokensToAdd = Math.floor(elapsedMs / endpoint.refill_rate_ms);
  const newTokenCount = Math.min(endpoint.max_tokens, endpoint.available_tokens + tokensToAdd);

  if (newTokenCount < 1) {
    // Still no tokens available even after calculating refill — persist
    // the refill progress so we don't lose partial elapsed time, but
    // don't spend anything.
    await pool.query(
      'UPDATE endpoints SET available_tokens = $1, last_refill_at = $2 WHERE id = $3',
      [newTokenCount, new Date(lastRefill + tokensToAdd * endpoint.refill_rate_ms), endpointId]
    );
    return false;
  }

  // Spend one token, and advance last_refill_at by exactly how much
  // time we accounted for — not simply "now" — so we don't accidentally
  // throw away fractional progress toward the next token.
  const refillAdvanceMs = tokensToAdd * endpoint.refill_rate_ms;
  await pool.query(
    'UPDATE endpoints SET available_tokens = $1, last_refill_at = $2 WHERE id = $3',
    [newTokenCount - 1, new Date(lastRefill + refillAdvanceMs), endpointId]
  );

  return true;
}

async function recordSuccess(endpointId) {
  await pool.query(
    `UPDATE endpoints
     SET consecutive_failures = 0, circuit_state = 'closed', circuit_opened_at = NULL
     WHERE id = $1`,
    [endpointId]
  );
}

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

