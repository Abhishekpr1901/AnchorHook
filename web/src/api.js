import { demo } from './demo.js'

// VITE_API_URL decides the mode. Empty or missing: demo data, no backend
// needed. Set (for example http://localhost:3000): talk to the real API.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export const isDemo = API_URL === ''

async function request(path, options = {}) {
  // Only send a Content-Type when there is a body. A GET without it avoids
  // an extra CORS preflight request.
  const headers = options.body ? { 'Content-Type': 'application/json' } : {}
  const res = await fetch(API_URL + path, { ...options, headers })

  let body = null
  try {
    body = await res.json()
  } catch {
    // not JSON, fall through to the status check
  }
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`)
  return body
}

const live = {
  getStats: () => request('/stats'),
  getEndpoints: () => request('/endpoints'),
  getDeliveries: (endpointId, limit = 20) => request(`/endpoints/${endpointId}/deliveries?limit=${limit}`),
  getTrace: (correlationId) => request(`/trace/${encodeURIComponent(correlationId)}`),
  getDlq: () => request('/dlq'),
}

// Every screen imports this. It never needs to know which mode it is in.
export const api = isDemo ? demo : live

