import { useCallback, useEffect, useState } from 'react'

// Runs an async function and tracks its loading / error / data state.
// Pass a STABLE function (a module-level function, or one wrapped in
// useCallback): the request re-runs whenever the function changes.
// reload() runs it again (used by the Retry button).
//
// "loading" is derived: it is true whenever the stored result does not
// belong to the current function and attempt. That means no setState
// call is needed inside the effect itself, and switching to a new
// request never shows the previous request's data.
export function useAsync(fn) {
  const [result, setResult] = useState({ fn: null, attempt: -1, data: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fn()
      .then((data) => { if (!cancelled) setResult({ fn, attempt, data, error: null }) })
      .catch((err) => { if (!cancelled) setResult({ fn, attempt, data: null, error: err.message }) })
    // The cleanup stops a slow, old request from overwriting newer data.
    return () => { cancelled = true }
  }, [fn, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const loading = result.fn !== fn || result.attempt !== attempt

  return {
    data: loading ? null : result.data,
    error: loading ? null : result.error,
    loading,
    reload,
  }
}

