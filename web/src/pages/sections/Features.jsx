const FEATURES = [
  ['Signed payloads', 'Every request carries an HMAC-SHA256 signature of its exact body. The secret is generated per endpoint and shown once, so a receiver can prove a webhook is genuine and untampered.'],
  ['Idempotent by design', 'An event keeps the same ID across every retry, so a receiver can safely ignore duplicates. Delivery is at-least-once, and the ID makes that safe.'],
  ['Traceable end to end', 'Each event gets a correlationId that appears on every JSON log line and every delivery attempt. One search shows its whole journey.'],
  ['Queryable history', 'Every attempt (success, failure or skip) is stored with its status code and error, and is available through the API.'],
]

const SNIPPET = `# 1. register where events should go
curl -X POST $API_URL/endpoints \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/hook"}'

# 2. send an event
curl -X POST $API_URL/events \\
  -H "Content-Type: application/json" \\
  -d '{"endpointId": 1, "type": "order.created", "data": {"orderId": 1}}'`

export default function Features() {
  return (
    <section className="section container" id="features">
      <p className="eyebrow mono">features</p>
      <h2>Built for the failure case.</h2>

      <div className="features">
        {FEATURES.map(([name, text]) => (
          <div className="feature" key={name}>
            <h3>{name}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>

      <h3 className="snippet-title mono">The whole API, in two requests</h3>
      <pre className="request mono snippet">{SNIPPET}</pre>
    </section>
  )
}


