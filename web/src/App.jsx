import { useEffect, useState } from 'react'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import Landing from './pages/Landing.jsx'
import Dashboard from './pages/Dashboard.jsx'

// Minimal hash router.
//   #/dashboard            -> dashboard, overview tab
//   #/dashboard/endpoints  -> dashboard, endpoints tab
//   anything else          -> landing page
function parseRoute() {
  const hash = window.location.hash
  if (!hash.startsWith('#/dashboard')) return { route: 'landing', tab: null }
  return { route: 'dashboard', tab: hash.split('/')[2] || 'overview' }
}

export default function App() {
  const [location, setLocation] = useState(parseRoute)

  useEffect(() => {
    const onChange = () => setLocation(parseRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return (
    <>
      <Nav route={location.route} />
      {location.route === 'landing' ? <Landing /> : <Dashboard tab={location.tab} />}
      <Footer />
    </>
  )
}

