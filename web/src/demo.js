// Demo data source. Same functions and response shapes as the live API
// (see api.js), but backed by sample data in memory, so the site works
// with no backend. Sample data is generated relative to "now".

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const start = Date.now()
const ago = (ms) => new Date(start - ms).toISOString()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const delay = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 150))

const endpoints = [
  { id: 3, url: 'https://hooks.paperplane.app/ingest', created_at: ago(9 * DAY), circuit_state: 'closed', consecutive_failures: 0, available_tokens: 1, max_tokens: 5, refill_rate_ms: 2000 },
  { id: 2, url: 'https://billing.northwind.io/webhooks', created_at: ago(21 * DAY), circuit_state: 'open', consecutive_failures: 3, available_tokens: 5, max_tokens: 5, refill_rate_ms: 2000 },
  { id: 1, url: 'https://api.acme-shop.dev/hooks/orders', created_at: ago(34 * DAY), circuit_state: 'closed', consecutive_failures: 0, available_tokens: 4, max_tokens: 5, refill_rate_ms: 2000 },
]

export const SAMPLE_TRACE_ID = '3f2a9c1e-7b4d-4e8a-9d52-1c6e0a8b5f71'

let nextAttemptId = 1
const attempts = []
function add(endpointId, status, statusCode, error, attemptNumber, msAgo, correlationId, eventId, type = 'order.created') {
  attempts.push({
    id: nextAttemptId++, endpoint_id: endpointId, event_type: type, status,
    status_code: statusCode, error_message: error, attempt_number: attemptNumber,
    attempted_at: ago(msAgo), correlation_id: correlationId, event_id: eventId,
  })
}

// acme-shop: healthy. 40 clean deliveries plus one event that needed 3 tries.
for (let i = 0; i < 40; i++) add(1, 'success', 200, null, 1, (i + 3) * 9 * MIN, crypto.randomUUID(), crypto.randomUUID())
add(1, 'failed', 500, 'Request failed with status code 500', 1, 31 * MIN, SAMPLE_TRACE_ID, 'b7e1d0a4-2c53-4f9e-8a16-5d0f3c9e7a21')
add(1, 'failed', null, 'ECONNABORTED: timeout of 5000ms exceeded', 2, 31 * MIN - 5000, SAMPLE_TRACE_ID, 'b7e1d0a4-2c53-4f9e-8a16-5d0f3c9e7a21')
add(1, 'success', 200, null, 3, 31 * MIN - 15000, SAMPLE_TRACE_ID, 'b7e1d0a4-2c53-4f9e-8a16-5d0f3c9e7a21')

// northwind: was fine, then started failing; the circuit breaker opened.
for (let i = 0; i < 6; i++) add(2, 'success', 200, null, 1, (i + 2) * HOUR, crypto.randomUUID(), crypto.randomUUID(), 'invoice.paid')
for (let i = 0; i < 3; i++) add(2, 'failed', 503, 'Request failed with status code 503', i + 1, 14 * MIN - i * 5000, crypto.randomUUID(), crypto.randomUUID(), 'invoice.paid')
for (let i = 0; i < 2; i++) add(2, 'skipped', null, 'circuit breaker open', 1, 6 * MIN - i * 20000, crypto.randomUUID(), crypto.randomUUID(), 'invoice.paid')

// paperplane: busy, so some deliveries were held back by the rate limit.
for (let i = 0; i < 18; i++) add(3, 'success', 200, null, 1, (i + 1) * 4 * MIN, crypto.randomUUID(), crypto.randomUUID(), 'message.sent')
for (let i = 0; i < 2; i++) add(3, 'skipped', null, 'rate limit exceeded', 1, 3 * MIN + i * 1000, crypto.randomUUID(), crypto.randomUUID(), 'message.sent')

const dlq = [
  { eventId: 'c91f5e22-8d3a-4b70-a1e4-0f6b2d7c3a58', correlationId: crypto.randomUUID(), endpointId: 2, type: 'invoice.paid', data: { invoiceId: 'inv_20418', amount: 4900 }, createdAt: ago(2 * HOUR) },
  { eventId: 'e03a7b18-6f2c-4d95-b8a1-9c4e1f5d2b76', correlationId: crypto.randomUUID(), endpointId: 2, type: 'invoice.paid', data: { invoiceId: 'inv_20397', amount: 1200 }, createdAt: ago(3 * HOUR) },
]

const count = (id, status) => attempts.filter((a) => a.endpoint_id === id && a.status === status).length
const newestFirst = (a, b) => b.attempted_at.localeCompare(a.attempted_at) || b.id - a.id

export const demo = {
  async getStats() {
    const last24h = { success: 0, failed: 0, skipped: 0 }
    for (const a of attempts) last24h[a.status] += 1
    const real = last24h.success + last24h.failed
    return delay({
      last24h,
      successRate: real === 0 ? null : last24h.success / real,
      endpoints: { total: endpoints.length, circuitsOpen: endpoints.filter((e) => e.circuit_state !== 'closed').length },
      queues: { events: 0, retry: 0, dlq: dlq.length },
    })
  },

  async getEndpoints() {
    const rows = endpoints.map((e) => {
      const mine = attempts.filter((a) => a.endpoint_id === e.id).sort(newestFirst)
      return { ...e, delivered: count(e.id, 'success'), failed: count(e.id, 'failed'), skipped: count(e.id, 'skipped'), last_attempt_at: mine[0] ? mine[0].attempted_at : null }
    })
    return delay({ count: rows.length, endpoints: rows })
  },

  async getDeliveries(endpointId, limit = 20) {
    const rows = attempts.filter((a) => a.endpoint_id === endpointId).sort(newestFirst).slice(0, limit)
    return delay({ endpointId, count: rows.length, deliveries: rows })
  },

  async getTrace(correlationId) {
    if (!UUID.test(correlationId)) throw new Error('correlationId must be a UUID')
    const rows = attempts.filter((a) => a.correlation_id === correlationId).sort((a, b) => a.attempted_at.localeCompare(b.attempted_at) || a.id - b.id)
    if (rows.length === 0) throw new Error('no attempts found for this correlationId')
    return delay({
      correlationId, eventId: rows[0].event_id, endpointId: rows[0].endpoint_id, eventType: rows[0].event_type,
      delivered: rows.some((r) => r.status === 'success'), attemptCount: rows.length, timeline: rows,
    })
  },

  async getDlq() {
    return delay({ count: dlq.length, messages: dlq.slice(0, 20) })
  },
}

