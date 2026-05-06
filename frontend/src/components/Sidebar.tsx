import { useMemo, useRef, useCallback, useState } from 'react'
import type { GraphData, GraphNode, GraphEdge, FlowStep, DbQuery } from '../types/graph'
import { FlowchartView } from './FlowchartView'
import { FlowchartModal } from './FlowchartModal'
import { SourceView } from './SourceView'
import { SourceModal } from './SourceModal'
import { StressTestPanel } from './StressTestPanel'
import { SequenceDiagramView } from './SequenceDiagramView'
import { SequenceDiagramModal } from './SequenceDiagramModal'
import { buildSequenceDiagram } from '../utils/sequenceUtils'

const MIN_WIDTH = 200
const MAX_WIDTH = 640
const DEFAULT_WIDTH = 320

interface Props {
  selectedId: string | null
  graphData: GraphData | null
  theme: 'dark' | 'light'
  onClose: () => void
  onStressChange: (nodeId: string | null) => void
}

const TYPE_COLORS: Record<string, string> = {
  route:      '#4CAF50',
  middleware: '#FF9800',
  controller: '#2196F3',
  action:     '#03A9F4',
  service:    '#9C27B0',
  validation_request: '#0d9488',
  model:      '#F44336',
  event:      '#FFD600',
  job:        '#607D8B',
  command:    '#14b8a6',
  channel:    '#8b5cf6',
  schedule:   '#f97316',
  view:       '#ec4899',
  mail:       '#f472b6',
  notification: '#db2777',
  enum:       '#0ea5e9',
  interface:  '#38bdf8',
  trait:      '#a78bfa',
  abstract_class: '#94a3b8',
  service_provider: '#ca8a04',
  facade:     '#00BCD4',
  filament_panel:            '#7C3AED',
  filament_resource:         '#A855F7',
  filament_page:             '#C084FC',
  filament_page_method:      '#E879F9',
  filament_widget:           '#06B6D4',
  filament_relation_manager: '#0891B2',
}

type TabId = 'info' | 'flow' | 'source' | 'edges' | 'stress'

