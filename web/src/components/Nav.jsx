import './nav.css'

const GITHUB = 'https://github.com/Abhishekpr1901/AnchorHook'

export default function Nav({ route }) {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a className="brand" href="#/">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 6v14M10 12h12M8 19c0 4 3.5 7 8 7s8-3 8-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          AnchorHooks
        </a>
        <nav className="nav-links" aria-label="Main">
          <a className="hide-sm" href="#how">How it works</a>
          <a className="hide-sm" href="#features">Features</a>
          <a className="hide-sm" href="#status">Status</a>
          <a href="#/dashboard" aria-current={route === 'dashboard' ? 'page' : undefined}>Dashboard</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </header>
  )
}

