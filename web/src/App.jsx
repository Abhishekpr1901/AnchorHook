import { useEffect, useState } from 'react'
import { api, isDemo } from './api.js'

// Temporary check: shows that the data layer works in both modes.
export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api.getStats(), api.getEndpoints(), api.getDlq()])
      .then(([stats, endpoints, dlq]) => setData({ stats, endpoints: endpoints.endpoints, dlq }))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main className="container" style={{ paddingTop: 'var(--s-5)' }}>
      <h1 style={{ fontSize: 'var(--fs-lg)' }}>
        AnchorHooks <span className={`chip ${isDemo ? 'warn' : 'ok'}`}>{isDemo ? 'demo data' : 'live API'}</span>
      </h1>
      {error && <p style={{ color: 'var(--bad)', marginTop: 'var(--s-3)' }}>Could not load: {error}</p>}
      {!data && !error && <p style={{ color: 'var(--text-dim)', marginTop: 'var(--s-3)' }}>Loading...</p>}
      {data && <pre className="mono" style={{ marginTop: 'var(--s-3)' }}>{JSON.stringify(data, null, 2)}</pre>}
    </main>
  )
}

