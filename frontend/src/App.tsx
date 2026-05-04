import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import type { Core } from 'cytoscape'
import { useManifest } from './hooks/useManifest'
import { useTabGraph } from './hooks/useTabGraph'
import { useVirtualGraph } from './hooks/useVirtualGraph'
import { useTheme } from './hooks/useTheme'
import { GraphView } from './components/GraphView'
import { LARGE_GRAPH_THRESHOLD } from './utils/graphConstants'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { LeftSidebar } from './components/LeftSidebar'
import type { GraphNode, TabEntry } from './types/graph'
import './App.css'

const ALL_TYPES: GraphNode['type'][] = [
  'route', 'middleware', 'controller', 'action', 'service', 'model', 'event', 'job',
  'command', 'channel', 'schedule',
]

// Node types that should have their methods expanded on first click

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { manifest, loading: manifestLoading, error: manifestError } = useManifest()
  const { state: tabState, elements: allElements, load } = useTabGraph()
  const elements = useVirtualGraph(allElements)

  const [activeTab, setActiveTab] = useState<TabEntry | null>(null)
  const [loadingTabId, setLoadingTabId] = useState<string | null>(null)
  const [layout, setLayout] = useState('dagre')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(ALL_TYPES))
  const [rankDir, setRankDir] = useState<'LR' | 'TB'>('TB')
  const [stressTestNodeId, setStressTestNodeId] = useState<string | null>(null)
  const cyRef = useRef<Core | null>(null)

  const handleSelectTab = useCallback((tab: TabEntry) => {
    if (activeTab?.id === tab.id) return
    
    // Update URL if different
    const url = new URL(window.location.href)
    if (url.searchParams.get('tab') !== tab.id) {
      url.searchParams.set('tab', tab.id)
      window.history.pushState({ tabId: tab.id }, '', url.toString())
    }

    setActiveTab(tab)
    setSearchQuery('')
    load(tab.file)
  }, [activeTab, load])

  // Auto-select tab ONLY if tab ID is present in URL
  const [prevManifest, setPrevManifest] = useState(manifest)
  if (manifest !== prevManifest) {
    setPrevManifest(manifest)
    if (manifest && !activeTab) {
      const params = new URLSearchParams(window.location.search)
      const urlTabId = params.get('tab')
      const targetTab = manifest.tabs.find((t) => t.id === urlTabId)
      if (targetTab) {
        handleSelectTab(targetTab)
      }
    }
  }

  // Adjust state during render when tab data changes (avoids Effect cascading render)
  const [prevTabData, setPrevTabData] = useState(tabState.data)
  if (tabState.data !== prevTabData) {
    setPrevTabData(tabState.data)
    if (tabState.data) {
      const nodeCount = tabState.data.nodes.length
      const nextVisible = new Set(
        nodeCount > LARGE_GRAPH_THRESHOLD
          ? ALL_TYPES.filter((t) => t !== 'middleware')
          : ALL_TYPES
      )
      setVisibleTypes(nextVisible)
    }
    setSelectedId(null)
  }

  // Sync state with URL on back/forward
  useEffect(() => {
    const handlePopState = () => {
      if (!manifest) return
      const params = new URLSearchParams(window.location.search)
      const tabId = params.get('tab')
      const tab = manifest.tabs.find((t) => t.id === tabId)
      if (tab) {
        setActiveTab(tab)
        load(tab.file)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [manifest, load])

  // Node click: select
  const handleNodeSelect = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  // Adjust loading state during render
  const [prevTabLoading, setPrevTabLoading] = useState(tabState.loading)
  if (tabState.loading !== prevTabLoading) {
    setPrevTabLoading(tabState.loading)
    if (!tabState.loading) {
      setLoadingTabId(null)
    }
  }

  const groupedTabs = useMemo(() => {
    if (!manifest) return { fileGroups: [] }
    const routeTabs = manifest.tabs;

    // Group route tabs by their source route file or virtual category
    const byFile = new Map<string, TabEntry[]>()
    routeTabs.forEach((tab) => {
      let key: string
      if (tab.category === 'Command') {
        key = 'Console Commands'
      } else if (tab.category === 'Channel') {
        key = 'Broadcast Channels'
      } else if (tab.category === 'Schedule') {
        key = 'Schedules'
      } else {
        key = tab.routeFile ?? 'routes.php'
      }
      const list = byFile.get(key) ?? []
      list.push(tab)
      byFile.set(key, list)
    })

    // Within each file, group by first URI path segment.
    // HTTP tabs (GET /api/users) → group by first path segment (/api).
    // Non-HTTP tabs (commands, channels) have no slash structure → flat list under '_'.
    const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'ANY'])

    const fileGroups = [...byFile.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fileName, tabs]) => {
        const byPrefix = new Map<string, TabEntry[]>()
        tabs.forEach((tab) => {
          const firstWord = tab.label.split(' ')[0]
          const isHttp = HTTP_METHODS.has(firstWord)
          let prefix: string
          if (isHttp) {
            const uri = tab.label.replace(/^[A-Z]+\s+/, '')
            prefix = uri.split('/').filter(Boolean)[0] ?? '/'
          } else {
            // Commands/channels: group by the part before the first colon or slash,
            // or use '_flat' sentinel to render them without a prefix wrapper.
            prefix = '_flat'
          }
          const list = byPrefix.get(prefix) ?? []
          list.push(tab)
          byPrefix.set(prefix, list)
        })
        const prefixGroups = [...byPrefix.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([prefix, tabs]) => ({ prefix, tabs }))
        return { fileName, prefixGroups }
      })

    return { fileGroups }
  }, [manifest])

  const typeCounts = useMemo(() => {
    if (!tabState.data) return {} as Record<string, number>
    return tabState.data.nodes.reduce<Record<string, number>>((acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1
      return acc
    }, {})
  }, [tabState.data])

  const visibleNodeCount = useMemo(() => {
    if (!tabState.data) return 0
    return tabState.data.nodes.filter((n) => visibleTypes.has(n.type)).length
  }, [tabState.data, visibleTypes])

  const toggleType = useCallback((type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  const onShowAll = useCallback(() => setVisibleTypes(new Set(ALL_TYPES)), [])
  const onHideAll = useCallback(() => setVisibleTypes(new Set()), [])

  const [scanning, setScanning] = useState(false)
  const [complexityOverlay, setComplexityOverlay] = useState(false)
  const [complexityFilter, setComplexityFilter] = useState<'all' | 'complex' | 'critical'>('all')

  const handleScan = async () => {
    if (!window.confirm('This will scan the entire project. Proceed?')) return
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



  if (manifestLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading project graph...</p>
      </div>
    )
  }

  if (manifestError || !manifest) {
    return (
      <div className="error-screen welcome-screen">
        <div className="welcome-card">
          <div className="welcome-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180" fill="none">
              <rect width="180" height="180" fill="#111218" rx="28"/>
              <g transform="translate(18,18) scale(2.0)">
                <circle cx="36" cy="36" r="30" fill="#8B6FE8" opacity="0.14"/>
                <line x1="14" y1="16" x2="8" y2="30" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="8" y1="30" x2="18" y2="44" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="14" y1="16" x2="28" y2="26" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="8" y1="30" x2="28" y2="26" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="18" y1="44" x2="28" y2="26" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="28" y1="26" x2="36" y2="36" stroke="#8B6FE8" strokeWidth="1.3" opacity="0.7"/>
                <line x1="28" y1="26" x2="44" y2="26" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="36" y1="36" x2="44" y2="26" stroke="#8B6FE8" strokeWidth="1.3" opacity="0.7"/>
                <line x1="36" y1="36" x2="54" y2="44" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="44" y1="26" x2="58" y2="16" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="44" y1="26" x2="64" y2="30" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="58" y1="16" x2="64" y2="30" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="64" y1="30" x2="54" y2="44" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <line x1="54" y1="44" x2="28" y2="26" stroke="#8B6FE8" strokeWidth="0.9" opacity="0.35"/>
                <circle cx="14" cy="16" r="2.2" fill="#8B6FE8" opacity="0.55"/>
                <circle cx="8" cy="30" r="2.2" fill="#8B6FE8" opacity="0.55"/>
                <circle cx="18" cy="44" r="2.2" fill="#8B6FE8" opacity="0.55"/>
                <circle cx="28" cy="26" r="3.5" fill="#8B6FE8" opacity="0.85"/>
                <circle cx="36" cy="36" r="5" fill="#8B6FE8" opacity="1"/>
                <circle cx="44" cy="26" r="3.5" fill="#8B6FE8" opacity="0.85"/>
                <circle cx="58" cy="16" r="2.2" fill="#8B6FE8" opacity="0.55"/>
                <circle cx="64" cy="30" r="2.2" fill="#8B6FE8" opacity="0.55"/>
                <circle cx="54" cy="44" r="2.2" fill="#8B6FE8" opacity="0.55"/>
              </g>
            </svg>
          </div>
          <h2>Welcome to Laravel Brain</h2>
          <p>No project analysis found. To begin exploring your code architecture, please run an initial scan.</p>

          {manifestError && manifestError !== 'HTTP 404' && (
            <div className="error-details">
              <small>Error: {manifestError}</small>
            </div>
          )}

          <button
            className={`scan-btn ${scanning ? 'scan-btn--loading' : ''}`}
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <div className="btn-spinner" />
                Analyzing Project...
              </>
            ) : (
              '🚀 Start Initial Scan'
            )}
          </button>

          <div className="welcome-hint">
            Alternatively, run <code>php artisan brain:scan</code> in your terminal.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Toolbar
        layout={layout}
        nodeCount={tabState.data?.meta.nodeCount ?? activeTab?.nodeCount ?? 0}
        edgeCount={tabState.data?.meta.edgeCount ?? activeTab?.edgeCount ?? 0}
        visibleCount={visibleNodeCount}
        activeTabLabel={activeTab?.label ?? 'graph'}
        graphData={tabState.data ?? null}
        analyzedAt={manifest.analyzedAt}
        theme={theme}
        onLayoutChange={setLayout}
        rankDir={rankDir}
        onRankDirChange={setRankDir}
        onSearch={setSearchQuery}
        onToggleTheme={toggleTheme}
        cyRef={cyRef}
        complexityOverlay={complexityOverlay}
        onToggleComplexityOverlay={() => setComplexityOverlay(v => !v)}
      />
      <div className="main">
        <LeftSidebar
          fileGroups={groupedTabs.fileGroups ?? []}
          activeId={activeTab?.id ?? null}
          loadingId={loadingTabId}
          onSelect={handleSelectTab}
          visibleTypes={visibleTypes}
          counts={typeCounts}
          onToggle={toggleType}
          onShowAll={onShowAll}
          onHideAll={onHideAll}
          graphData={tabState.data ?? null}
          complexityFilter={complexityFilter}
          onComplexityFilterChange={setComplexityFilter}
          onNodeSelect={handleNodeSelect}
          selectedId={selectedId}
        />
        <div className="graph-container">
          {tabState.loading && (
            <div className="graph-loading-overlay">
              <div className="loading-spinner" />
              <p>Loading {activeTab?.label}…</p>
            </div>
          )}
          {tabState.error && (
            <div className="graph-loading-overlay">
              <p style={{ color: '#F44336' }}>Error: {tabState.error}</p>
            </div>
          )}
          {!activeTab && !tabState.loading && (
            <div className="graph-placeholder">
              <div className="placeholder-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h3>Select a route to explore</h3>
              <p>Expand the files in the sidebar and choose a route or command to visualize its execution lifecycle and dependencies.</p>
            </div>
          )}
          {!tabState.loading && activeTab && elements.length === 0 && !tabState.error && (
             <div className="graph-placeholder">
               <div className="placeholder-icon">
                 <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                   <circle cx="12" cy="12" r="10" />
                   <line x1="12" y1="8" x2="12" y2="12" />
                   <line x1="12" y1="16" x2="12.01" y2="16" />
                 </svg>
               </div>
               <h3>Empty Graph</h3>
               <p>No nodes or edges found for this route.</p>
             </div>
          )}
          {!tabState.loading && elements.length > 0 && (
            <GraphView
              key={activeTab?.id}
              elements={elements}
              layout={layout}
              searchQuery={searchQuery}
              rankDir={rankDir}
              visibleTypes={visibleTypes}
              theme={theme}
              onNodeSelect={handleNodeSelect}
              cyRef={cyRef}
              stressTestNodeId={stressTestNodeId}
              complexityOverlay={complexityOverlay}
            />
          )}
        </div>
        <Sidebar
          selectedId={selectedId}
          graphData={tabState.data}
          theme={theme}
          onClose={() => setSelectedId(null)}
          onStressChange={setStressTestNodeId}
        />
      </div>
    </div>
  )
}
