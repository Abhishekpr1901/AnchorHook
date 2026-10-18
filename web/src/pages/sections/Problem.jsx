const ROWS = [
  ['Receiver is down for 10 minutes', 'Event lost', 'Retried 5 times with growing delays, then parked for replay'],
  ['Receiver keeps returning 500', 'Hammered on every event', 'Circuit opens after 3 failures, one test call after 30s'],
  ['One customer is slow', 'Everyone queues behind them', 'Per-endpoint token bucket, other endpoints unaffected'],
  ['Did it arrive?', 'Grep the logs and guess', 'Trace one correlationId through every attempt'],
]

export default function Problem() {
  return (
    <section className="section container" id="problem">
      <p className="eyebrow mono">the problem</p>
      <h2>A webhook is a promise to a server you don&rsquo;t control.</h2>
      <div className="problem-grid">
        <div className="prose">
          <p>
            Your app tells a customer&rsquo;s server that something happened. Their server
            is down, slow, or returning errors, and you find out too late.
          </p>
          <p>
            Sending once and hoping loses events. Retrying in a tight loop hammers a
            server that is already struggling. Neither tells you what actually happened.
          </p>
        </div>
        <div className="compare-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th>Situation</th>
                <th>Fire and forget</th>
                <th className="us">AnchorHooks</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([situation, naive, ours]) => (
                <tr key={situation}>
                  <td>{situation}</td>
                  <td>{naive}</td>
                  <td>{ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

