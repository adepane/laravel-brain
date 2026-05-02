import { useState, useRef, useEffect } from 'react'
import type { StressTestResult } from '../types/graph'

interface Props {
  method: string
  uri: string
  theme: 'dark' | 'light'
  selectedId: string
  onStressChange: (nodeId: string | null) => void
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

function statusColor(code: string): string {
  const n = parseInt(code, 10)
  if (n >= 200 && n < 300) return '#22c55e'
  if (n >= 400 && n < 500) return '#f97316'
  if (n >= 500) return '#ef4444'
  return '#6b7280'
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

// ---------------------------------------------------------------------------
// Cache — module-level Map (memory) + localStorage (persistence across reloads)
// ---------------------------------------------------------------------------
interface RouteCache {
  result: StressTestResult | null
  error: string | null
  count: number
  concurrency: number
  headersRaw: string
  body: string
  timeout: number
  jobId: string | null
  savedAt: number
}

const routeCache = new Map<string, RouteCache>()

function loadCache(key: string): RouteCache | undefined {
  const mem = routeCache.get(key)
  if (mem) return mem
  try {
    const raw = localStorage.getItem(`lb_st_${key}`)
    if (raw) {
      const parsed = JSON.parse(raw) as RouteCache
      routeCache.set(key, parsed)
      return parsed
    }
  } catch {
    // ignore storage errors
  }
  return undefined
}

function saveCache(key: string, data: Omit<RouteCache, 'savedAt'>) {
  const entry: RouteCache = { ...data, savedAt: Date.now() }
  routeCache.set(key, entry)
  try {
    localStorage.setItem(`lb_st_${key}`, JSON.stringify(entry))
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Request path trace — BFS from route node through the graph
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StressTestPanel({ method, uri, selectedId, onStressChange }: Props) {
  const currentKey = `${method}::${uri}`

  const [open, setOpen] = useState(() => {
    const c = loadCache(currentKey)
    return !!(c?.result || c?.error || c?.jobId)
  })

  // Todo 1: derive base URL from the /_laravel-brain URL path so subdirectory
  // installs (e.g. http://myapp.test/sub/_laravel-brain) also work correctly.
  const [baseUrl, setBaseUrl] = useState(() => {
    const href = window.location.href
    const idx = href.indexOf('/_laravel-brain')
    return idx !== -1 ? href.slice(0, idx) : window.location.origin
  })

  // Todo 2: initialise all state lazily from the cache (memory + localStorage).
  // This correctly handles the remount case where the user visited a non-route
  // node and then came back — the component remounts fresh but reads saved data.
  const [count, setCount] = useState(() => loadCache(currentKey)?.count ?? 10)
  const [concurrency, setConcurrency] = useState(() => loadCache(currentKey)?.concurrency ?? 2)
  const [headersRaw, setHeadersRaw] = useState(() => loadCache(currentKey)?.headersRaw ?? '')
  const [body, setBody] = useState(() => {
    const cached = loadCache(currentKey)
    return cached?.body ?? (BODY_METHODS.has(method.toUpperCase()) ? '{}' : '')
  })
  const [timeout, setTimeout_] = useState(() => loadCache(currentKey)?.timeout ?? 10)
  const [running, setRunning] = useState(() => {
    const c = loadCache(currentKey)
    return !!(c?.jobId && !c?.result)
  })
  const [jobId, setJobId] = useState<string | null>(() => loadCache(currentKey)?.jobId ?? null)
  const [result, setResult] = useState<StressTestResult | null>(() => loadCache(currentKey)?.result ?? null)
  const [error, setError] = useState<string | null>(() => loadCache(currentKey)?.error ?? null)
  const [pollCount, setPollCount] = useState(0)

  // AbortController so in-flight requests are cancelled when component unmounts
  const abortRef = useRef<AbortController | null>(null)

  // Ref that always holds the latest state — used by the unmount cleanup so the
  // closure doesn't go stale (no need to list state in cleanup deps).
  const latestRef = useRef({ result, error, count, concurrency, headersRaw, body, timeout, jobId, key: currentKey })

  async function pollForResult(jobId: string, signal: AbortSignal) {
    const MAX_WAIT_S = 180
    let waited = 0

    while (waited < MAX_WAIT_S) {
      if (signal.aborted) return

      await new Promise<void>((resolve) => setTimeout(resolve, 1000))
      waited++
      setPollCount(waited)

      if (signal.aborted) return

      try {
        const res = await fetch(`/_laravel-brain/api/stress-test/${jobId}`, { signal })
        const data = await res.json()

        if (data.status === 'done') {
          const finalResult = data.result as StressTestResult
          setResult(finalResult)
          setJobId(null)
          saveCache(currentKey, { result: finalResult, error: null, count, concurrency, headersRaw, body, timeout, jobId: null })
          setPollCount(0)
          return
        }

        if (data.status === 'error') {
          setError(data.error ?? 'Unknown error')
          setJobId(null)
          saveCache(currentKey, { result: null, error: data.error ?? 'Unknown error', count, concurrency, headersRaw, body, timeout, jobId: null })
          setPollCount(0)
          return
        }

        // status === 'running' → keep polling
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        // Network hiccup during poll — retry next cycle
      }
    }

    setPollCount(0)
    setJobId(null)
    saveCache(currentKey, { result: null, error: 'Stress test timed out after 3 minutes', count, concurrency, headersRaw, body, timeout, jobId: null })
    setError('Stress test timed out after 3 minutes')
  }

  // Keep latestRef in sync after every render (must be declared before the
  // unmount effect so it runs first and the cleanup reads fresh values).
  useEffect(() => {
    latestRef.current = { result, error, count, concurrency, headersRaw, body, timeout, jobId, key: currentKey }
  })

  // Resume polling if a jobId was cached (e.g. panel was closed mid-run)
  useEffect(() => {
    const cached = loadCache(currentKey)
    if (cached?.jobId && !cached?.result) {
      onStressChange(selectedId)
      abortRef.current = new AbortController()
      pollForResult(cached.jobId, abortRef.current.signal).finally(() => {
        setRunning(false)
        setPollCount(0)
        onStressChange(null)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save state to cache + localStorage on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      const s = latestRef.current
      saveCache(s.key, {
        result: s.result, error: s.error,
        count: s.count, concurrency: s.concurrency,
        headersRaw: s.headersRaw, body: s.body, timeout: s.timeout,
        jobId: s.jobId,
      })
    }
  }, [])

  const cached = loadCache(currentKey)
  const lastRunLabel = cached?.savedAt && cached.result ? timeAgo(cached.savedAt) : null

  function parseHeaders(raw: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const idx = line.indexOf(':')
      if (idx > 0) {
        const k = line.slice(0, idx).trim()
        const v = line.slice(idx + 1).trim()
        if (k) out[k] = v
      }
    }
    return out
  }

  async function handleRun() {
    setRunning(true)
    setResult(null)
    setError(null)
    onStressChange(selectedId)

    const url = baseUrl.replace(/\/$/, '') + '/' + uri.replace(/^\//, '')
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    try {
      const res = await fetch('/_laravel-brain/api/stress-test', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          method: method.toUpperCase(),
          url,
          count,
          concurrency,
          headers: parseHeaders(headersRaw),
          body: body || null,
          timeout,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`)
        return
      }

      // Background job — server freed its thread immediately; poll for results
      if (data.jobId) {
        setJobId(data.jobId)
        saveCache(currentKey, { result: null, error: null, count, concurrency, headersRaw, body, timeout, jobId: data.jobId })
        await pollForResult(data.jobId, signal)
        return
      }

      // Synchronous result (multi-threaded server fallback)
      const finalResult = data as StressTestResult
      setResult(finalResult)
      setJobId(null)
      saveCache(currentKey, { result: finalResult, error: null, count, concurrency, headersRaw, body, timeout, jobId: null })

    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Network error')
      }
    } finally {
      setRunning(false)
      setPollCount(0)
      onStressChange(null)
    }
  }

  const metrics = result
    ? [
        { label: 'Min',     value: `${result.timing.min}ms` },
        { label: 'Avg',     value: `${result.timing.avg}ms` },
        { label: 'P50',     value: `${result.timing.p50}ms` },
        { label: 'P95',     value: `${result.timing.p95}ms` },
        { label: 'P99',     value: `${result.timing.p99}ms` },
        { label: 'Max',     value: `${result.timing.max}ms` },
        { label: 'Req/s',   value: String(result.throughput) },
        { label: 'Success', value: `${result.successRate}%` },
        { label: 'Wall',    value: `${result.wallTimeMs}ms` },
      ]
    : []

  return (
    <div className="st-section sidebar-section">
      <div className="st-toggle" onClick={() => setOpen((o) => !o)}>
        <h3>Stress Test</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRunLabel && !open && (
            <span className="st-last-run">{lastRunLabel}</span>
          )}
          <span className="st-toggle-icon">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="st-body">

          <div className="st-form">
            <div className="st-form-row">
              <span className="st-label">Base URL</span>
              <input
                className="st-input"
                type="text"
                placeholder="http://localhost:8000"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="st-form-row">
              <span className="st-label">Target</span>
              <span className="st-uri-preview">
                <span className="st-method-badge">{method.toUpperCase()}</span>
                {uri}
              </span>
            </div>

            <div className="st-form-row">
              <span className="st-label">Requests</span>
              <input
                className="st-input st-input--short"
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
              />
              <span className="st-label" style={{ minWidth: 'auto', marginLeft: 8 }}>Concurrency</span>
              <input
                className="st-input st-input--short"
                type="number"
                min={1}
                max={20}
                value={concurrency}
                onChange={(e) => setConcurrency(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
              />
            </div>

            <div className="st-form-row">
              <span className="st-label">Timeout (s)</span>
              <input
                className="st-input st-input--short"
                type="number"
                min={1}
                max={30}
                value={timeout}
                onChange={(e) => setTimeout_(Math.max(1, Math.min(30, parseInt(e.target.value) || 10)))}
              />
            </div>

            <div className="st-form-col">
              <span className="st-label">Headers</span>
              <textarea
                className="st-textarea"
                rows={3}
                placeholder={'Authorization: Bearer token\nAccept: application/json'}
                value={headersRaw}
                onChange={(e) => setHeadersRaw(e.target.value)}
              />
            </div>

            {BODY_METHODS.has(method.toUpperCase()) && (
              <div className="st-form-col">
                <span className="st-label">Body (JSON)</span>
                <textarea
                  className="st-textarea"
                  rows={4}
                  placeholder="{}"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            )}

            <button
              className="st-run-btn"
              onClick={handleRun}
              disabled={running}
            >
              {running ? `⏳ Running… ${pollCount > 0 ? `(${pollCount}s)` : ''}` : '▶ Run Stress Test'}
            </button>

            {lastRunLabel && (
              <span className="st-last-run st-last-run--form">Last run: {lastRunLabel}</span>
            )}
          </div>

          {error && (
            <div className="st-error-box">
              {error}
            </div>
          )}

          {result && (
            <div className="st-results">
              <div className="st-metrics-grid">
                {metrics.map((m) => (
                  <div key={m.label} className="st-metric">
                    <div className="st-metric-value">{m.value}</div>
                    <div className="st-metric-label">{m.label}</div>
                  </div>
                ))}
              </div>

              {Object.keys(result.statusDistribution).length > 0 && (
                <div className="st-dist">
                  <div className="st-dist-title">Status Distribution</div>
                  {Object.entries(result.statusDistribution)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([code, cnt]) => (
                      <div key={code} className="st-dist-row">
                        <span className="st-dist-label">{code === '0' ? 'err' : code}</span>
                        <div className="st-dist-bar-wrap">
                          <div
                            className="st-dist-bar"
                            style={{
                              width: `${(cnt / result.total) * 100}%`,
                              background: statusColor(code),
                            }}
                          />
                        </div>
                        <span className="st-dist-count">{cnt}</span>
                      </div>
                    ))}
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="st-error-box" style={{ marginTop: 8 }}>
                  {result.errors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
