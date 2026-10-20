const WORKS = [
  'Signed delivery with a per-endpoint secret',
  'Retries with exponential backoff, then a dead letter queue with replay',
  'Circuit breaker per endpoint',
  'Token-bucket rate limit per endpoint',
  'Stable event IDs and correlation IDs, with JSON logs',
  'Delivery history API',
  'This dashboard, running on demo data',
]

const NOT_YET = [
  'API authentication (planned before any public deploy)',
  'Automated tests and CI',
  'Metrics endpoint and Grafana dashboard',
  'A hosted live backend: this site runs on demo data',
  'Multiple users and per-customer isolation',
]

export default function Status() {
  return (
    <section className="section container" id="status">
      <p className="eyebrow mono">status</p>
      <h2>Where it is today.</h2>
      <p className="status-intro">
        A portfolio project built milestone by milestone, tested end to end on
        Postgres and RabbitMQ in Docker. Here is exactly what is done and what is not.
      </p>

      <div className="status-grid">
        <div>
          <h3 className="mono">works today</h3>
          <ul className="status-list works">
            {WORKS.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="mono">not yet</h3>
          <ul className="status-list">
            {NOT_YET.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}

