import './footer.css'

const GITHUB = 'https://github.com/Abhishekpr1901/AnchorHook'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <p>
          AnchorHooks <span className="dim">· a distributed-systems project, built milestone by milestone</span>
        </p>
        <nav aria-label="Footer">
          <a href="#/dashboard">Dashboard</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </footer>
  )
}

