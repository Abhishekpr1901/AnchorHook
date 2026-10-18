const SAFEGUARDS = [
  ['Retry with backoff', 'A failed delivery waits 5s, 10s, 20s, 40s, then 80s before each new attempt.'],
  ['Circuit breaker', 'After 3 failures in a row an endpoint is left alone for 30s, then one test delivery decides if it has recovered.'],
  ['Dead letter queue', 'After 5 retries the event is parked, not dropped. Replay it from the dashboard once the receiver is back.'],
  ['Rate limit per endpoint', 'Each endpoint has its own token bucket, so one slow customer can never starve the others.'],
]

// Phone layout: the same flow as a vertical list instead of a wide diagram.
const FLOW = [
  ['API', 'POST /events', 'publish'],
  ['RabbitMQ', 'events_queue', 'consume'],
  ['Worker', 'sign · retry · log', 'signed POST'],
  ['Customer', 'your endpoint', null],
]

function Node({ x, y, w, h = 64, title, sub }) {
  return (
    <g>
      <rect className="node" x={x} y={y} width={w} height={h} rx="6" />
      <text className="title" x={x + w / 2} y={y + 27} textAnchor="middle">{title}</text>
      <text className="sub" x={x + w / 2} y={y + 47} textAnchor="middle">{sub}</text>
    </g>
  )
}

export default function HowItWorks() {
  return (
    <section className="section container" id="how">
      <p className="eyebrow mono">how it works</p>
      <h2>The API answers instantly. A worker does the slow part.</h2>

      <div className="diagram-wrap">
        <svg className="diagram" viewBox="0 0 760 230" role="img" aria-label="An event flows from the API into a queue, a worker takes it, signs it and delivers it to the customer's server. Postgres stores secrets and history.">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="currentColor" />
            </marker>
          </defs>

          <Node x={0} y={40} w={130} title="API" sub="POST /events" />
          <Node x={200} y={40} w={150} title="RabbitMQ" sub="events_queue" />
          <Node x={430} y={40} w={130} title="Worker" sub="sign · retry · log" />
          <Node x={640} y={40} w={120} title="Customer" sub="your endpoint" />
          <Node x={430} y={150} w={130} title="Postgres" sub="secrets · history" />

          <line className="edge" x1="130" y1="72" x2="198" y2="72" markerEnd="url(#arrow)" />
          <line className="edge" x1="350" y1="72" x2="428" y2="72" markerEnd="url(#arrow)" />
          <line className="edge" x1="560" y1="72" x2="638" y2="72" markerEnd="url(#arrow)" />
          <line className="edge" x1="495" y1="104" x2="495" y2="148" markerStart="url(#arrow)" markerEnd="url(#arrow)" />

          <text className="label" x="165" y="62">publish</text>
          <text className="label" x="389" y="62">consume</text>
          <text className="label" x="600" y="62">signed POST</text>
        </svg>
      </div>

      <ol className="flow-mobile" aria-label="Event flow">
        {FLOW.map(([title, sub, edge]) => (
          <li key={title}>
            <div className="flow-node">
              <strong>{title}</strong>
              <span className="mono">{sub}</span>
            </div>
            {edge && <div className="flow-edge mono" aria-hidden="true">↓ {edge}</div>}
          </li>
        ))}
      </ol>
      <p className="flow-note mono">Postgres stores secrets and history. The worker reads and writes it.</p>

      <ol className="safeguards">
        {SAFEGUARDS.map(([name, text]) => (
          <li key={name}>
            <strong>{name}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
 

