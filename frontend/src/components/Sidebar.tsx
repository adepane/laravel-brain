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
const DEFAULT_WIDTH = 300

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
  model:      '#F44336',
  event:      '#FFD600',
  job:        '#607D8B',
  command:    '#14b8a6',
  channel:    '#8b5cf6',
  schedule:   '#f97316',
}

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

  const [sourceOpen, setSourceOpen] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false)
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false)
  const [seqOpen, setSeqOpen] = useState(false)
  const [isSeqModalOpen, setIsSeqModalOpen] = useState(false)
  const [aiCopied, setAiCopied] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  // Adjust state during render when selection changes (avoids Effect cascading render)
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId)
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId)
    setSourceOpen(false)
    setFlowOpen(false)
    setIsFlowModalOpen(false)
    setIsSourceModalOpen(false)
    setSeqOpen(false)
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

  const displayData = Object.entries(node.data ?? {}).filter(
    ([key, val]) =>
      key !== 'flowSteps' &&
      key !== 'metrics' &&
      key !== 'fatMethod' &&
      key !== 'fatClass' &&
      key !== 'classMetrics' &&
      key !== 'dbQueries' &&
      !(Array.isArray(val) && val.length === 0)
  )

  return (
    <div className="sidebar-resizable" style={{ width }}>
      <div className="sidebar-drag-handle" onMouseDown={onMouseDown} title="Drag to resize" />
      <div className="sidebar">
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
          <h2>{node.label}</h2>
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

        {/* Code Metrics */}
        {metrics && (
          <div className="sidebar-section sidebar-section--metrics">
            <h3>Code Metrics</h3>
            <div className="metrics-grid">
              <div className="metric-item">
                <span className="metric-value">{metrics.lineCount}</span>
                <span className="metric-label">Lines</span>
              </div>
              <div className="metric-item">
                <span className="metric-value" style={{ color: metrics.cyclomaticComplexity > 10 ? '#FF6D00' : 'inherit' }}>
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

        {/* Flowchart — shown first for action/service/repository nodes */}
        {flowSteps.length > 0 && (
          <div className="sidebar-section sidebar-section--flowchart">
            <div className="source-toggle-wrapper">
              <div className="source-toggle" onClick={() => setFlowOpen((o) => !o)}>
                <h3>Method Flow</h3>
                <span className={`source-toggle-icon${flowOpen ? ' source-toggle-icon--open' : ''}`} />
              </div>
              <button
                className="flow-popup-btn"
                title="Open in large view"
                onClick={() => setIsFlowModalOpen(true)}
              >
                ⤢
              </button>
            </div>

            {flowOpen && <FlowchartView steps={flowSteps} isFatMethod={fatMethod} />}

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

        {/* Sequence Diagram — only for route nodes */}
        {sequenceDiagram && (
          <div className="sidebar-section sidebar-section--sequence">
            <div className="source-toggle-wrapper">
              <div className="source-toggle" onClick={() => setSeqOpen((o) => !o)}>
                <h3>Sequence Diagram</h3>
                <span className={`source-toggle-icon${seqOpen ? ' source-toggle-icon--open' : ''}`} />
              </div>
              <button
                className="flow-popup-btn"
                title="Open in large view"
                onClick={() => setIsSeqModalOpen(true)}
              >
                ⤢
              </button>
            </div>

            {seqOpen && (
              <SequenceDiagramView
                diagram={sequenceDiagram}
                title={node.label}
                theme={theme}
              />
            )}

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

        {/* DB Queries */}
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

        <div className="sidebar-section">
          <h3>Properties</h3>
          {displayData.map(([key, val]) => (
            <div key={key} className="prop-row">
              <span className="prop-key">{key}</span>
              <span className="prop-value">
                {Array.isArray(val) ? val.join(', ') || '—' : String(val) || '—'}
              </span>
            </div>
          ))}
        </div>

        {node.type === 'route' && selectedId && (
          <StressTestPanel
            key={selectedId}
            method={String(node.data?.method ?? 'GET')}
            uri={String(node.data?.uri ?? '/')}
            theme={theme}
            selectedId={selectedId}
            onStressChange={onStressChange}
          />
        )}

        {filePath && (
          <div className="sidebar-section sidebar-section--source">
            <div className="source-toggle-wrapper">
              <div className="source-toggle" onClick={() => setSourceOpen((o) => !o)}>
                <h3>Source Code</h3>
                <span className={`source-toggle-icon${sourceOpen ? ' source-toggle-icon--open' : ''}`} />
              </div>
              <button 
                className="flow-popup-btn" 
                title="Open in large view"
                onClick={() => setIsSourceModalOpen(true)}
              >
                ⤢
              </button>
            </div>
            
            {sourceOpen && <SourceView filePath={filePath} highlightLine={highlightLine} theme={theme} />}

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
      </div>
    </div>
  )
}
