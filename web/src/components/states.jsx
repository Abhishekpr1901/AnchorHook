// The three states every data view must handle: loading, error, empty.
export function Loading({ label = 'Loading' }) {
  return <p className="state dim mono" role="status">{label}…</p>
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="state error" role="alert">
      <p>Could not load: {message}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Empty({ children }) {
  return <p className="state dim">{children}</p>
}

