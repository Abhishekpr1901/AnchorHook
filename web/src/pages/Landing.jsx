import './landing.css'
import './sections.css'
import './info.css'
import Problem from './sections/Problem.jsx'
import HowItWorks from './sections/HowItWorks.jsx'
import Features from './sections/Features.jsx'
import Status from './sections/Status.jsx'

const GITHUB = 'https://github.com/Abhishekpr1901/AnchorHook'

// One row of the delivery timeline shown next to the request.
function Attempt({ n, result, note, chip, kind }) {
  return (
    <li>
      <span className="mono dim">{n}</span>
      <span>
        <span className="mono">{result}</span> <span className="dim">{note}</span>
      </span>
      <span className={`chip ${kind}`}>{chip}</span>
    </li>
  )
}

export default function Landing() {
  return (
    <main>
      <section className="hero container">
        <div className="hero-copy">
          <p className="eyebrow mono">webhook delivery infrastructure</p>
          <h1>Webhooks that never get lost.</h1>
          <p className="lede">
            AnchorHooks signs every event, retries with backoff when a receiver is down,
            and parks anything undeliverable so you can replay it. Every attempt is
            recorded and traceable.
          </p>
          <div className="actions">
            <a className="btn primary" href="#/dashboard">Try the demo</a>
            <a className="btn" href={GITHUB} target="_blank" rel="noreferrer">View on GitHub</a>
          </div>
        </div>

        <div className="hero-visual" role="img" aria-label="A signed webhook request, and the three delivery attempts it needed">
          <pre className="request mono">
            <span className="key">POST</span> /webhook{'\n'}
            <span className="dim">X-AnchorHook-Signature:</span> 9f2c41…e1a7{'\n'}
            <span className="dim">X-AnchorHook-Event-Id:</span> 6ca8d7ef-64ff-431e{'\n'}
            {'\n'}
            {'{ "id": "6ca8d7ef-64ff-431e",'}{'\n'}
            {'  "type": "order.created",'}{'\n'}
            {'  "data": { "orderId": 10001 } }'}
          </pre>
          <ol className="attempts">
            <Attempt n="1" result="500" note="server error · retry in 5s" chip="failed" kind="bad" />
            <Attempt n="2" result="timeout" note="no response · retry in 10s" chip="failed" kind="bad" />
            <Attempt n="3" result="200" note="OK" chip="delivered" kind="ok" />
          </ol>
        </div>
      </section>

      <Problem />
      <HowItWorks />
      <Features />
      <Status />
    </main>
  )
}

