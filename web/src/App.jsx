import { useEffect, useState } from 'react'
import Nav from './components/Nav.jsx'
import Landing from './pages/landing.jsx'

// Minimal hash router: "#/dashboard" shows the dashboard, anything else the landing page.
function currentRoute() {
  return window.location.hash.startsWith('#/dashboard') ? 'dashboard' : 'landing'
}

export default function App() {
  const [route, setRoute] = useState(currentRoute)

  useEffect(() => {
    const onChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return (
    <>
      <Nav route={route} />
      {route === 'landing' ? (
        <Landing />
      ) : (
        <main className="container" style={{ paddingTop: 'var(--s-5)' }}>
          <p className="dim">The dashboard is built in Step 5.</p>
        </main>
      )}
    </>
  )
}

