import { api, isDemo } from '../../api.js'
import { useAsync } from '../../hooks/useAsync.js'
import { Loading, ErrorBox } from '../../components/States.jsx'

const percent = (rate) => (rate === null ? '–' : `${(rate * 100).toFixed(1)}%`)

function Figure({ label, value, tone = '' }) {
  return (
    <div className="figure">
      <dt className="mono">{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  )
}

export default function Overview() {
  const { data, error, loading, reload } = useAsync(api.getStats)

  if (loading) return <Loading label="Loading stats" />
  if (error) return <ErrorBox message={error} onRetry={reload} />

  const { last24h, successRate, endpoints, queues } = data

  return (
    <>
      <div className="view-head">
        <h1>Overview</h1>
        <span className="dim">last 24 hours</span>
      </div>

      <dl className="figures">
        <Figure label="success rate" value={percent(successRate)} tone={successRate !== null && successRate < 0.9 ? 'bad' : 'ok'} />
        <Figure label="delivered" value={last24h.success} />
        <Figure label="failed" value={last24h.failed} tone={last24h.failed ? 'bad' : ''} />
        <Figure label="skipped" value={last24h.skipped} />
        <Figure label="open circuits" value={`${endpoints.circuitsOpen} of ${endpoints.total}`} tone={endpoints.circuitsOpen ? 'warn' : ''} />
        <Figure label="dead-lettered" value={queues.dlq} tone={queues.dlq ? 'warn' : ''} />
      </dl>

      <p className="queues mono dim">
        queues · waiting {queues.events} · retrying {queues.retry} · parked {queues.dlq}
      </p>

      {isDemo && (
        <p className="demo-note">Demo data: nothing here comes from a real backend.</p>
      )}
    </>
  )
}

