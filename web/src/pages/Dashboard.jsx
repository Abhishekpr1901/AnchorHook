import { useEffect } from 'react'
import './dashboard.css'
import Overview from './dashboard/Overview.jsx'

// [hash name, label]. On desktop these are tabs under the header;
// on a phone they become a bottom bar, easy to reach with a thumb.
const TABS = [
  ['overview', 'Overview'],
  ['endpoints', 'Endpoints'],
  ['deliveries', 'Deliveries'],
  ['trace', 'Trace'],
  ['dlq', 'DLQ'],
]

const VIEWS = { overview: Overview }

export default function Dashboard({ tab }) {
  const known = TABS.some(([id]) => id === tab)
  const View = VIEWS[tab]

  useEffect(() => { window.scrollTo(0, 0) }, [tab])

  return (
    <main className="container dash">
      <nav className="tabs" aria-label="Dashboard">
        {TABS.map(([id, label]) => (
          <a key={id} href={id === 'overview' ? '#/dashboard' : `#/dashboard/${id}`} aria-current={tab === id ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>

      <div className="view">
        {!known && <p className="state dim">There is no tab called &ldquo;{tab}&rdquo;.</p>}
        {known && View && <View />}
        {known && !View && <p className="state dim">This tab is built in a later step.</p>}
      </div>
    </main>
  )
}