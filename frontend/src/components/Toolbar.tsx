import { useState, useRef, useEffect, useMemo } from 'react'
import type { Core } from 'cytoscape'
import { LARGE_GRAPH_THRESHOLD } from '../utils/graphConstants'
import { ExportModal } from './ExportModal'
import { graphToMermaid, downloadPng } from '../utils/exportUtils'
import type { GraphData } from '../types/graph'

interface Props {
  layout: string
  nodeCount: number
  edgeCount: number
  visibleCount: number
  activeTabLabel: string
  graphData: GraphData | null
  analyzedAt?: string
  theme: 'dark' | 'light'
  onLayoutChange: (layout: string) => void
  rankDir: 'LR' | 'TB'
  onRankDirChange: (dir: 'LR' | 'TB') => void
  onSearch: (query: string) => void
  onToggleTheme: () => void
  cyRef: React.MutableRefObject<Core | null>
}

function formatAge(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

const LAYOUTS = [
  { value: 'dagre', label: 'Hierarchical (dagre)' },
  { value: 'breadthfirst', label: 'Breadth-first' },
  { value: 'cose-bilkent', label: 'Force (cose-bilkent)' },
  { value: 'circle', label: 'Circle' },
  { value: 'grid', label: 'Grid' },
]



function ActionDropdown({ label, icon, children }: { label: string, icon: React.ReactNode, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="action-dropdown" ref={ref}>
      <button className={`toolbar-btn ${isOpen ? 'toolbar-btn--active' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        {icon} <span>{label}</span> <span className="dropdown-chevron">▾</span>
      </button>
      {isOpen && (
        <div className="action-dropdown-menu">
          {children}
        </div>
      )}
    </div>
  )
}

export function Toolbar({ layout, rankDir, onRankDirChange, nodeCount, edgeCount, visibleCount, activeTabLabel, graphData, analyzedAt, theme, onLayoutChange, onSearch, onToggleTheme, cyRef }: Props) {
  const [searchValue, setSearchValue] = useState('')
  const [showMermaid, setShowMermaid] = useState(false)
  const [scanning, setScanning] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      onSearch(searchValue)
    }, 250)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [searchValue, onSearch])

  const handleFit = () => cyRef.current?.fit()

  const handleExportPng = () => {
    const cy = cyRef.current
    if (!cy) return
    const dataUrl = cy.png({ output: 'base64uri', scale: 2, full: true })
    const safe = activeTabLabel.replace(/[^a-z0-9]/gi, '_')
    downloadPng(dataUrl, `${safe}_graph.png`)
  }

  const handleExportMermaid = () => {
    if (graphData) setShowMermaid(true)
  }

  const handleScan = async () => {
    if (!window.confirm('This will re-scan the entire project. Proceed?')) return
    setScanning(true)
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'api/scan', { method: 'POST' })
      if (res.ok) {
        window.location.reload()
      } else {
        alert('Scan failed.')
      }
    } catch {
      alert('Scan failed.')
    } finally {
      setScanning(false)
    }
  }

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const ageData = useMemo(() => {
    if (!analyzedAt) return null
    const ageMs = now - new Date(analyzedAt).getTime()
    return {
      ageMs,
      isStale: ageMs > 24 * 3600 * 1000,
      label: `Scanned ${formatAge(ageMs)} ago`
    }
  }, [analyzedAt, now])

  const isLarge = nodeCount > LARGE_GRAPH_THRESHOLD

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-brand">
          {theme === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="260" height="56" viewBox="0 0 260 56" fill="none" className="toolbar-logo-img" aria-label="Laravel Brain">
              <text x="4" y="40" fontFamily="Space Grotesk, sans-serif" fontWeight="300" fontSize="36" fill="#F2F2F8" fillOpacity="0.65" letterSpacing="0">Laravel</text>
              <circle cx="138" cy="18" r="3.5" fill="#8B6FE8" opacity="0.45"/>
              <circle cx="138" cy="28" r="5" fill="#8B6FE8"/>
              <circle cx="138" cy="38" r="3.5" fill="#8B6FE8" opacity="0.45"/>
              <line x1="138" y1="21.5" x2="138" y2="23.5" stroke="#8B6FE8" strokeWidth="1" opacity="0.35"/>
              <line x1="138" y1="33" x2="138" y2="35" stroke="#8B6FE8" strokeWidth="1" opacity="0.35"/>
              <text x="152" y="40" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="36" fill="#8B6FE8" letterSpacing="0">Brain</text>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="260" height="56" viewBox="0 0 260 56" fill="none" className="toolbar-logo-img" aria-label="Laravel Brain">
              <text x="4" y="40" fontFamily="Space Grotesk, sans-serif" fontWeight="300" fontSize="36" fill="#111218" fillOpacity="0.55" letterSpacing="-1">Laravel</text>
              <circle cx="138" cy="18" r="3.5" fill="#8B6FE8" opacity="0.45"/>
              <circle cx="138" cy="28" r="5" fill="#8B6FE8"/>
              <circle cx="138" cy="38" r="3.5" fill="#8B6FE8" opacity="0.45"/>
              <line x1="138" y1="21.5" x2="138" y2="23.5" stroke="#8B6FE8" strokeWidth="1" opacity="0.35"/>
              <line x1="138" y1="33" x2="138" y2="35" stroke="#8B6FE8" strokeWidth="1" opacity="0.35"/>
              <text x="152" y="40" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="36" fill="#8B6FE8" letterSpacing="-1">Brain</text>
            </svg>
          )}
        </div>

        <div className="toolbar-stats">
          <span className="stat-chip">{visibleCount}/{nodeCount} nodes</span>
          <span className="stat-chip">{edgeCount} edges</span>
          {isLarge && (
            <span className="stat-chip stat-chip--warn" title="Large graph: dagre auto-switched to breadthfirst">
              ⚠ large graph
            </span>
          )}
          {ageData && (
            ageData.isStale ? (
              <button
                className="stat-chip stat-chip--stale"
                onClick={handleScan}
                title={`Graph is over 24h old (last scanned ${analyzedAt ? new Date(analyzedAt).toLocaleString() : ''}). Click to re-scan.`}
              >
                ⚠ {ageData.label} — Re-scan?
              </button>
            ) : (
              <span
                className="stat-chip stat-chip--age"
                title={`Last scanned: ${analyzedAt ? new Date(analyzedAt).toLocaleString() : ''}`}
              >
                {ageData.label}
              </span>
            )
          )}
        </div>

        <div className="toolbar-controls">
          {/* Group 1: View */}
          <div className="toolbar-group">
            <ActionDropdown 
              label="View" 
              icon={<span>⊡</span>}
            >
              <div className="dropdown-item">
                <label>Layout</label>
                <select
                  value={layout}
                  onChange={(e) => onLayoutChange(e.target.value)}
                  className="toolbar-select"
                >
                  {LAYOUTS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {layout === 'dagre' && (
                <div className="dropdown-item">
                  <label>Orientation</label>
                  <button
                    className="toolbar-btn toolbar-btn--rank"
                    onClick={() => onRankDirChange(rankDir === 'LR' ? 'TB' : 'LR')}
                  >
                    {rankDir === 'LR' ? 'Horizontal (LR)' : 'Vertical (TB)'}
                  </button>
                </div>
              )}

              <div className="dropdown-item">
                <button onClick={handleFit} className="toolbar-btn w-full">
                  <span>⊡</span> <span>Fit to Screen</span>
                </button>
              </div>
            </ActionDropdown>
          </div>
 
          {/* Group 2: Search */}
          <div className="toolbar-group">
            <div className="toolbar-search-wrapper">
              <input
                type="search"
                placeholder="Search nodes..."
                className="toolbar-search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
            </div>
          </div>
 
          {/* Group 3: Exports */}
          <div className="toolbar-group">
            <ActionDropdown 
              label="Export" 
              icon={<span>🖼</span>}
            >
              <div className="dropdown-item">
                <button onClick={handleExportPng} className="toolbar-btn w-full">
                  <span>🖼</span> <span>Download PNG</span>
                </button>
              </div>
              <div className="dropdown-item">
                <button
                  onClick={handleExportMermaid}
                  className="toolbar-btn w-full"
                  disabled={!graphData}
                >
                  <span>🗺</span> <span>Copy Mermaid Code</span>
                </button>
              </div>
            </ActionDropdown>
          </div>
 
          {/* Group 4: System */}
          <div className="toolbar-group">
            <button
              onClick={handleScan}
              className={`toolbar-btn toolbar-btn--scan ${scanning ? 'toolbar-btn--loading' : ''}`}
              title="Re-scan project"
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <div className="btn-spinner btn-spinner--small" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>Re-scan</span>
                </>
              )}
            </button>
 
            <button
              onClick={onToggleTheme}
              className="theme-toggle"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </div>

      {showMermaid && graphData && (
        <ExportModal
          mermaidCode={graphToMermaid(graphData, activeTabLabel)}
          filename={`${activeTabLabel.replace(/[^a-z0-9]/gi, '_')}_graph.mmd`}
          title={`${activeTabLabel} — Full Lifecycle Graph`}
          onClose={() => setShowMermaid(false)}
        />
      )}
    </>
  )
}