export function Sidebar({ selectedId, graphData, theme, onClose, onStressChange }: Props) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = width

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startX.current - ev.clientX
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
      setWidth(next)
    }
    const onUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false)
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false)
  const [isSeqModalOpen, setIsSeqModalOpen] = useState(false)
  const [aiCopied, setAiCopied] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  // Reset tab + modal state when selection changes (avoids Effect cascading render)
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId)
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId)
    setActiveTab('info')
    setIsFlowModalOpen(false)
    setIsSourceModalOpen(false)
    setIsSeqModalOpen(false)
    setAiCopied(false)
    setAiLoading(false)
  }

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    if (graphData) graphData.nodes.forEach((n) => map.set(n.id, n))
    return map
  }, [graphData])

  const incomingMap = useMemo(() => {
    const map = new Map<string, GraphEdge[]>()
    if (!graphData) return map
    graphData.edges.forEach((e) => {
      const list = map.get(e.target) ?? []
      list.push(e)
      map.set(e.target, list)
    })
    return map
  }, [graphData])

  const outgoingMap = useMemo(() => {
    const map = new Map<string, GraphEdge[]>()
    if (!graphData) return map
    graphData.edges.forEach((e) => {
      const list = map.get(e.source) ?? []
      list.push(e)
      map.set(e.source, list)
    })
    return map
  }, [graphData])

  const sequenceDiagram = useMemo(() => {
    if (!graphData || !selectedId) return null
    const node = graphData.nodes.find(n => n.id === selectedId)
    if (node?.type !== 'route') return null
    return buildSequenceDiagram(selectedId, graphData)
  }, [selectedId, graphData])

  const handleCopyAiContext = useCallback(async () => {
    if (!selectedId) return
    setAiLoading(true)
    try {
      const res = await fetch(
        import.meta.env.BASE_URL + `api/context?nodeId=${encodeURIComponent(selectedId)}&budget=6000`
      )
      if (!res.ok) throw new Error('Failed to fetch context')
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      setAiCopied(true)
      setTimeout(() => setAiCopied(false), 2500)
    } catch {
      alert('Could not copy AI context.')
    } finally {
      setAiLoading(false)
    }
  }, [selectedId])

  if (!graphData) return null

  if (!selectedId) {
    return (
      <div className="sidebar-resizable" style={{ width }}>
        <div className="sidebar-drag-handle" onMouseDown={onMouseDown} title="Drag to resize" />
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>{graphData.meta.project}</h2>
            <span className="sidebar-subtitle">Laravel Lifecycle Graph</span>
          </div>
          <div className="sidebar-stats">
            <div className="stat">
              <span className="stat-value">{graphData.meta.nodeCount}</span>
              <span className="stat-label">Nodes</span>
            </div>
            <div className="stat">
              <span className="stat-value">{graphData.meta.edgeCount}</span>
              <span className="stat-label">Edges</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {graphData.nodes.filter((n) => n.type === 'route').length}
              </span>
              <span className="stat-label">Routes</span>
            </div>
          </div>
          <p className="sidebar-hint">Click any node to inspect it</p>
        </div>
      </div>
    )
  }

  const node = nodeMap.get(selectedId)
  if (!node) return null

  const incomingEdges = incomingMap.get(selectedId) ?? []
  const outgoingEdges = outgoingMap.get(selectedId) ?? []
  const flowSteps = (node.data?.flowSteps ?? []) as FlowStep[]
  const filePath = (node.data?.file as string) || null
  const highlightLine = (node.data?.line as number) || undefined

  const color = TYPE_COLORS[node.type] ?? '#999'

  const metrics = node.data?.metrics as Record<string, number> | undefined
  const fatMethod = !!node.data?.fatMethod
  const fatClass = !!node.data?.fatClass
  const hasN1 = !!node.data?.hasN1

  const dbQueries = (node.data?.dbQueries ?? []) as DbQuery[]
  const relationships = (node.data?.relationships ?? []) as Array<{ type: string; related: string }>
  const middlewareParams = (node.type === 'middleware' && typeof node.data?.params === 'string' && node.data.params)
    ? (node.data.params as string).split(',').map(s => s.trim()).filter(Boolean)
    : []

  const structureMembers = (node.data?.members ?? []) as Array<Record<string, unknown>>

  const validationRules = (node.data?.validationRules ?? []) as Array<{ field: string; rules: string }>

  const displayData = Object.entries(node.data ?? {}).filter(
    ([key, val]) =>
      key !== 'flowSteps' &&
      key !== 'metrics' &&
      key !== 'fatMethod' &&
      key !== 'fatClass' &&
      key !== 'classMetrics' &&
      key !== 'dbQueries' &&
      key !== 'relationships' &&
      key !== 'params' &&
      key !== 'members' &&
      key !== 'validationRules' &&
      !(Array.isArray(val) && val.length === 0)
  )

  const hasFlow = flowSteps.length > 0 || !!sequenceDiagram
  const hasSource = !!filePath
  const hasEdges = incomingEdges.length > 0 || outgoingEdges.length > 0
  const isRoute = node.type === 'route'

  // If the active tab became unavailable after a node change, fall back to info
  const safeTab: TabId =
    (activeTab === 'flow' && !hasFlow) ||
    (activeTab === 'source' && !hasSource) ||
    (activeTab === 'edges' && !hasEdges) ||
    (activeTab === 'stress' && !isRoute)
      ? 'info'
      : activeTab

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'info', label: 'Info' },
    ...(hasFlow ? [{ id: 'flow' as TabId, label: 'Flow' }] : []),
    ...(hasSource ? [{ id: 'source' as TabId, label: 'Source' }] : []),
    ...(hasEdges ? [{ id: 'edges' as TabId, label: 'Edges', count: incomingEdges.length + outgoingEdges.length }] : []),
    ...(isRoute ? [{ id: 'stress' as TabId, label: 'Stress' }] : []),
  ]

  return (
    <div className="sidebar-resizable" style={{ width }}>
      <div className="sidebar-drag-handle" onMouseDown={onMouseDown} title="Drag to resize" />
      <div className="sidebar">

        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-header-actions">
            <button
              className="flow-popup-btn sidebar-ai-btn"
              title="Copy AI context to clipboard"
              onClick={handleCopyAiContext}
              disabled={aiLoading}
            >
              {aiLoading ? '…' : aiCopied ? '✓' : '🤖'}
            </button>
            <button className="sidebar-close" onClick={onClose}>×</button>
          </div>
          <div className="sidebar-badges">
            <span className="type-badge" style={{ backgroundColor: color }}>{node.type}</span>
            {typeof node.data?.visibility === 'string' && (
              <span className={`visibility-badge visibility-badge--${node.data.visibility}`}>
                {node.data.visibility === 'public' && '🔓 '}
                {node.data.visibility === 'protected' && '🛡️ '}
                {node.data.visibility === 'private' && '🔒 '}
                {node.data.visibility}
              </span>
            )}
          </div>
          <h2 className="sidebar-node-title">{node.label}</h2>
        </div>

        {/* Smell badges */}
        {(fatMethod || fatClass || hasN1) && (
          <div className="sidebar-smells">
            {hasN1 && (
              <span className="smell-badge smell-badge--n1" title="N+1 Query: database query inside a loop">
                ⚠️ N+1 Query
              </span>
            )}
            {fatMethod && (
              <span className="smell-badge smell-badge--fat-method" title="Fat Method: more than 30 lines or cyclomatic complexity > 10">
                🧱 Fat Method
              </span>
            )}
            {fatClass && (
              <span className="smell-badge smell-badge--fat-class" title="Fat Class: more than 10 methods or 300+ total lines">
                🏗️ Fat Class
              </span>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div className="sidebar-tab-bar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`sidebar-tab${safeTab === tab.id ? ' sidebar-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="sidebar-tab-badge">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="sidebar-tab-content">

          {/* ── Info tab ── */}
          {safeTab === 'info' && (
            <>
              {metrics && (
                <div className="sidebar-section sidebar-section--metrics">
                  <h3>Code Metrics</h3>
                  <div className="metrics-grid">
                    <div className="metric-item">
                      <span className="metric-value">{metrics.lineCount}</span>
                      <span className="metric-label">Lines</span>
                    </div>
                    <div className="metric-item">
                      <span
                        className="metric-value"
                        style={{ color: metrics.cyclomaticComplexity > 10 ? '#FF6D00' : 'inherit' }}
                      >
                        {metrics.cyclomaticComplexity}
                      </span>
                      <span className="metric-label">Complexity</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-value">{metrics.statementCount}</span>
                      <span className="metric-label">Statements</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-value">{metrics.paramCount}</span>
                      <span className="metric-label">Params</span>
                    </div>
                  </div>
                </div>
              )}

              {node.type === 'filament_resource' && !!node.data?.route && (
                <div className="sidebar-section">
                  <h3>Filament URL</h3>
                  <div className="prop-row">
                    <span className="prop-key">route</span>
                    <span className="prop-value" style={{ fontFamily: 'monospace', color: '#A855F7' }}>
                      {String(node.data.route)}
                    </span>
                  </div>
                </div>
              )}

              {relationships.length > 0 && (
                <div className="sidebar-section">
                  <h3>Relationships</h3>
                  {relationships.map((rel, i) => (
                    <div key={i} className="prop-row">
                      <span className="prop-key" style={{ color: '#9C27B0' }}>{rel.type}</span>
                      <span className="prop-value">
                        {rel.related.split('\\').pop() ?? rel.related}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {middlewareParams.length > 0 && (
                <div className="sidebar-section">
                  <h3>ATTRIBUTES</h3>
                  {middlewareParams.map((ability, i) => (
                    <div key={i} className="prop-row">
                      <span className="prop-key" style={{ color: '#FF9800' }}>{i + 1}</span>
                      <span className="prop-value">{ability}</span>
                    </div>
                  ))}
                </div>
              )}

              {validationRules.length > 0 && (
                <div className="sidebar-section sidebar-section--validation-rules">
                  <h3>Validation rules</h3>
                  <ul className="sidebar-structure-list">
                    {validationRules.map((row, i) => (
                      <li key={i} className="sidebar-structure-item">
                        <span className="structure-kind">field</span>
                        <span className="structure-name">{row.field}</span>
                        <span className="structure-value">{row.rules}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {dbQueries.length > 0 && (
                <div className="sidebar-section sidebar-section--queries">
                  <h3>DB Queries</h3>
                  <div className="query-list">
                    {dbQueries.map((q, i) => {
                      const tableName = q.table || (q.model ? q.model.split('\\').pop()! : '?')
                      const isWrite = ['insert', 'update', 'delete', 'statement'].includes(q.operation)
                      return (
                        <div key={i} className="query-item">
                          <span className={`query-op query-op--${isWrite ? 'write' : 'read'}`}>
                            {q.operation}
                          </span>
                          <span className="query-table" title={q.model || undefined}>
                            {tableName}
                          </span>
                          {q.type === 'raw' && (
                            <span className="query-badge query-badge--raw">SQL</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {structureMembers.length > 0 && (
                <div className="sidebar-section">
                  <h3>Structure</h3>
                  <ul className="sidebar-structure-list">
                    {structureMembers.map((m, i) => (
                      <li key={i} className="sidebar-structure-item">
                        <span className="structure-kind">{String(m.kind ?? 'item')}</span>
                        <span className="structure-name">{String(m.name ?? '')}</span>
                        {typeof m.declaringClass === 'string' && m.declaringClass !== '' && (
                          <span className="structure-decl" title="Declared on parent class">{m.declaringClass}</span>
                        )}
                        {m.value !== undefined && m.value !== null && (
                          <span className="structure-value">{String(m.value)}</span>
                        )}
                        {m.static === true && <span className="structure-flag">static</span>}
                        {typeof m.visibility === 'string' && (
                          <span className="structure-vis">{m.visibility}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="sidebar-section">
                <h3>Properties</h3>
                {displayData.map(([key, val]) => (
                  <div key={key} className="prop-row">
                    <span className="prop-key">{key}</span>
                    <span className="prop-value">
                      {Array.isArray(val)
                        ? val.map(item =>
                            typeof item === 'object' && item !== null
                              ? Object.values(item as Record<string, unknown>).join(' ')
                              : String(item)
                          ).join(', ') || '—'
                        : String(val) || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Flow tab ── */}
          {safeTab === 'flow' && (
            <>
              {flowSteps.length > 0 && (
                <div className="sidebar-section sidebar-section--flowchart">
                  <div className="sidebar-section-header">
                    <h3>Method Flow</h3>
                    <button
                      className="flow-popup-btn"
                      title="Open in large view"
                      onClick={() => setIsFlowModalOpen(true)}
                    >
                      ⤢
                    </button>
                  </div>
                  <FlowchartView steps={flowSteps} isFatMethod={fatMethod} />
                  {isFlowModalOpen && (
                    <FlowchartModal
                      steps={flowSteps}
                      title={node.label}
                      isFatMethod={fatMethod}
                      onClose={() => setIsFlowModalOpen(false)}
                    />
                  )}
                </div>
              )}

              {sequenceDiagram && (
                <div className="sidebar-section sidebar-section--sequence">
                  <div className="sidebar-section-header">
                    <h3>Sequence Diagram</h3>
                    <button
                      className="flow-popup-btn"
                      title="Open in large view"
                      onClick={() => setIsSeqModalOpen(true)}
                    >
                      ⤢
                    </button>
                  </div>
                  <SequenceDiagramView
                    diagram={sequenceDiagram}
                    title={node.label}
                    theme={theme}
                  />
                  {isSeqModalOpen && (
                    <SequenceDiagramModal
                      diagram={sequenceDiagram}
                      title={node.label}
                      theme={theme}
                      onClose={() => setIsSeqModalOpen(false)}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Source tab ── */}
          {safeTab === 'source' && filePath && (
            <div className="sidebar-section sidebar-section--source">
              <div className="sidebar-section-header">
                <h3>Source Code</h3>
                <button
                  className="flow-popup-btn"
                  title="Open in large view"
                  onClick={() => setIsSourceModalOpen(true)}
                >
                  ⤢
                </button>
              </div>
              <SourceView filePath={filePath} highlightLine={highlightLine} theme={theme} />
              {isSourceModalOpen && (
                <SourceModal
                  filePath={filePath}
                  highlightLine={highlightLine}
                  theme={theme}
                  onClose={() => setIsSourceModalOpen(false)}
                />
              )}
            </div>
          )}

          {/* ── Edges tab ── */}
          {safeTab === 'edges' && (
            <>
              {outgoingEdges.length > 0 && (
                <div className="sidebar-section">
                  <h3>Outgoing ({outgoingEdges.length})</h3>
                  {outgoingEdges.map((e) => {
                    const target = nodeMap.get(e.target)
                    return (
                      <div key={e.id} className="edge-row">
                        <span className="edge-label">{e.label}</span>
                        <span className="edge-target">{target?.label ?? e.target}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {incomingEdges.length > 0 && (
                <div className="sidebar-section">
                  <h3>Incoming ({incomingEdges.length})</h3>
                  {incomingEdges.map((e) => {
                    const source = nodeMap.get(e.source)
                    return (
                      <div key={e.id} className="edge-row">
                        <span className="edge-target">{source?.label ?? e.source}</span>
                        <span className="edge-label">{e.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Stress tab ── */}
          {safeTab === 'stress' && isRoute && selectedId && (
            <StressTestPanel
              key={selectedId}
              method={String(node.data?.method ?? 'GET')}
              uri={String(node.data?.uri ?? '/')}
              theme={theme}
              selectedId={selectedId}
              onStressChange={onStressChange}
            />
          )}

        </div>
      </div>
    </div>
  )
}
