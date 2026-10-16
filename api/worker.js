
 const amqp = require('amqplib');
const crypto = require('crypto');
const axios = require('axios');
const pool = require('./db');

// ─────────────────────────────────────────────
// NOTES — Milestone 10
// ─────────────────────────────────────────────
// Every log line is now ONE JSON object, and every line about an event
// carries its correlationId. Search that id and you see the event's whole
// journey. The payload id is now the eventId made at ingestion, so it is
// the SAME on every retry (that is what lets the receiver spot duplicates).

const QUEUE_NAME = 'events_queue';
const RETRY_QUEUE_NAME = 'events_retry_queue';
const DLQ_NAME = 'events_dlq';
const MAX_RETRIES = 5;

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30000;
const RATE_LIMIT_DELAY_MS = 3000;

// Structured logger: level + message + any extra fields, as one JSON line.
function log(level, msg, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: 'worker', msg, ...fields }));
}

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

  log('info', 'worker started, waiting for events');

  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    const event = JSON.parse(msg.content.toString());
    const retryCount = msg.properties.headers['x-retry-count'] || 0;
    const attemptNumber = retryCount + 1;

    // Messages queued before Milestone 10 have no ids yet. Give them ones
    // now; they travel with the event on every later retry.
    event.eventId = event.eventId || crypto.randomUUID();
    event.correlationId = event.correlationId || crypto.randomUUID();

    // Fields attached to every log line for this event.
    const ctx = {
      correlationId: event.correlationId,
      eventId: event.eventId,
      endpointId: event.endpointId,
      attempt: attemptNumber,
    };

    log('info', 'event received', ctx);

    // ── Circuit breaker check ──
    const endpoint = await getEndpointState(event.endpointId);
    const circuitCheck = evaluateCircuit(endpoint);

    if (circuitCheck.skip) {
      log('warn', 'circuit open, delivery skipped', ctx);
      await logAttempt(event, 'skipped', null, 'circuit breaker open', attemptNumber);
      requeueForLater(channel, event, retryCount, COOLDOWN_MS);
      channel.ack(msg);
      return;
    }

    if (circuitCheck.isHalfOpenTest) {
      log('info', 'circuit half-open, testing recovery', ctx);
    }

    // ── Rate limit check ──
    const hasToken = await tryConsumeToken(event.endpointId);

    if (!hasToken) {
      log('warn', 'rate limit reached, delivery delayed', ctx);
      await logAttempt(event, 'skipped', null, 'rate limit exceeded', attemptNumber);
      requeueForLater(channel, event, retryCount, RATE_LIMIT_DELAY_MS);
      channel.ack(msg);
      return;
    }

    try {
      const statusCode = await deliverEvent(event);
      log('info', 'delivered', { ...ctx, statusCode });
      await logAttempt(event, 'success', statusCode, null, attemptNumber);
      await recordSuccess(event.endpointId);
      channel.ack(msg);
    } catch (err) {
      const statusCode = err.response ? err.response.status : null;
      log('warn', 'delivery failed', { ...ctx, statusCode, error: err.message });
      await logAttempt(event, 'failed', statusCode, err.message, attemptNumber);
      await recordFailure(event.endpointId);
      await handleFailure(channel, msg, event, retryCount, ctx);
    }
  });
}

// Re-queues an event without counting it as a real delivery attempt
// (used by both the circuit breaker skip and the rate limit hold-back).
function requeueForLater(channel, event, retryCount, delayMs) {
  channel.sendToQueue(RETRY_QUEUE_NAME, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    expiration: delayMs.toString(),
    headers: { 'x-retry-count': retryCount },
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

async function tryConsumeToken(endpointId) {
  const endpoint = await getEndpointState(endpointId);

  const now = Date.now();
  const lastRefill = new Date(endpoint.last_refill_at).getTime();
  const elapsedMs = now - lastRefill;

  const tokensToAdd = Math.floor(elapsedMs / endpoint.refill_rate_ms);
  const newTokenCount = Math.min(endpoint.max_tokens, endpoint.available_tokens + tokensToAdd);

  if (newTokenCount < 1) {
    await pool.query(
      'UPDATE endpoints SET available_tokens = $1, last_refill_at = $2 WHERE id = $3',
      [newTokenCount, new Date(lastRefill + tokensToAdd * endpoint.refill_rate_ms), endpointId]
    );
    return false;
  }

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
    log('warn', 'circuit opened', { endpointId, consecutiveFailures: consecutive_failures });
    await pool.query(
      `UPDATE endpoints SET circuit_state = 'open', circuit_opened_at = NOW() WHERE id = $1`,
      [endpointId]
    );
  }
}

async function handleFailure(channel, msg, event, retryCount, ctx) {
  if (retryCount >= MAX_RETRIES) {
    log('error', 'max retries reached, moved to DLQ', ctx);
    channel.sendToQueue(DLQ_NAME, Buffer.from(JSON.stringify(event)), {
      persistent: true,
    });
    channel.ack(msg);
    return;
  }

  const delayMs = 5000 * Math.pow(2, retryCount);
  log('info', 'retry scheduled', { ...ctx, retryInMs: delayMs, nextAttempt: retryCount + 2 });

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

  // id is the eventId from ingestion, so it is identical on every retry.
  const payload = {
    id: event.eventId,
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
      (endpoint_id, event_type, status, status_code, error_message, attempt_number, correlation_id, event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [event.endpointId, event.type, status, statusCode, errorMessage, attemptNumber, event.correlationId, event.eventId]
  );
}

startWorker();

